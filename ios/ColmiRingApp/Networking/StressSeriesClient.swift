import Foundation

/**
 Fetches today's stress readings bucketed by hour from the device-key-guarded
 `/api/health/hourly?metric=stress&days=1` endpoint. Drives the hourly bar chart
 on the Profile page. Mirrors the singleton client pattern used by the other
 networking clients (base URL + `X-Device-Key` from `AppSettings`).
 */
@MainActor
final class StressSeriesClient: ObservableObject {
    static let shared = StressSeriesClient()

    @Published private(set) var series: StressSeries?
    @Published private(set) var isLoading = false
    @Published var lastError: String?

    private let settings = AppSettings.shared

    struct StressSeries: Codable {
        let metric: String
        let unit: String?
        let buckets: [Bucket]

        struct Bucket: Codable, Identifiable {
            var id: Int { hour }
            /// Hour of day 0–23.
            let hour: Int
            /// Average stress for that hour, or nil if the hour had no readings.
            let value: Double?
            let count: Int
        }
    }

    /** Loads today's hourly stress averages. */
    func load() async {
        isLoading = true
        lastError = nil
        do {
            series = try await fetch("/api/health/hourly?metric=stress&days=1")
        } catch {
            lastError = error.localizedDescription
        }
        isLoading = false
    }

    private func fetch<T: Decodable>(_ path: String) async throws -> T {
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
        return try JSONDecoder().decode(T.self, from: data)
    }
}
