import Foundation

/**
 Reads and writes body stats (height/weight) via the device-key-guarded
 `/api/health/body` endpoints. Mirrors the singleton client pattern used by the
 other networking clients. */
@MainActor
final class BodyStatsClient: ObservableObject {
    static let shared = BodyStatsClient()

    @Published private(set) var stats: BodyStats?
    @Published private(set) var isLoading = false
    @Published var lastError: String?

    private let settings = AppSettings.shared

    struct BodyStats: Codable {
        let heightCm: Int
        let weightKg: Int
        let bmi: Double
        let updatedAt: String
    }

    private struct UpdateBody: Codable {
        let heightCm: Int
        let weightKg: Int
    }

    /** Loads current body stats from the backend. */
    func load() async {
        isLoading = true
        lastError = nil
        do {
            stats = try await fetch("/api/health/body")
        } catch {
            lastError = error.localizedDescription
        }
        isLoading = false
    }

    /** Persists updated height/weight and refreshes the local stats. */
    func save(heightCm: Int, weightKg: Int) async -> Bool {
        lastError = nil
        let body = UpdateBody(heightCm: heightCm, weightKg: weightKg)
        do {
            let encoded = try JSONEncoder().encode(body)
            stats = try await request("/api/health/body", method: "PUT", body: encoded)
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    private func fetch<T: Decodable>(_ path: String) async throws -> T {
        try await request(path, method: "GET", body: nil)
    }

    private func request<T: Decodable>(_ path: String, method: String, body: Data?) async throws -> T {
        guard let url = URL(string: "\(settings.backendURL)\(path)") else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue(settings.deviceKey, forHTTPHeaderField: "X-Device-Key")
        if body != nil {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = body
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw URLError(URLError.Code(rawValue: code))
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
