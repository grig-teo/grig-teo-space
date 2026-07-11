import SwiftUI

/**
 Records page: list of scanned health documents with search, infinite-scroll
 pagination, a FAB to scan a new document, and an AI-doctor chat button.

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

    @State private var showingScanner = false
    @State private var showingChat = false
    @State private var scanState: ScanState = .idle

    enum ScanState: Equatable {
        case idle
        case recognizing
        case uploading
        case done(String?)
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                if items.isEmpty && !isLoading {
                    emptyState
                }
                ForEach(items) { item in
                    RecordRow(item: item)
                        .onAppear { loadMoreIfNeeded(currentItem: item) }
                }
                if isLoading {
                    ProgressView()
                        .padding(.vertical, 16)
                }
                if let error {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.red)
                        .padding(.horizontal)
                }
            }
            .padding(.top, 8)
        }
        .navigationTitle("Records")
        .searchable(text: $query, prompt: "Search documents")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingChat = true
                } label: {
                    Image(systemName: "stethoscope")
                }
            }
        }
        .overlay(alignment: .bottomTrailing) {
            Button {
                showingScanner = true
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 56, height: 56)
                    .background(Circle().fill(Color.accentColor).shadow(radius: 4, y: 2))
            }
            .padding(20)
        }
        .sheet(isPresented: $showingScanner) {
            ScannerView { image in
                handleScan(image)
            }
        }
        .sheet(isPresented: $showingChat) {
            RecordsChatView()
        }
        .overlay {
            if case .recognizing = scanState { scanOverlay("Recognizing text…") }
            if case .uploading = scanState { scanOverlay("Uploading…") }
            if case .done(let msg) = scanState {
                scanOverlay(msg ?? "Done")
                    .onAppear {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { scanState = .idle }
                    }
            }
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

    private func scanOverlay(_ text: String) -> some View {
        VStack(spacing: 16) {
            ProgressView()
            Text(text).font(.subheadline)
        }
        .padding(28)
        .background(RoundedRectangle(cornerRadius: 16).fill(.ultraThinMaterial))
    }

    // MARK: - Data

    private func reload() {
        guard !isLoading else { return }
        page = 1
        hasMore = true
        items = []
        Task { await load(page: 1) }
    }

    private func loadMoreIfNeeded(currentItem: DocumentItem) {
        guard hasMore, !isLoading else { return }
        // Trigger near the last item.
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

    // MARK: - Scan → OCR → upload

    private func handleScan(_ image: UIImage) {
        scanState = .recognizing
        Task {
            let text = await TextRecognizer.recognizeText(in: image)
            scanState = .uploading
            do {
                let title = titleFrom(text: text)
                if let jpegData = image.jpegData(compressionQuality: 0.8) {
                    try await client.upload(imageData: jpegData, ocrText: text, title: title, language: nil)
                }
                scanState = .done("Saved")
                reload()
            } catch {
                scanState = .done("Upload failed: \(error.localizedDescription)")
            }
        }
    }

    private func titleFrom(text: String) -> String? {
        let firstLine = text.split(separator: "\n").first.map(String.init)?.trimmingCharacters(in: .whitespaces)
        guard let line = firstLine, !line.isEmpty else { return nil }
        return line.count > 80 ? String(line.prefix(80)) + "…" : line
    }
}

/** A single document row: icon + title + snippet + date. */
struct RecordRow: View {
    let item: DocumentItem

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "doc.text.fill")
                    .font(.title2)
                    .foregroundColor(.teal)
                    .frame(width: 36)
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title).font(.body.bold())
                    if !item.snippet.isEmpty {
                        Text(item.snippet)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(3)
                    }
                    Text(formattedDate)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
        .padding(.horizontal)
    }

    private var formattedDate: String {
        ISO8601DateFormatter.shared.date(from: item.recordedAt)?.formatted(date: .abbreviated, time: .shortened) ?? item.recordedAt
    }
}
