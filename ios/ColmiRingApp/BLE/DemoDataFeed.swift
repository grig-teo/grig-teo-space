import Foundation
import Combine

/**
 Emits plausible ring readings on a timer so the full app → backend → charts
 pipeline can be exercised before the physical COLMI R11 arrives.

 Produces a reading roughly every 30 seconds, cycling through metrics with
 values in realistic human ranges. Disable Demo mode in settings to use the
 real CoreBluetooth path instead.
 */
final class DemoDataFeed: ObservableObject {
    @Published private(set) var lastReadingAt: Date?

    let readings = PassthroughSubject<HealthReading, Never>()
    private var timer: Timer?
    private var step = 0

    func start() {
        stop()
        timer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
            self?.emit()
        }
        emit() // emit one immediately
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func emit() {
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
