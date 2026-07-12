import Testing
import Foundation
import Combine
@testable import ColmiRingApp

/**
 Tests for `DemoDataFeed` — the foreground synthetic source.

 These lock in two behaviors that were previously broken:
   1. `emitFullCycle()` emits exactly one reading per metric (all 9), so the
      newer metrics (calories, distance, sleep) reach the backend.
   2. `emitNow()` advances the round-robin by exactly one reading.

 Each emitted reading must carry `source == "demo"` and a value within the
 documented realistic range.
 */
@MainActor
struct DemoDataFeedTests {

    @Test
    func emitFullCycleProducesOneReadingPerMetric() {
        let captured = captureAll(emittedBy: { feed in feed.emitFullCycle() })
        #expect(captured.count == RingMetric.allCases.count)

        let emittedMetrics = Set(captured.map(\.metric))
        let allMetrics = Set(RingMetric.allCases.map(\.rawValue))
        #expect(emittedMetrics == allMetrics, "emitFullCycle missed some metrics")
    }

    @Test
    func emittedReadingsAreSourcedAsDemo() {
        let captured = captureAll(emittedBy: { feed in feed.emitNow() })
        #expect(captured.count == 1)
        #expect(captured.first?.source == "demo")
    }

    @Test
    func emitNowAdvancesRoundRobinInOrder() {
        let captured = captureAll(emittedBy: { feed in
            feed.emitNow()
            feed.emitNow()
            feed.emitNow()
        })
        #expect(captured.count == 3)
        // The first three metrics of the cycle are heartRate, spo2, steps.
        #expect(captured[0].metric == RingMetric.heartRate.rawValue)
        #expect(captured[1].metric == RingMetric.spo2.rawValue)
        #expect(captured[2].metric == RingMetric.steps.rawValue)
    }

    @Test
    func heartRateValueStaysInRealisticRange() throws {
        let captured = captureAll(emittedBy: { feed in feed.emitFullCycle() })
        let heartRate = try #require(captured.first { $0.metric == RingMetric.heartRate.rawValue })
        #expect(heartRate.value >= 58 && heartRate.value <= 86)
    }

    // MARK: - Helpers

    /**
     Subscribes to a fresh `DemoDataFeed`'s readings, runs `emit` (which sends
     synchronously on `PassthroughSubject`), and returns everything captured
     while the subscription was live. The subscription stays alive for the
     duration of the emit closure, so nothing is dropped.
     */
    private func captureAll(emittedBy emit: (DemoDataFeed) -> Void) -> [HealthReading] {
        let feed = DemoDataFeed()
        var captured: [HealthReading] = []
        var bag = Set<AnyCancellable>()
        feed.readings.sink { captured.append($0) }.store(in: &bag)
        emit(feed)
        _ = bag // keep subscription alive through emit (already happened above)
        return captured
    }
}
