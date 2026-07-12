import Testing
import Foundation
import Combine
@testable import ColmiRingApp

/**
 Tests for the `MockRingClient` test double: the connection state machine and
 the fixture-replay behavior. This is the mock the advice recommends building to
 validate parsing and UI without hardware.
 */
@MainActor
struct MockRingClientTests {

    @Test
    func startsDisconnected() {
        let client = MockRingClient()
        #expect(client.state == .disconnected)
        #expect(client.deviceName == nil)
    }

    @Test
    func connectDrivesStateToConnected() {
        let client = MockRingClient(connectDelay: 0)
        client.connect()
        // With connectDelay == 0, connection completes synchronously.
        #expect(client.state == .connected)
        #expect(client.deviceName == "COLMI R11 Mock")
        #expect(client.rssi == -42)
        #expect(client.batteryLevel == 87)
    }

    @Test
    func disconnectReturnsToDisconnected() {
        let client = MockRingClient(connectDelay: 0)
        client.connect()
        client.disconnect()
        #expect(client.state == .disconnected)
    }

    @Test
    func requestRealtimeReadingEmitsNextFixture() throws {
        let fixture = HealthReading(metric: .heartRate, value: 68, source: "mock")
        let client = MockRingClient(fixtures: [fixture], connectDelay: 0)
        client.connect()

        let captured = capture(from: client) { c in
            c.requestRealtimeReading(command: .realtimeHeartRate)
        }
        let reading = try #require(captured.first)
        #expect(reading.metric == "heart_rate")
        #expect(reading.value == 68)
        #expect(reading.source == "mock")
        #expect(client.lastReadingAt != nil)
    }

    @Test
    func fixturesReplayInOrderThenCycle() {
        let first = HealthReading(metric: .heartRate, value: 60, source: "mock")
        let second = HealthReading(metric: .spo2, value: 98, source: "mock")
        let client = MockRingClient(fixtures: [first, second], connectDelay: 0)
        client.connect()

        let captured = capture(from: client) { c in
            c.requestRealtimeReading(command: .realtimeHeartRate)
            c.requestRealtimeReading(command: .realtimeSpo2)
            // Third request cycles back to the first fixture (no crash, no nil).
            c.requestRealtimeReading(command: .realtimeHeartRate)
        }

        #expect(captured.count == 3)
        #expect(captured[0].value == 60)
        #expect(captured[1].value == 98)
        #expect(captured[2].value == 60) // cycled
    }

    @Test
    func emptyFixturesEmitNothing() {
        let client = MockRingClient(fixtures: [], connectDelay: 0)
        client.connect()
        let captured = capture(from: client) { c in
            c.requestRealtimeReading(command: .realtimeHeartRate)
        }
        #expect(captured.isEmpty)
    }

    // MARK: - Helpers

    /**
     Subscribes to a client's readings, runs `actions` (which send
     synchronously on `PassthroughSubject`), and returns everything captured
     while the subscription was live.
     */
    private func capture(
        from client: MockRingClient,
        actions: (MockRingClient) -> Void,
    ) -> [HealthReading] {
        var captured: [HealthReading] = []
        var bag = Set<AnyCancellable>()
        client.readings.sink { captured.append($0) }.store(in: &bag)
        actions(client)
        _ = bag
        return captured
    }
}
