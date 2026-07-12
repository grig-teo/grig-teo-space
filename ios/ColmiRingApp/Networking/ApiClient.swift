import Foundation
import Combine
import UIKit

/**
 Talks to the backend health endpoints. Batches readings, retries on failure,
 and keeps pending readings on disk so nothing is lost if the phone is offline.

 While the app is in the foreground this uses `URLSession.shared`. When
 backgrounded it switches to a background URLSession (`BackgroundUploadSession`)
 so in-flight uploads survive termination and can be retried by iOS.
 */
@MainActor
final class ApiClient: ObservableObject {
    static let shared = ApiClient()

    /// Max readings sent in a single POST (matches the backend's per-request cap).
    private let MAX_READINGS_PER_FLUSH = 2000

    @Published private(set) var lastSyncAt: Date?
    @Published private(set) var pendingCount: Int = 0
    @Published private(set) var lastError: String?

    private let settings: AppSettings
    private var bag = Set<AnyCancellable>()
    /// Serializes flushes so two concurrent uploads can't read the same pending
    /// queue and double-insert the same readings.
    private var flushTask: Task<Void, Never>?
    /// Optional sender stub. When nil (production), `flush()` uses the real
    /// `URLSession`. Tests inject a stub to assert on what would be uploaded
    /// without hitting the network.
    private let send: (@Sendable (URLRequest) async throws -> (Data, URLResponse))?
    private let pendingURL: URL

    private init() {
        self.settings = AppSettings.shared
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        self.pendingURL = appSupport.appendingPathComponent("pending_readings.json")
        self.send = nil
        // Reflect the current queue depth on launch.
        pendingCount = loadPending().count
    }

    /// Test-only initializer: inject a sender stub and a fresh pending-queue
    /// path so tests don't collide with the app's real persisted queue.
    internal init(send: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)) {
        self.settings = AppSettings.shared
        self.send = send
        // Use an isolated queue file per instance so tests are hermetic.
        let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        self.pendingURL = cache.appendingPathComponent("pending_readings_test_\(UUID().uuidString).json")
        self.pendingCount = 0
    }

    /// Picks the appropriate URLSession based on app state. Background uploads
    /// use a background config so they survive termination.
    private var session: URLSession {
        if UIApplication.shared.applicationState == .background {
            return BackgroundUploadSession.shared.urlSession
        }
        return URLSession.shared
    }

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

    /// Synchronous entry point called from background tasks
    /// (`BGAppRefreshTask` / `BGProcessingTask`). Schedules a flush on the
    /// main actor and returns immediately; the task keeps the app alive via
    /// its expiration handler while the flush runs.
    func flushAll() {
        Task { @MainActor in
            await self.flush()
        }
    }

    // MARK: - Queue + persistence

    /// Test hook: enqueue a reading and kick off a flush. Equivalent to what
    /// `subscribe(to:)` does for each emitted reading, but callable from tests.
    internal func enqueueForTest(_ reading: HealthReading) {
        enqueue(reading)
    }

    private func enqueue(_ reading: HealthReading) {
        var pending = loadPending()
        pending.append(reading)
        savePending(pending)
        pendingCount = pending.count

        // Coalesce: if a flush is already running, it will pick up this new
        // reading; otherwise start one.
        scheduleFlush()
    }

    /// Ensures only one flush runs at a time. Re-schedules itself after a flush
    /// completes if more readings arrived meanwhile.
    private func scheduleFlush() {
        if flushTask != nil { return }
        flushTask = Task { [weak self] in
            await self?.flush()
            await MainActor.run { self?.flushTask = nil }
            if await (self?.loadPending().isEmpty == false) {
                self?.scheduleFlush()
            }
        }
    }

    private func flush() async {
        let pending = loadPending()
        guard !pending.isEmpty else { return }

        // Only send as many as we will remove, so the queue stays in sync with
        // what the backend actually received (prevents duplicate inserts).
        let batchSize = min(pending.count, MAX_READINGS_PER_FLUSH)

        // The backend expects { "readings": [...] }. JSONSerialization cannot
        // encode Swift structs (it would throw an Obj-C NSInvalidArgumentException
        // that Swift can't catch, crashing the app), so encode with JSONEncoder
        // then wrap in the outer object.
        let batch = Array(pending.prefix(batchSize))

        let readingsData: Data
        do {
            readingsData = try JSONEncoder().encode(batch)
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
            let response: URLResponse
            if let send {
                response = try await send(request).1
            } else {
                response = try await session.data(for: request).1
            }
            if let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) {
                // Remove exactly the batch we sent, keeping any readings that
                // arrived during the upload for the next flush.
                var remaining = loadPending()
                remaining.removeFirst(min(remaining.count, batchSize))
                savePending(remaining)
                pendingCount = remaining.count
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
