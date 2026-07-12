import Foundation
import Combine
import UIKit

/**
 Emits plausible ring readings on a timer so the full app → backend → charts
 pipeline can be exercised before the physical COLMI R11 arrives.

 Produces a reading roughly every 30 seconds, cycling through metrics with
 values in realistic human ranges. Disable Demo mode in settings to use the
 real CoreBluetooth path instead.

 Note: this is a foreground-oriented test feed. iOS suspends timers when the
 app moves to the background, so demo readings will pause while backgrounded.
 Real continuous collection uses the CoreBluetooth path in
 `RingBluetoothManager`, which stays alive via the `bluetooth-central`
 background mode.
 */
final class DemoDataFeed: ObservableObject, RingDataSource {
    @Published private(set) var lastReadingAt: Date?

    // MARK: - RingDataSource (cosmetic in demo mode — ConnectionCard branches
    // on demoMode and hides most of these. Provided so the demo feed satisfies
    // the same protocol as the real BLE manager and can be swapped in tests.)
    /// Demo feed is always logically "connected" to its synthetic source.
    let state: RingConnectionState = .connected
    let deviceName: String? = "COLMI R11 (demo)"
    let rssi: Int? = nil
    let batteryLevel: Int? = 100
    @Published var lastError: String? = nil

    let readings = PassthroughSubject<HealthReading, Never>()
    private var timer: Timer?
    private var step = 0
    private var backgroundTaskID: UIBackgroundTaskIdentifier = .invalid

    func start() {
        stop()
        let t = Timer(timeInterval: 30.0, repeats: true) { [weak self] _ in
            self?.emit()
        }
        // `.common` mode keeps the timer firing while scrolling/interacting.
        RunLoop.main.add(t, forMode: .common)
        timer = t
        emit() // emit one immediately
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    // MARK: - RingDataSource aliases

    /// `connect()`/`disconnect()` map onto start/stop so the demo feed can be
    /// driven through the same protocol surface as the real manager.
    func connect() { start() }
    func disconnect() { stop() }

    /// Emit one reading immediately (advances the round-robin). Useful in tests
    /// and previews; mirrors requesting a real-time reading from the ring.
    func requestRealtimeReading(command: ColmiProtocol.Command) {
        emitNow()
    }

    private func beginBackgroundTask() {
        endBackgroundTask()
        backgroundTaskID = UIApplication.shared.beginBackgroundTask(withName: "DemoDataFeed.emit") { [weak self] in
            self?.endBackgroundTask()
        }
    }

    private func endBackgroundTask() {
        guard backgroundTaskID != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTaskID)
        backgroundTaskID = .invalid
    }

    /// Emit one reading immediately, advancing the round-robin. Used by
    /// background tasks to keep data flowing while the foreground timer is
    /// suspended (iOS pauses `RunLoop.main` timers when the app backgrounds).
    func emitNow() {
        emit()
    }

    /// Emit one fresh reading for every metric in the cycle. Background task
    /// handlers call this on each wakeup so a complete snapshot reaches the
    /// backend even while the phone is locked.
    func emitFullCycle() {
        for _ in cycleMetrics { emit() }
    }

    private let cycleMetrics: [RingMetric] = [
        .heartRate, .spo2, .steps, .hrv, .stress,
        .calories, .distanceKm, .sleepDurationH, .sleepQuality,
    ]

    private func emit() {
        // Ask iOS for a few seconds of background time so the reading isn't
        // dropped if the app is suspended mid-emit.
        beginBackgroundTask()
        defer { endBackgroundTask() }

        let metric = cycleMetrics[step % cycleMetrics.count]
        step += 1

        let value: Double
        switch metric {
        case .heartRate: value = Double.random(in: 58...86)
        case .spo2: value = Double.random(in: 95...99)
        case .steps: value = Double.random(in: 5...40)
        case .hrv: value = Double.random(in: 28...72)
        case .stress: value = Double.random(in: 10...45)
        case .calories: value = Double.random(in: 1400...2800)
        case .distanceKm: value = Double.random(in: 1.2...10.5)
        case .sleepDurationH: value = Double.random(in: 5.5...8.8)
        case .sleepQuality: value = Double.random(in: 62...94)
        default: value = 0
        }

        let reading = HealthReading(metric: metric, value: value, source: "demo")
        lastReadingAt = Date()
        readings.send(reading)
    }
}
