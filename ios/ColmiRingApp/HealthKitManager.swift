import HealthKit

/**
 Gap-fills steps from the phone's motion coprocessor for hours where the
 ring reported nothing (ring off / charging / left at home). Read-only
 HealthKit use; runs at most once per hour from the app-active hook.

 Safety: an hour is uploaded only when the ring has NO steps data for it
 (checked against the server), so ring numbers always win and nothing is
 double-counted. HealthKit rows are marked source = "healthkit".
 */
@MainActor
final class HealthKitManager {
    static let shared = HealthKitManager()

    private let store = HKHealthStore()
    private let settings = AppSettings.shared
    private let lastSyncKey = "healthkit.lastStepsSyncAt"

    /** Entry point: throttled, permission-gated steps gap-fill. */
    func syncStepsGap() async {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        if let last = lastSync, Date().timeIntervalSince(last) < 3600 { return }
        lastSync = Date()

        let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount)!
        guard (try? await store.requestAuthorization(toShare: [], read: [stepType])) != nil else { return }

        let covered = await ringCoveredHours()
        let since = Calendar.current.date(byAdding: .hour, value: -24, to: Date()) ?? Date()
        let hourly = await hourlySteps(since: since)
        let gap = hourly.filter { hour, steps in
            steps > 20 && !covered.contains(hour)
        }
        guard !gap.isEmpty else { return }

        let readings = gap.map { hour, steps in
            HealthReading(metric: .steps, value: steps, recordedAt: hour, source: "healthkit")
        }
        ApiClient.shared.submit(readings)
    }

    private var lastSync: Date? {
        get { UserDefaults.standard.object(forKey: lastSyncKey) as? Date }
        set { UserDefaults.standard.set(newValue, forKey: lastSyncKey) }
    }

    /** Hours (floored) that already have ring steps data on the server. */
    private func ringCoveredHours() async -> Set<Date> {
        struct Series: Decodable {
            struct Point: Decodable { let recordedAt: String }
            let points: [Point]
        }
        guard let url = URL(string: "\(settings.backendURL)/api/health/series?metric=steps&days=1") else {
            return []
        }
        var req = URLRequest(url: url)
        req.setValue(settings.deviceKey, forHTTPHeaderField: "X-Device-Key")
        guard let (data, response) = try? await URLSession.shared.data(for: req),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let series = try? JSONDecoder().decode(Series.self, from: data)
        else { return [] }
        return Set(series.points.compactMap { point in
            ISO8601DateFormatter.shared.date(from: point.recordedAt)?.flooredToHour
        })
    }

    /** Per-hour step totals from HealthKit for the given window. */
    private func hourlySteps(since start: Date) async -> [(hour: Date, steps: Double)] {
        let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount)!
        return await withCheckedContinuation { continuation in
            let query = HKStatisticsCollectionQuery(
                quantityType: stepType,
                quantitySamplePredicate: nil,
                options: .cumulativeSum,
                anchorDate: start.flooredToHour,
                intervalComponents: DateComponents(hour: 1),
            )
            query.initialResultsHandler = { _, results, _ in
                var out: [(Date, Double)] = []
                results?.enumerateStatistics(from: start, to: Date()) { stat, _ in
                    let steps = stat.sumQuantity()?.doubleValue(for: .count()) ?? 0
                    out.append((stat.startDate.flooredToHour, steps))
                }
                continuation.resume(returning: out)
            }
            store.execute(query)
        }
    }
}

private extension Date {
    var flooredToHour: Date {
        let seconds = timeIntervalSince1970
        return Date(timeIntervalSince1970: seconds - seconds.truncatingRemainder(dividingBy: 3600))
    }
}
