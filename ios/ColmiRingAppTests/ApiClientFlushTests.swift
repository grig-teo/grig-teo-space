import Testing
import Foundation
@testable import ColmiRingApp

/**
 Regression tests for `ApiClient`'s flush queue.

 These guard against the two bugs fixed alongside this test target:
   1. Concurrent `enqueue` calls used to spawn overlapping flushes that read
      the same pending queue and POSTed the same readings twice.
   2. On success the queue removed only the first 200 of an oversized batch,
      re-uploading the rest next time.

 Uses an injected sender stub so no real network I/O happens; the stub counts
 how many readings each POST carried so we can assert on deduplication.
 */
@MainActor
struct ApiClientFlushTests {

    @Test
    func concurrentEnqueuesDoNotDuplicateUploads() async throws {
        let recorder = UploadRecorder()
        let client = ApiClient(send: recorder.successResponse())

        // Enqueue several readings back-to-back. Before the fix, each enqueue
        // kicked off an independent flush that could re-read the same queue.
        for value in 60..<68 {
            client.enqueueForTest(
                HealthReading(metric: .heartRate, value: Double(value), source: "test")
            )
        }

        // Give the coalesced flush time to run.
        await waitForFlush()

        let uploaded = recorder.uploadedValues
        #expect(uploaded.count == 8, "expected all 8 readings uploaded once")
        #expect(Set(uploaded).count == uploaded.count, "duplicate values were uploaded")
    }

    @Test
    func queueShrinksByExactlyTheBatchSent() async throws {
        let recorder = UploadRecorder()
        let client = ApiClient(send: recorder.successResponse())

        for value in 0..<5 {
            client.enqueueForTest(
                HealthReading(metric: .spo2, value: Double(value), source: "test")
            )
        }
        await waitForFlush()

        // After a successful flush of 5 readings, the queue must be empty —
        // not partially drained (the old removeFirst(200)-on-oversize bug).
        #expect(client.pendingCount == 0)
        #expect(recorder.uploadedValues.count == 5)
    }

    @Test
    func failedUploadKeepsReadingsInTheQueue() async throws {
        let client = ApiClient(send: { _ in
            // Simulate a server rejection.
            throw URLError(.badServerResponse)
        })

        client.enqueueForTest(
            HealthReading(metric: .heartRate, value: 72, source: "test")
        )
        await waitForFlush()

        // On failure the reading must remain pending for the next retry.
        #expect(client.pendingCount == 1)
    }

    // MARK: - Helpers

    /// Wait long enough for any coalesced async flush to complete.
    private func waitForFlush() async {
        try? await Task.sleep(nanoseconds: 600_000_000) // 0.6s
    }
}

/// Counts readings seen across all POSTs in the test, for dedup assertions.
@MainActor
final class UploadRecorder {
    private(set) var uploadedValues: [Double] = []

    /// Returns a sender that records every reading in each request body.
    func successResponse() -> @Sendable (URLRequest) async throws -> (Data, URLResponse) {
        let counter = self
        return { request in
            if let body = request.httpBody,
               let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
               let readings = json["readings"] as? [[String: Any]] {
                await MainActor.run {
                    for r in readings {
                        if let v = r["value"] as? Double { counter.uploadedValues.append(v) }
                    }
                }
            }
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 201,
                httpVersion: nil,
                headerFields: nil,
            )!
            return (Data(), response)
        }
    }
}
