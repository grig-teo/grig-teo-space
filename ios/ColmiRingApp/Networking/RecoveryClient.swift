import Foundation

/**
 Fetches the morning recovery score and deviation alerts from
 `GET /api/health/recovery`. Drives the Recovery card on the Profile page;
 alerts are handed to `NotificationManager` for local notifications.
 */
@MainActor
final class RecoveryClient: ObservableObject {
    static let shared = RecoveryClient()

    @Published private(set) var recovery: Recovery?
    @Published private(set) var isLoading = false

    private let settings = AppSettings.shared

    struct Recovery: Decodable {
        let score: Int
        let label: String
        let generatedAt: String
        let components: Components
        let alerts: [String]

        struct Components: Decodable {
            let sleepScore: Int?
            let hrv: Pair
            let restingHr: Pair

            struct Pair: Decodable {
                let current: Double?
                let baseline: Double?
            }
        }
    }

    /** Loads the current recovery score. */
    func load() async {
        isLoading = true
        defer { isLoading = false }
        guard let url = URL(string: "\(settings.backendURL)/api/health/recovery") else { return }
        var req = URLRequest(url: url)
        req.setValue(settings.deviceKey, forHTTPHeaderField: "X-Device-Key")
        guard let (data, response) = try? await URLSession.shared.data(for: req),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let decoded = try? JSONDecoder().decode(Recovery.self, from: data)
        else { return }
        recovery = decoded
        NotificationManager.shared.notifyNewAlerts(decoded.alerts, stamp: decoded.generatedAt)
    }
}
