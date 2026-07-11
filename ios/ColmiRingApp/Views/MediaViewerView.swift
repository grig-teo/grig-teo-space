import SwiftUI
import AVKit
import UIKit

/**
 Full-screen viewer for a single asset. Plays locally from the PHAsset — no
 network needed. Photos support pinch-zoom + pan; videos use AVKit's VideoPlayer
 with an AVPlayerItem built directly from the asset.

 Swipe/drag down dismisses (sheet-style), matching common gallery UX.
 */
struct MediaViewerView: View {
    let snapshot: MediaLibraryWrapper.AssetSnapshot

    @State private var image: UIImage?
    @State private var player: AVPlayer?
    @State private var scale: CGFloat = 1
    @State private var dragOffset: CGSize = .zero

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        GeometryReader { geo in
            Color.black.ignoresSafeArea().overlay(
                gestureContent(geo)
            )
        }
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { load() }
    }

    @ViewBuilder
    private func gestureContent(_ geo: GeometryProxy) -> some View {
        switch snapshot.kind {
        case .photo:
            photoContent(geo)
        case .video:
            videoContent
        }
    }

    private func photoContent(_ geo: GeometryProxy) -> some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .offset(dragOffset)
                    .scaleEffect(scale)
                    .gesture(
                        MagnificationGesture()
                            .onChanged { scale = max(1, min($0, 5)) }
                            .onEnded { _ in
                                if scale < 1.2 { withAnimation { scale = 1 } }
                            }
                    )
                    .simultaneousGesture(
                        DragGesture()
                            .onChanged { dragOffset = $0.translation }
                            .onEnded { value in
                                if abs(value.translation.height) > 120 {
                                    dismiss()
                                } else {
                                    withAnimation { dragOffset = .zero }
                                }
                            }
                    )
                    .opacity(1 - min(abs(dragOffset.height) / 400, 0.4))
            } else {
                ProgressView().tint(.white)
            }
        }
    }

    private var videoContent: some View {
        Group {
            if let player {
                VideoPlayer(player: player)
                    .onAppear { player.play() }
            } else {
                ProgressView().tint(.white)
            }
        }
    }

    private func load() {
        switch snapshot.kind {
        case .photo:
            MediaLibraryWrapper.shared.requestFullImage(for: snapshot.id) { img in
                self.image = img
            }
        case .video:
            Task {
                if let item = await MediaLibraryWrapper.shared.playerItem(for: snapshot.id) {
                    self.player = AVPlayer(playerItem: item)
                }
            }
        }
    }
}
