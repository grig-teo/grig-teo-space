import SwiftUI
import UIKit

/**
 Multi-page document scanner flow. The user:
 1. Scans/captures the first page (rear camera).
 2. Optionally adds more pages (each captured → OCR'd on-device).
 3. Enters a title and saves the whole document.

 The first page creates the document; each subsequent page appends to it.
 */
struct DocumentBuilderView: View {
    @Environment(\.dismiss) private var dismiss
    var onSaved: () -> Void

    @State private var pages: [ScanPage] = []
    @State private var title: String = ""
    @State private var showingScanner = false
    @State private var pendingImage: UIImage?
    @State private var recognizing = false
    @State private var saving = false
    @State private var error: String?
    @State private var createdDocumentId: String?

    struct ScanPage: Identifiable {
        let id = UUID()
        let image: UIImage
        let text: String
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if pages.isEmpty {
                        emptyState
                    }
                    ForEach(pages) { page in
                        pagePreview(page)
                    }
                    addPageButton
                    if !pages.isEmpty {
                        titleField
                    }
                    if let error {
                        Text(error).font(.caption).foregroundColor(.red)
                    }
                }
                .padding()
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .disabled(saving)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") { save() }
                        .disabled(pages.isEmpty || saving)
                        .bold()
                }
            }
            .overlay {
                if recognizing { overlayProgress("Recognizing text…") }
                if saving { overlayProgress("Saving…") }
            }
            .sheet(isPresented: $showingScanner) {
                ScannerView { image in
                    pendingImage = image
                    process(image: image)
                }
            }
            .onAppear {
                if pages.isEmpty { showingScanner = true }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "doc.viewfinder")
                .font(.system(size: 44))
                .foregroundColor(.secondary)
            Text("Scan the first page")
                .font(.headline)
            Text("Add more pages after if the document has multiple sheets.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 50)
    }

    private func pagePreview(_ page: ScanPage) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(uiImage: page.image)
                .resizable()
                .scaledToFill()
                .frame(width: 70, height: 90)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 4) {
                Text("Page \(pages.firstIndex(where: { $0.id == page.id })! + 1)")
                    .font(.caption.bold())
                    .foregroundColor(.secondary)
                Text(page.text.isEmpty ? "(no text recognized)" : page.text)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(4)
            }
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
    }

    private var addPageButton: some View {
        Button {
            showingScanner = true
        } label: {
            Label(pages.isEmpty ? "Scan page" : "Add another page", systemImage: "camera")
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(RoundedRectangle(cornerRadius: 12).stroke(Color.accentColor, lineWidth: 1.5))
                .foregroundColor(.accentColor)
        }
    }

    private var titleField: some View {
        TextField("Document title (optional)", text: $title)
            .textFieldStyle(.roundedBorder)
    }

    private func overlayProgress(_ text: String) -> some View {
        VStack(spacing: 16) {
            ProgressView()
            Text(text).font(.subheadline)
        }
        .padding(28)
        .background(RoundedRectangle(cornerRadius: 16).fill(.ultraThinMaterial))
    }

    // MARK: - OCR + upload

    private func process(image: UIImage) {
        recognizing = true
        Task {
            let text = await TextRecognizer.recognizeText(in: image)
            await MainActor.run {
                pages.append(ScanPage(image: image, text: text))
                if title.isEmpty { title = titleFrom(text: text) }
                recognizing = false
            }
        }
    }

    private func save() {
        guard !pages.isEmpty, !saving else { return }
        saving = true
        error = nil
        Task {
            do {
                // First page creates the document.
                guard let firstData = pages[0].image.jpegData(compressionQuality: 0.8) else { return }
                let trimmedTitle = title.trimmingCharacters(in: .whitespaces)
                let documentId = try await DocumentsClient.shared.createDocument(
                    imageData: firstData,
                    ocrText: pages[0].text,
                    title: trimmedTitle.isEmpty ? nil : trimmedTitle,
                    language: nil
                )
                // Remaining pages append.
                for page in pages.dropFirst() {
                    guard let data = page.image.jpegData(compressionQuality: 0.8) else { continue }
                    try await DocumentsClient.shared.addPage(to: documentId, imageData: data, ocrText: page.text)
                }
                await MainActor.run {
                    saving = false
                    onSaved()
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    self.error = error.localizedDescription
                    saving = false
                }
            }
        }
    }

    private func titleFrom(text: String) -> String {
        let firstLine = text.split(separator: "\n").first.map(String.init)?.trimmingCharacters(in: .whitespaces) ?? ""
        return firstLine.isEmpty ? "" : (firstLine.count > 80 ? String(firstLine.prefix(80)) + "…" : firstLine)
    }
}
