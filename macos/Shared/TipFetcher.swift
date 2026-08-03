import Foundation

/** One hourly AI health tip, as stored by the backend. */
struct Tip: Codable, Identifiable {
    let id: String
    let content: String
    let generatedAt: String
}

private struct TipPage: Codable {
    let items: [Tip]
}

/** Fetches the latest health tip from the backend. Shared by the app and
 *  the widget (backend URL + device key are baked into each Info.plist at
 *  build time via Shared.xcconfig). */
enum TipFetcher {
    static func latest() async throws -> Tip {
        let info = Bundle.main.infoDictionary
        let base = (info?["BACKEND_URL"] as? String ?? "http://localhost:3001")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let key = info?["DEVICE_API_KEY"] as? String ?? "dev-device-key"

        guard let url = URL(string: "\(base)/api/health/tips?limit=1&offset=0") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.setValue(key, forHTTPHeaderField: "X-Device-Key")
        request.timeoutInterval = 15

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw NSError(domain: "TipFetcher", code: (response as? HTTPURLResponse)?.statusCode ?? -1)
        }
        let page = try JSONDecoder().decode(TipPage.self, from: data)
        guard let tip = page.items.first else {
            throw NSError(domain: "TipFetcher", code: 404)
        }
        return tip
    }

    /// "14:05" style clock time from an ISO timestamp.
    static func clockTime(fromISO iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: iso) ?? Date()
        return date.formatted(date: .omitted, time: .shortened)
    }
}
