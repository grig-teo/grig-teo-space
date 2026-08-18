import Foundation

/**
 Reads the weather context endpoints (`/api/health/weather…`): the hourly
 weather series, the latest snapshot, and the weather × health correlations.
 One instance per Weather view (it owns range state), mirroring the
 `MetricSeriesClient` pattern — base URL + `X-Device-Key` from `AppSettings`.
 */
@MainActor
final class WeatherClient: ObservableObject {
    @Published private(set) var series: WeatherSeries?
    @Published private(set) var correlations: Correlations?
    @Published private(set) var isLoading = false
    @Published var lastError: String?

    private let settings = AppSettings.shared

    struct WeatherSeries: Decodable {
        let points: [Point]

        struct Point: Decodable, Identifiable {
            let recordedAt: String
            let temperatureC: Double
            let feelsLikeC: Double?
            let pressureHpa: Double?
            let humidityPct: Double?
            let conditionCode: Int?

            var id: String { recordedAt }
            var date: Date? { ISO8601DateFormatter.shared.date(from: recordedAt) }
        }

        /// Newest point with a parseable date, or nil.
        var current: Point? {
            points.last(where: { $0.date != nil })
        }
    }

    struct Correlations: Decodable {
        let pairs: [Pair]
        let statements: [String]

        struct Pair: Decodable {
            let weather: String
            let metric: String
            let r: Double
            let sampleSize: Int
        }
    }

    /** Loads the weather series for the last `days` days. */
    func load(days: Int) async {
        isLoading = true
        lastError = nil
        do {
            series = try await fetch("/api/health/weather?days=\(days)")
        } catch {
            lastError = error.localizedDescription
        }
        isLoading = false
    }

    /** Loads the correlations (independent of the chart range). */
    func loadCorrelations(days: Int = 30) async {
        correlations = try? await fetch("/api/health/weather/correlations?days=\(days)")
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
