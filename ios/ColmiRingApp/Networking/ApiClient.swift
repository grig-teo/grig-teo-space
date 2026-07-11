import Foundation
import Combine

/**
 Talks to the backend health endpoints. Batches readings, retries on failure,
 and keeps pending readings on disk so nothing is lost if the phone is offline.
 */
@MainActor
final class ApiClient: ObservableObject {
    static let shared = ApiClient()

    @Published private(set) var lastSyncAt: Date?
    @Published private(set) var pendingCount: Int = 0
    @Published private(set) var lastError: String?

    private let settings = AppSettings.shared
    private var bag = Set<AnyCancellable>()
    private let pendingURL: URL = {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent("pending_readings.json")
    }()

    private init() {}

    /// Subscribe to a readings stream and forward to the backend.
    func subscribe(to readings: some Publisher<HealthReading, Never>) {
        readings
            .sink { [weak self] reading in
                self?.enqueue(reading)
            }
            .store(in: &bag)
    }

    /// Manually trigger a flush of all pending readings (Sync now button).
    func syncNow() async {
        await flush()
    }

    // MARK: - Queue + persistence

    private func enqueue(_ reading: HealthReading) {
        var pending = loadPending()
        pending.append(reading)
        savePending(pending)
        pendingCount = pending.count

        Task { await flush() }
    }

    private func flush() async {
        var pending = loadPending()
        guard !pending.isEmpty else { return }

        // The backend expects { "readings": [...] }. JSONSerialization cannot
        // encode Swift structs (it would throw an Obj-C NSInvalidArgumentException
        // that Swift can't catch, crashing the app), so encode with JSONEncoder
        // then wrap in the outer object.
        let readingsData: Data
        do {
            readingsData = try JSONEncoder().encode(pending)
        } catch {
            lastError = "Failed to encode readings: \(error.localizedDescription)"
            return
        }
        guard let readingsArray = try? JSONSerialization.jsonObject(with: readingsData) as? [Any],
              let body = try? JSONSerialization.data(withJSONObject: ["readings": readingsArray])
        else { return }

        let urlString = settings.backendURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(urlString)/api/health/readings") else {
            lastError = "Invalid backend URL"
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(settings.deviceKey, forHTTPHeaderField: "X-Device-Key")
        request.httpBody = body

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) {
                pending.removeFirst(min(pending.count, 200))
                savePending(pending)
                pendingCount = pending.count
                lastSyncAt = Date()
                lastError = nil
            } else {
                let code = (response as? HTTPURLResponse)?.statusCode ?? -1
                lastError = "Server rejected upload (HTTP \(code))"
            }
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func loadPending() -> [HealthReading] {
        guard let data = try? Data(contentsOf: pendingURL),
              let decoded = try? JSONDecoder().decode([HealthReading].self, from: data)
        else { return [] }
        return decoded
    }

    private func savePending(_ readings: [HealthReading]) {
        if let data = try? JSONEncoder().encode(readings) {
            try? FileManager.default.createDirectory(
                at: pendingURL.deletingLastPathComponent(),
                withIntermediateDirectories: true,
            )
            try? data.write(to: pendingURL, options: .atomic)
        }
    }
}
