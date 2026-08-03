import Foundation
import Combine

/**
 The observable surface every ring data source exposes.

 Implemented by:
   - `RingBluetoothManager` — the real CoreBluetooth path.
   - `MockRingClient` — a fixture-driven stand-in used in unit tests and
     SwiftUI previews (no hardware, no CoreBluetooth).

 Consumers (`AppLifecycleManager`, `ConnectionCard`, `RingView`) program
 against `any RingDataSource` so the source can be swapped without touching
 the UI or collection wiring. This is the app-layer seam recommended for
 testing without the ring hardware: production still constructs a
 `RingBluetoothManager`, while tests inject a `MockRingClient`.

 Note: this protocol is deliberately NOT `@MainActor`-isolated so it can be
 adopted by `RingBluetoothManager`, whose CoreBluetooth callbacks arrive via
 the main queue without the class itself being isolated. Consumers that need
 main-actor isolation (views, `AppLifecycleManager`) apply it themselves.
 */
/// Today's live totals as pushed by the ring (notification 0x73/0x12).
struct LiveActivityTotals {
    let steps: Int
    let calories: Int
    let distanceMeters: Int
}

protocol RingDataSource: ObservableObject {
    var state: RingConnectionState { get }
    /// Advertised device name, once discovered.
    var deviceName: String? { get }
    /// Most recent signal strength, in dBm.
    var rssi: Int? { get }
    /// Battery percentage 0–100, once read.
    var batteryLevel: Int? { get }
    /// When the most recent reading was parsed.
    var lastReadingAt: Date? { get }
    /// Readable form of the most recent reading ("Heart Rate: 78 bpm").
    var lastReadingText: String? { get }
    /// When the ring last sent any frame — the silence watchdog uses this
    /// to detect a wedged link that still reports "connected".
    var lastActivityAt: Date? { get }
    /// Last error message; non-nil while in a failed/unhealthy state.
    var lastError: String? { get }

    /// Today's live totals pushed by the ring in real time (steps walk in
    /// as you take them). UI-only: the server series stays slot-based to
    /// avoid double counting.
    var liveActivity: LiveActivityTotals? { get }

    /// New readings are published here; the API client drains them.
    var readings: PassthroughSubject<HealthReading, Never> { get }

    /// Last raw packets exchanged with the ring (debug display; empty for
    /// mock sources).
    var traffic: [String] { get }

    /// Begin scanning/connecting (or, for mock sources, start emitting).
    func connect()
    /// Stop scanning and release the connection (or stop emitting).
    func disconnect()
    /// Restart a scan that has run fruitlessly for too long (no-op for
    /// sources that don't scan).
    func refreshScanIfStale(olderThan maxAge: TimeInterval)
    /// Pull every history log the ring offers (activity, stress, HRV,
    /// SpO2, sleep) plus battery and clock, staggered (no-op for mocks).
    func startFullSync()
    /// Request a fresh real-time reading once connected.
    func requestRealtimeReading(command: ColmiProtocol.Command)
}

/// Connection lifecycle phases shared by every `RingDataSource`.
/// Lifted out of `RingBluetoothManager` so the protocol and the mock use one
/// state type.
enum RingConnectionState: String {
    case disconnected
    case scanning
    case connecting
    case connected
    case failed
}
