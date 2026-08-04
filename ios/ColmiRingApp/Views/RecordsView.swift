import SwiftUI

/**
 Records page: list of scanned health documents with search, infinite-scroll
 pagination, swipe-to-delete, and a FAB to scan a new (possibly multi-page)
 document. The AI-doctor chat now lives on the Health hub (bottom-right button).

 Reached from the Health hub → "Records" button.
 */
struct RecordsView: View {
    @StateObject private var client = DocumentsClient.shared

    @State private var items: [DocumentItem] = []
    @State private var query: String = ""
    @State private var page: Int = 1
    @State private var hasMore: Bool = true
    @State private var isLoading: Bool = false
    @State private var error: String?

    @State private var showingBuilder = false
    @State private var deletedIds = Set<String>()

    var body: some View {
        List {
            if items.isEmpty && !isLoading {
                emptyState
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }
            ForEach(items) { item in
                NavigationLink {
                    RecordDetailView(documentId: item.id, title: item.title)
                } label: {
                    RecordRow(item: item)
                }
                .buttonStyle(.plain)
                .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
                .listRowSeparator(.hidden)
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    Button(role: .destructive) {
                        delete(item)
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
                .onAppear { loadMoreIfNeeded(currentItem: item) }
            }
            if isLoading {
                HStack { Spacer(); ProgressView(); Spacer() }
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }
            if let error {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .navigationTitle("Records")
        .searchable(text: $query, prompt: "Search documents")
        .overlay(alignment: .bottomTrailing) {
            Button {
                showingBuilder = true
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 56, height: 56)
                    .background(Circle().fill(Color.accentColor).shadow(radius: 4, y: 2))
            }
            .padding(20)
        }
        .sheet(isPresented: $showingBuilder) {
            DocumentBuilderView { reload() }
        }
        .onAppear { if items.isEmpty { reload() } }
        .onChange(of: query) { _ in reload() }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 44))
                .foregroundColor(.secondary)
            Text("No documents yet")
                .font(.headline)
            Text("Tap + to scan a medical document.")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .padding(.top, 60)
    }

    // MARK: - Data

    private func reload() {
        guard !isLoading else { return }
        page = 1
        hasMore = true
        items = []
        deletedIds.removeAll()
        Task { await load(page: 1) }
    }

    private func loadMoreIfNeeded(currentItem: DocumentItem) {
        guard hasMore, !isLoading else { return }
        let thresholdIndex = items.index(items.endIndex, offsetBy: -3, limitedBy: items.startIndex) ?? items.startIndex
        if currentItem.id == items[thresholdIndex].id {
            Task { await load(page: page + 1) }
        }
    }

    private func load(page target: Int) async {
        isLoading = true
        error = nil
        do {
            let result = try await client.list(query: query, page: target)
            if target == 1 { items = result.items } else { items.append(contentsOf: result.items) }
            page = result.page
            hasMore = result.hasMore
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    private func delete(_ item: DocumentItem) {
        // Optimistic removal.
        deletedIds.insert(item.id)
        withAnimation { items.removeAll { $0.id == item.id } }
        Task {
            do {
                try await client.delete(documentId: item.id)
            } catch {
                // Restore on failure.
                let message = error.localizedDescription
                await MainActor.run {
                    deletedIds.remove(item.id)
                    self.error = "Delete failed: \(message)"
                    reload()
                }
            }
        }
    }
}

/** A single document row: icon + title + snippet + date + page badge. */
struct RecordRow: View {
    let item: DocumentItem

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "doc.text.fill")
                .font(.title2)
                .foregroundColor(.teal)
                .frame(width: 36)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(item.title)
                        .font(.body.bold())
                        .lineLimit(1)
                    if item.pageCount > 1 {
                        Text("\(item.pageCount)p")
                            .font(.caption2.bold())
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.teal))
                    }
                }
                // Always reserve 2 lines of snippet space so every row is the
                // same height, whether the snippet is short, long, or empty.
                Text(item.snippet.isEmpty ? "—" : item.snippet)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(formattedDate)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .frame(height: 96)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
    }

    private var formattedDate: String {
        ISO8601DateFormatter.shared.date(from: item.recordedAt)?.dateTime24(dateStyle: .medium) ?? item.recordedAt
    }
}
