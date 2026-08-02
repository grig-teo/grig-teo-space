import Foundation
import Combine

/**
 A fixture-driven `RingDataSource` stand-in — the "MockRingBluetoothClient"
 recommended for testing the app without the physical ring or real CoreBluetooth.

 It replays canned `HealthReading`s on demand and drives the connection state
 machine through the same phases the real manager does, so:
   - unit tests can assert on the parsed/emitted readings, and
   - SwiftUI previews can render `ConnectionCard`/`RingView` with realistic data.

 No hardware, no Bluetooth permission, no simulator limitations. This covers
 the ~80% of the app that's testable at the app layer; a real CoreBluetooth
 peripheral (a separate fake-peripheral app) is only needed for final protocol
 verification later.
 */
@MainActor
final class MockRingClient: ObservableObject, RingDataSource {
    @Published private(set) var state: RingConnectionState = .disconnected
    @Published private(set) var deviceName: String?
    @Published private(set) var rssi: Int?
    @Published private(set) var batteryLevel: Int?
    @Published private(set) var lastReadingAt: Date?
    @Published private(set) var lastActivityAt: Date?
    @Published var lastError: String?

    /// Mock exchanges no real packets, so the traffic log stays empty.
    let traffic: [String] = []

    let readings = PassthroughSubject<HealthReading, Never>()

    /// Canned readings popped in order by `requestRealtimeReading`.
    /// Refillable via `enqueue(_:)`.
    private var fixtureQueue: [HealthReading]
    private var currentIndex: Int = 0

    /// Fixed device attributes applied on `connect()` (override via init).
    private let mockName: String
    private let mockRssi: Int
    private let mockBattery: Int
    /// Delay (seconds) between `connect()` and `.connected`, simulating
    /// scan/connect/discover latency. Set to 0 in tests for synchronous flow.
    private let connectDelay: TimeInterval

    /// Pre-filled default fixtures covering the metrics the advice says to
    /// mirror first: heart rate, SpO2, steps, sleep, battery-via-reading.
    private static let defaultFixtures: [HealthReading] = [
        HealthReading(metric: .heartRate, value: 68, source: "mock"),
        HealthReading(metric: .spo2, value: 97, source: "mock"),
        HealthReading(metric: .steps, value: 8420, source: "mock"),
        HealthReading(metric: .sleepDurationH, value: 7.4, source: "mock"),
        HealthReading(metric: .sleepQuality, value: 88, source: "mock"),
        HealthReading(metric: .hrv, value: 52, source: "mock"),
    ]

    init(
        fixtures: [HealthReading] = defaultFixtures,
        name: String = "COLMI R11 Mock",
        rssi: Int = -42,
        battery: Int = 87,
        connectDelay: TimeInterval = 0,
    ) {
        self.fixtureQueue = fixtures
        self.mockName = name
        self.mockRssi = rssi
        self.mockBattery = battery
        self.connectDelay = connectDelay
    }

    // MARK: - RingDataSource

    func connect() {
        guard state != .connected else { return }
        lastError = nil
        state = .connecting
        deviceName = mockName
        rssi = mockRssi
        batteryLevel = mockBattery

        if connectDelay > 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + connectDelay) { [weak self] in
                self?.markConnected()
            }
        } else {
            markConnected()
        }
    }

    func disconnect() {
        state = .disconnected
    }

    /// The mock never scans, so a stale-scan refresh is a no-op.
    func refreshScanIfStale(olderThan maxAge: TimeInterval) {}

    /// The mock has no history logs to pull.
    func startFullSync() {}

    /// Pop the next canned fixture onto `readings`. When the queue is
    /// exhausted, it cycles back to the start so previews never run dry.
    func requestRealtimeReading(command: ColmiProtocol.Command) {
        guard !fixtureQueue.isEmpty else { return }
        if currentIndex >= fixtureQueue.count { currentIndex = 0 }
        let reading = fixtureQueue[currentIndex]
        currentIndex += 1
        lastReadingAt = Date()
        readings.send(reading)
    }

    // MARK: - Test/preview helpers

    /// Append an extra reading to the fixture queue (lets a test script the
    /// exact sequence without rebuilding the default fixtures).
    func enqueue(_ reading: HealthReading) {
        fixtureQueue.append(reading)
    }

    /// Reset the queue pointer so the next request replays from the start.
    func resetQueue() {
        currentIndex = 0
    }

    private func markConnected() {
        guard state == .connecting else { return }
        state = .connected
    }
}
