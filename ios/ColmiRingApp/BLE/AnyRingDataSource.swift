import Foundation
import Combine
import SwiftUI

/**
 A type-erasing `ObservableObject` box for `RingDataSource`.

 SwiftUI's `@ObservedObject` needs a *concrete* `ObservableObject`, but the app
 holds its ring sources as `any RingDataSource` so tests/previews can inject a
 `MockRingClient`. An `any Protocol` existential can't satisfy `ObservableObject`
 directly, so this box wraps any concrete source and forwards its
 `objectWillChange` publisher. Views observe the box; the box forwards change
 notifications and delegates method calls.

 The wrapped source's `@Published` changes flow through because we subscribe to
 its `objectWillChange` and re-emit it as our own.
 */
@MainActor
final class AnyRingDataSource: ObservableObject, RingDataSource {
    var state: RingConnectionState { source.state }
    var deviceName: String? { source.deviceName }
    var rssi: Int? { source.rssi }
    var batteryLevel: Int? { source.batteryLevel }
    var lastReadingAt: Date? { source.lastReadingAt }
    var lastError: String? { source.lastError }
    var traffic: [String] { source.traffic }

    let readings: PassthroughSubject<HealthReading, Never> = .init()

    private let source: any RingDataSource
    private var bag = Set<AnyCancellable>()

    /// Boxes a concrete source. Takes the concrete type (not an existential)
    /// so the compiler can resolve its `objectWillChange` publisher.
    init<S: RingDataSource>(_ source: S) {
        self.source = source
        // Forward the wrapped object's change notifications as our own, so
        // `@ObservedObject` views re-render when the underlying source changes.
        source.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &bag)
        // Forward readings through our own publisher.
        source.readings
            .sink { [weak self] in self?.readings.send($0) }
            .store(in: &bag)
    }

    func connect() { source.connect() }
    func disconnect() { source.disconnect() }
    func refreshScanIfStale(olderThan maxAge: TimeInterval) {
        source.refreshScanIfStale(olderThan: maxAge)
    }
    func startFullSync() { source.startFullSync() }
    func requestRealtimeReading(command: ColmiProtocol.Command) {
        source.requestRealtimeReading(command: command)
    }
}
