import Foundation
import SwiftUI

/**
 Downloads CV PDFs from the backend's public `/api/cv?locale=` endpoint.

 No device key is required — the CV endpoint is public (same as the website's
 download). Downloads land in the app's Documents directory and are offered to
 the user via the standard iOS share sheet.
 */
/** Wrapper so a downloaded file URL can drive a `.sheet(item:)` binding. */
struct SharedItem: Identifiable {
    let id = UUID()
    let url: URL
}

@MainActor
final class ProfileClient: ObservableObject {
    static let shared = ProfileClient()

    @Published var downloadingLanguage: String?
    @Published var lastError: String?
    @Published var sharedItem: SharedItem?

    private let settings = AppSettings.shared

    /// Downloads the CV for the given language, then presents a share sheet.
    func downloadCV(language: CVLanguage) {
        guard downloadingLanguage == nil else { return }
        downloadingLanguage = language.rawValue
        lastError = nil

        Task {
            do {
                let url = try await fetchCV(locale: language.rawValue)
                sharedItem = SharedItem(url: url)
            } catch {
                lastError = error.localizedDescription
            }
            downloadingLanguage = nil
        }
    }

    private func fetchCV(locale: String) async throws -> URL {
        let base = settings.backendURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(base)/api/cv?locale=\(locale)") else {
            throw URLError(.badURL)
        }

        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw URLError(URLError.Code(rawValue: code))
        }

        // Persist to Documents so the file is real and shareable.
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let fileURL = docs.appendingPathComponent("CV_grig-teo_\(locale).pdf")
        try data.write(to: fileURL, options: .atomic)
        return fileURL
    }
}
