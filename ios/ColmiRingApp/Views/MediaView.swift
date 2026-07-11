import SwiftUI
import Photos

/**
 Media tab: a grid of the device's photo/video library with a sync FAB.

   - Grid cells render a thumbnail from the local PHAsset, with an "uploaded ✓"
     badge when the asset is already backed up and a ▶ + duration overlay on
     videos.
   - The bottom-right FAB starts/stops a backup run. While syncing, the top bar
     shows progress (uploaded/total).
   - Tap a cell → MediaViewerView (full-screen local playback, no network).

 The syncer is shared (`MediaSyncer.shared`); a run is also kicked off on view
 appear via `.task` (the periodic BG task and the FAB are the other triggers).
 */
struct MediaView: View {
    @ObservedObject var library = MediaLibraryWrapper.shared
    @ObservedObject var syncer = MediaSyncer.shared

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 3), count: 3)

    @State private var snapshots: [MediaLibraryWrapper.AssetSnapshot] = []

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Media")
                .overlay(alignment: .bottomTrailing) { fab }
                .task { await refresh() }
                .onChange(of: library.access) { _ in
                    Task { await refresh() }
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch library.access {
        case .full, .limited:
            if snapshots.isEmpty {
                emptyState
            } else {
                    ScrollView {
                    LazyVGrid(columns: columns, spacing: 3) {
                        ForEach(snapshots) { snapshot in
                            NavigationLink {
                                MediaViewerView(snapshot: snapshot)
                            } label: {
                                MediaThumbnailCell(snapshot: snapshot, uploaded: syncer.isUploaded(snapshot.id))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.bottom, 96) // clearance for the FAB
                }
            }
        case .denied:
            deniedState
        case .notDetermined:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "photo.on.rectangle.angled")
                .font(.system(size: 48))
                .foregroundColor(.secondary)
            Text("No photos or videos found")
                .font(.headline)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var deniedState: some View {
        VStack(spacing: 16) {
            Image(systemName: "lock.shield")
                .font(.system(size: 48))
                .foregroundColor(.secondary)
            Text("Photo library access is required to back up your media.")
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
                .padding(.horizontal)
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - FAB

    private var fab: some View {
        VStack(alignment: .trailing, spacing: 12) {
            if syncer.isBusy {
                progressPill
            } else if let error = statusMessage {
                statusBanner(error)
            }
            Button {
                Task {
                    if syncer.isBusy { syncer.stop() }
                    else { await syncer.startSync() }
                }
            } label: {
                Image(systemName: syncer.isBusy ? "xmark.circle.fill" : "arrow.triangle.2.circlepath.circle.fill")
                    .font(.system(size: 30))
                    .frame(width: 60, height: 60)
                    .foregroundColor(.white)
                    .background(Circle().fill(syncer.isBusy ? Color.red : Color.blue))
                    .shadow(radius: 4, y: 2)
            }
            .padding(.trailing, 20)
            .padding(.bottom, 24)
        }
    }

    /// Human-readable status text: failure reasons take priority so they're
    /// impossible to miss (e.g. wrong backend URL, network/auth errors).
    private var statusMessage: String? {
        switch syncer.status {
        case .failed(let msg): return "Sync failed: \(msg)"
        default:
            if syncer.failedCount > 0 {
                return "\(syncer.failedCount) item(s) failed — last: \(syncer.lastError ?? "unknown")"
            }
            return nil
        }
    }

    private func statusBanner(_ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.orange)
            Text(text)
                .font(.footnote.bold())
                .lineLimit(2)
                .multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Capsule().fill(Color(.systemBackground)).shadow(radius: 3, y: 1))
        .frame(maxWidth: 260, alignment: .trailing)
        .padding(.trailing, 20)
    }

    private var progressPill: some View {
        HStack(spacing: 8) {
            ProgressView()
                .scaleEffect(0.8)
            Text("\(syncer.uploadedCount) / \(syncer.totalCount)")
                .font(.footnote.bold())
            if syncer.failedCount > 0 {
                Text("· \(syncer.failedCount) failed")
                    .font(.caption2)
                    .foregroundColor(.orange)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Capsule().fill(Color(.systemBackground)).shadow(radius: 3, y: 1))
        .padding(.trailing, 20)
    }

    private func refresh() async {
        let access = await library.requestAccess()
        guard access == .full || access == .limited else { return }
        snapshots = library.allSnapshots()
        await syncer.syncIfNeeded()
    }
}

// MARK: - Thumbnail cell

struct MediaThumbnailCell: View {
    let snapshot: MediaLibraryWrapper.AssetSnapshot
    let uploaded: Bool

    @State private var thumbnail: UIImage?

    private let thumbSize = CGSize(width: 300, height: 300) // @2x for ~100pt cells

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            if let thumbnail {
                Image(uiImage: thumbnail)
                    .resizable()
                    .scaledToFill()
                    .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0)
                    .aspectRatio(1, contentMode: .fill)
                    .clipped()
            } else {
                Rectangle()
                    .fill(Color(.secondarySystemBackground))
                    .aspectRatio(1, contentMode: .fill)
                    .overlay(ProgressView().scaleEffect(0.6))
            }

            // Video badge
            if snapshot.kind == .video {
                HStack(spacing: 4) {
                    Image(systemName: "play.fill")
                        .font(.caption2)
                    if let duration = snapshot.duration {
                        Text(formatDuration(duration))
                            .font(.caption2.bold())
                    }
                }
                .foregroundColor(.white)
                .shadow(radius: 2)
                .padding(6)
            }

            // Uploaded badge — small green check, top-right, always visible.
            if uploaded {
                Image(systemName: "checkmark.fill")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
                    .padding(4)
                    .background(Circle().fill(Color.green))
                    .overlay(Circle().stroke(Color.white, lineWidth: 1))
                    .shadow(radius: 1, y: 0.5)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(5)
                    .transition(.opacity)
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .clipped()
        .onAppear { loadThumbnail() }
        .animation(.easeInOut(duration: 0.2), value: uploaded)
    }

    private func loadThumbnail() {
        guard thumbnail == nil else { return }
        MediaLibraryWrapper.shared.requestThumbnail(for: snapshot.id, targetSize: thumbSize) { image in
            self.thumbnail = image
        }
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let s = Int(seconds)
        return s >= 60 ? "\(s / 60):\(String(format: "%02d", s % 60))" : "\(s)s"
    }
}
