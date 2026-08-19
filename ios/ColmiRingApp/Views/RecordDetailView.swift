import SwiftUI
import UIKit

/**
 Full document detail: a gallery of every scanned page plus a share button to
 save them to Photos/Files. Reached by tapping a record row.

 Page images are served as public URLs (the documents bucket is public-read),
 so they load directly via AsyncImage — no device key needed for the image
 bytes, only for the detail JSON.
 */
struct RecordDetailView: View {
    let documentId: String
    let title: String

    @StateObject private var client = DocumentsClient.shared
    @State private var detail: DocumentDetail?
    @State private var error: String?
    @State private var isLoading = false
    @State private var shareItems: [Any]?
    @State private var preparingShare = false

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 12), count: 2)

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if let detail {
                    gallery(detail.pages)
                } else if isLoading {
                    ProgressView().padding(.top, 60)
                } else if let error {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.red)
                        .padding()
                }
            }
            .padding()
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            if detail != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await shareAll() }
                    } label: {
                        if preparingShare {
                            ProgressView()
                        } else {
                            Image(systemName: "square.and.arrow.up")
                        }
                    }
                    .disabled(preparingShare)
                }
            }
        }
        .task { await load() }
        .sheet(item: Binding(get: {
            shareItems.map { ShareItems(items: $0) }
        }, set: { _ in shareItems = nil })) { wrapper in
            ShareSheet(items: wrapper.items)
        }
    }

    // MARK: - Gallery

    @ViewBuilder
    private func gallery(_ pages: [DocumentPage]) -> some View {
        if pages.isEmpty {
            Text("No pages")
                .foregroundColor(.secondary)
        } else {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(pages.sorted { $0.pageNumber < $1.pageNumber }) { page in
                    NavigationLink {
                        FullPageView(urlString: page.imageUrl, pageNumber: page.pageNumber)
                    } label: {
                        pageThumb(page)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func pageThumb(_ page: DocumentPage) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            AsyncImage(url: URL(string: page.imageUrl)) { phase in
                switch phase {
                case .empty:
                    Rectangle()
                        .fill(Color(.secondarySystemBackground))
                        .aspectRatio(3/4, contentMode: .fit)
                        .overlay(ProgressView())
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                        .aspectRatio(3/4, contentMode: .fill)
                        .clipped()
                default:
                    Rectangle()
                        .fill(Color(.secondarySystemBackground))
                        .aspectRatio(3/4, contentMode: .fit)
                        .overlay(
                            Image(systemName: "photo")
                                .font(.title)
                                .foregroundColor(.secondary)
                        )
                }
            }
            .cornerRadius(10)

            Text("Page \(page.pageNumber)")
                .font(.caption.bold())
                .foregroundColor(.secondary)
        }
    }

    // MARK: - Actions

    private func load() async {
        isLoading = true
        error = nil
        do {
            detail = try await client.detail(documentId: documentId)
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    /// Downloads every page image, then presents the share sheet so the user
    /// can save them to Photos, Files, or send them on.
    private func shareAll() async {
        guard let detail, !preparingShare else { return }
        preparingShare = true
        var items: [Any] = []
        for page in detail.pages.sorted(by: { $0.pageNumber < $1.pageNumber }) {
            if let url = URL(string: page.imageUrl),
               let (data, _) = try? await URLSession.shared.data(from: url),
               let image = UIImage(data: data) {
                items.append(image)
            }
        }
        preparingShare = false
        if !items.isEmpty {
            shareItems = items
        }
    }
}

// MARK: - Full page view

/// Full-screen, zoomable single page.
struct FullPageView: View {
    let urlString: String
    let pageNumber: Int

    @State private var scale: CGFloat = 1

    var body: some View {
        AsyncImage(url: URL(string: urlString)) { phase in
            switch phase {
            case .empty:
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case .success(let image):
                image
                    .resizable()
                    .scaledToFit()
                    .scaleEffect(scale)
                    .gesture(
                        MagnificationGesture()
                            .onChanged { scale = max(1, min($0, 5)) }
                            .onEnded { _ in if scale < 1.2 { withAnimation { scale = 1 } } }
                    )
            default:
                Image(systemName: "photo")
                    .font(.largeTitle)
                    .foregroundColor(.secondary)
            }
        }
        .background(Color(.systemBackground))
        .navigationTitle("Page \(pageNumber)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
    }
}

/// Wrapper to present [Any] share items via a sheet item binding.
private struct ShareItems: Identifiable {
    let id = UUID()
    let items: [Any]
}
