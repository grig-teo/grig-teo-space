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
protocol RingDataSource: ObservableObject {
    /// Current connection lifecycle phase.
    var state: RingConnectionState { get }
    /// Advertised device name, once discovered.
    var deviceName: String? { get }
    /// Most recent signal strength, in dBm.
    var rssi: Int? { get }
    /// Battery percentage 0–100, once read.
    var batteryLevel: Int? { get }
    /// When the most recent reading was parsed.
    var lastReadingAt: Date? { get }
    /// Last error message; non-nil while in a failed/unhealthy state.
    var lastError: String? { get }

    /// New readings are published here; the API client drains them.
    var readings: PassthroughSubject<HealthReading, Never> { get }

    /// Last raw packets exchanged with the ring (debug display; empty for
    /// mock sources).
    var traffic: [String] { get }

    /// Begin scanning/connecting (or, for mock sources, start emitting).
    func connect()
    /// Stop scanning and release the connection (or stop emitting).
    func disconnect()
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
