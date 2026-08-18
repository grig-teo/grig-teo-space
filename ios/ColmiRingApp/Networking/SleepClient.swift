import Foundation

/**
 Two jobs: uploads rich sleep sessions (stage breakdown) parsed from the
 ring's frames to `POST /api/health/sleep`, and fetches the nights +
 aggregates for the Sleep page from `GET /api/health/sleep`. Singleton —
 the upload path is called from BLE code, the view reads the published
 overview. Mirrors the other clients: base URL + `X-Device-Key`.
 */
@MainActor
final class SleepClient: ObservableObject {
    static let shared = SleepClient()

    @Published private(set) var overview: SleepOverview?
    @Published private(set) var isLoading = false
    @Published var lastError: String?

    private let settings = AppSettings.shared

    struct SleepOverview: Decodable {
        let days: Int
        let sessions: [Session]
        let avgScore: Double?
        let avgDurationMin: Int?
        let bedtimeRange: BedtimeRange?
        let debtMin: Int

        struct BedtimeRange: Decodable {
            /// Local minutes after midnight (evening-anchored on the server).
            let earliestMin: Int
            let latestMin: Int
        }
    }

    struct Session: Decodable, Identifiable {
        let startedAt: String
        let endedAt: String
        let durationMin: Int
        let deepMin: Int
        let remMin: Int
        let lightMin: Int
        let awakeMin: Int
        let score: Double

        var id: String { endedAt }
        var start: Date? { ISO8601DateFormatter.shared.date(from: startedAt) }
        var end: Date? { ISO8601DateFormatter.shared.date(from: endedAt) }
    }

    /** Loads the last `days` of nights, bedtimes in local time. */
    func load(days: Int = 7) async {
        isLoading = true
        lastError = nil
        let tzOffset = TimeZone.current.secondsFromGMT() / 60
        do {
            overview = try await fetch("/api/health/sleep?days=\(days)&tzOffset=\(tzOffset)")
        } catch {
            lastError = error.localizedDescription
        }
        isLoading = false
    }

    /** Uploads freshly parsed ring sleep sessions (fire-and-forget; the
     *  backend upserts by night, so re-syncs are safe). */
    func upload(_ sessions: [SleepParser.Session]) {
        guard !sessions.isEmpty,
              let url = URL(string: "\(settings.backendURL)/api/health/sleep") else { return }
        let payload: [[String: Any]] = sessions.map { session in
            [
                "start": ISO8601DateFormatter.shared.string(from: session.start),
                "end": ISO8601DateFormatter.shared.string(from: session.end),
                "deepMin": session.stageMinutes[3, default: 0],
                "remMin": session.stageMinutes[4, default: 0],
                "lightMin": session.stageMinutes[2, default: 0],
                "awakeMin": session.stageMinutes[5, default: 0],
                "score": session.score,
                "raw": ["sleepFrame": session.rawHex],
            ]
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(settings.deviceKey, forHTTPHeaderField: "X-Device-Key")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["sessions": payload])
        guard req.httpBody != nil else { return }
        URLSession.shared.dataTask(with: req).resume()
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
