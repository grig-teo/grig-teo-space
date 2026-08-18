import Foundation

/**
 Fetches the rolling-window time series for one ring metric from the
 device-key-guarded `/api/health/series?metric=…&days=…` endpoint. One
 instance per metric detail view (not a singleton — each page owns its
 range state), but the request pattern mirrors the other clients: base
 URL + `X-Device-Key` from `AppSettings`.
 */
@MainActor
final class MetricSeriesClient: ObservableObject {
    @Published private(set) var series: MetricSeries?
    @Published private(set) var isLoading = false
    @Published var lastError: String?

    private let settings = AppSettings.shared

    struct MetricSeries: Decodable {
        let metric: String
        let unit: String?
        let windowDays: Int
        let summary: Summary
        let points: [Point]

        struct Summary: Decodable {
            let count: Int
            let avg: Double?
            let min: Double?
            let max: Double?
        }

        struct Point: Decodable, Identifiable {
            let recordedAt: String
            let value: Double

            var id: String { recordedAt }

            /// Parsed reading time, or nil when the timestamp is malformed.
            var date: Date? {
                ISO8601DateFormatter.shared.date(from: recordedAt)
            }
        }
    }

    /** Loads the series for `metric` over the last `days` days. */
    func load(metric: RingMetric, days: Int) async {
        isLoading = true
        lastError = nil
        do {
            series = try await fetch("/api/health/series?metric=\(metric.rawValue)&days=\(days)")
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
