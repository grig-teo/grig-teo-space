import Foundation

/**
 Fetches persisted health-tip history from `/api/health/tips`. Each hourly AI
 tip is stored on the backend, so this returns a paginated list the Tip page
 renders. */
@MainActor
final class TipClient: ObservableObject {
    static let shared = TipClient()

    @Published private(set) var tips: [Tip] = []
    @Published private(set) var isLoading = false
    @Published private(set) var hasMore = false
    @Published var lastError: String?

    private let settings = AppSettings.shared
    private let pageSize = 20
    private var offset = 0

    struct Tip: Identifiable, Codable {
        let id: String
        let content: String
        let generatedAt: String
    }

    private struct TipPage: Codable {
        let items: [Tip]
        let total: Int
        let hasMore: Bool
    }

    /** Resets and loads the first page. */
    func reload() async {
        offset = 0
        tips = []
        await loadNext()
    }

    /** Loads the next page (appends). No-op if already loading or no more. */
    func loadNext() async {
        guard !isLoading, hasMore || tips.isEmpty else { return }
        isLoading = true
        lastError = nil
        do {
            let page: TipPage = try await fetch(offset: offset)
            tips.append(contentsOf: page.items)
            hasMore = page.hasMore
            offset += page.items.count
        } catch {
            lastError = error.localizedDescription
        }
        isLoading = false
    }

    private func fetch(offset: Int) async throws -> TipPage {
        let path = "/api/health/tips?limit=\(pageSize)&offset=\(offset)"
        guard let url = URL(string: "\(settings.backendURL)\(path)") else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.setValue(settings.deviceKey, forHTTPHeaderField: "X-Device-Key")
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw URLError(URLError.Code(rawValue: code))
        }
        return try JSONDecoder().decode(TipPage.self, from: data)
    }
}
