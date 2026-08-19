import Foundation

/**
 Fetches the engagement endpoints: step-goal streak (`/insights`), the LLM
 weekly digest (`/digest`), auto-detected activities (`/activities`), and
 the year-in-review stats (`/year`). One shared client — the Profile cards
 read insights/digest, the hub pages read activities/year.
 */
@MainActor
final class InsightsClient: ObservableObject {
    static let shared = InsightsClient()

    @Published private(set) var insights: Insights?
    @Published private(set) var digest: WeeklyDigest?
    @Published private(set) var activities: [Activity] = []
    @Published private(set) var year: YearReview?
    @Published private(set) var recentAlerts: [HealthAlert] = []

    private let settings = AppSettings.shared

    struct Insights: Decodable {
        let goalSteps: Int
        let todaySteps: Int
        let todayKm: Double
        let goalReached: Bool
        let streakDays: Int
        let bestStreakDays: Int
    }

    struct WeeklyDigest: Decodable {
        let text: String
        let generatedAt: String
    }

    struct HealthAlert: Decodable, Identifiable {
        let metric: String
        let level: String
        let message: String
        let value: Double
        let recordedAt: String

        var id: String { "\(metric)-\(value)-\(recordedAt)" }
        var date: Date? { ISO8601DateFormatter.shared.date(from: recordedAt) }
    }

    struct Activity: Decodable, Identifiable {
        let start: String
        let end: String
        let steps: Int
        let km: Double
        let avgHr: Int?
        let peakHr: Int?

        var id: String { start }
        var startDate: Date? { ISO8601DateFormatter.shared.date(from: start) }
        var endDate: Date? { ISO8601DateFormatter.shared.date(from: end) }
    }

    struct YearReview: Decodable {
        let daysWithData: Int
        let totalSteps: Int
        let totalKm: Double
        let bestStreakDays: Int
        let bestDay: BestDay?
        let avgSleepScore: Int?
        let avgSleepH: Double?
        let longestActivityMin: Int?

        struct BestDay: Decodable {
            let date: String
            let steps: Int
        }
    }

    /** Streak + today's progress; also fires the goal-reached notification. */
    func loadInsights() async {
        let tz = TimeZone.current.secondsFromGMT() / 60
        guard let value: Insights = try? await fetch("/api/health/insights?tzOffset=\(tz)") else { return }
        insights = value
        NotificationManager.shared.notifyGoalReached(
            steps: value.todaySteps,
            goal: value.goalSteps,
            reached: value.goalReached,
        )
    }

    /** The cached LLM weekly digest. */
    func loadDigest() async {
        digest = try? await fetch("/api/health/digest")
    }

    /** Recent anomaly alerts (24h); fresh ones fire local notifications. */
    func loadAlerts() async {
        let alerts: [HealthAlert] = (try? await fetch("/api/health/alerts?hours=24")) ?? []
        recentAlerts = alerts
        // Only readings from the last 2h notify — older ones are list-only.
        let fresh = alerts.filter { alert in
            guard let date = alert.date else { return false }
            return Date().timeIntervalSince(date) < 2 * 3600
        }
        NotificationManager.shared.notifyAnomalies(fresh.map { alert in
            let time = alert.date?.time24 ?? ""
            return (key: alert.id, text: "\(alert.message) — \(Int(alert.value)) at \(time)")
        })
    }

    /** Logs a quick note ("how I feel, what I ate, plans") — the tip
     *  generator sees the last 24h of these. */
    func addNote(_ text: String) async -> Bool {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty,
              let url = URL(string: "\(settings.backendURL)/api/health/notes") else { return false }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(settings.deviceKey, forHTTPHeaderField: "X-Device-Key")
        req.httpBody = try? JSONEncoder().encode(["content": clean, "source": "ios"])
        guard let (_, response) = try? await URLSession.shared.data(for: req),
              let http = response as? HTTPURLResponse
        else { return false }
        return (200..<300).contains(http.statusCode)
    }

    /** Auto-detected activities for the last `days` days. */
    func loadActivities(days: Int = 7) async {
        activities = (try? await fetch("/api/health/activities?days=\(days)")) ?? []
    }

    /** Year-in-review stats. */
    func loadYear() async {
        let tz = TimeZone.current.secondsFromGMT() / 60
        year = try? await fetch("/api/health/year?tzOffset=\(tz)")
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
