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
final class DemoDataFeed: ObservableObject {
    @Published private(set) var lastReadingAt: Date?

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

    private func emit() {
        // Ask iOS for a few seconds of background time so the reading isn't
        // dropped if the app is suspended mid-emit.
        beginBackgroundTask()
        defer { endBackgroundTask() }

        let cycle: [RingMetric] = [.heartRate, .spo2, .steps, .hrv, .stress]
        let metric = cycle[step % cycle.count]
        step += 1

        let value: Double
        switch metric {
        case .heartRate: value = Double.random(in: 58...86)
        case .spo2: value = Double.random(in: 95...99)
        case .steps: value = Double.random(in: 5...40)
        case .hrv: value = Double.random(in: 28...72)
        case .stress: value = Double.random(in: 10...45)
        default: value = 0
        }

        let reading = HealthReading(metric: metric, value: value, source: "demo")
        lastReadingAt = Date()
        readings.send(reading)
    }
}
