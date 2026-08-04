import Foundation
import Combine
import SwiftUI
import UIKit

/**
 The long-lived coordinator that owns the BLE manager and API client, plus
 the timers and background-task guards that keep data flowing when the app is
 backgrounded or relaunched by iOS.

 This object lives for the lifetime of the app (held by `AppState`), NOT tied
 to a view. That is what lets collection survive backgrounding and view
 re-creation.

 Polling cadence:
   - Foreground/background (app alive): every `pollInterval` seconds.
   - App killed: iOS relaunches us opportunistically via CoreBluetooth State
     Restoration and BGTaskScheduler; we resume on those wakeups.
 */
@MainActor
final class AppLifecycleManager: ObservableObject {

    /// Seconds between ring polls while the app is alive (foreground or
    /// background). Health metrics change slowly; 90s balances resolution
    /// against battery on both phone and ring.
    let pollInterval: TimeInterval = 90.0

    /// Full-history re-sync cadence: every 20 minutes pull all logs
    /// (activity, stress, HRV, SpO2, sleep) and stream them to the server.
    let fullSyncInterval: TimeInterval = 20 * 60

    let ble: any RingDataSource
    let api = ApiClient.shared
    let settings = AppSettings.shared

    /// Latest value per metric, for the UI cards.
    @Published private(set) var latestByMetric: [RingMetric: Double] = [:]
    @Published private(set) var isCollecting = false
    /// True while a manual full sync is pulling data from the ring; drives
    /// the spinning refresh icon and the wave placeholders on the cards.
    @Published private(set) var isSyncing = false

    private var pollTimer: Timer?
    private var bag = Set<AnyCancellable>()
    private var pollStep = 0
    private var backgroundTaskID: UIBackgroundTaskIdentifier = .invalid
    /// Tracks link transitions so the upload flush fires once per connect.
    private var wasConnected = false
    /// When the current link came up — the silence watchdog's floor.
    private var connectedAt: Date?
    /// Last full-history sync; ticks re-run it every `fullSyncInterval`.
    private var lastFullSyncAt: Date?
    /// When the current manual sync started (for spinner bookkeeping).
    private var syncStartedAt: Date?

    /// Production wiring: the real BLE manager.
    init() {
        self.ble = RingBluetoothManager()
        restoreCache()
        wireUp()
        ble.connect()
        startPolling()
        isCollecting = true
    }

    /// Test/preview wiring: inject a data source (e.g. a `MockRingClient`).
    /// Skips auto-start so the test controls start/stop explicitly.
    init(ble: any RingDataSource) {
        self.ble = ble
        wireUp()
    }

    // MARK: - Wiring

    /// Route readings from the ring to the UI and the API client. Runs
    /// exactly once at construction, not per-view-appear.
    private func wireUp() {
        ble.readings
            .sink { [weak self] reading in self?.handle(reading) }
            .store(in: &bag)
        api.subscribe(to: ble.readings)
    }

    private func handle(_ reading: HealthReading) {
        // First reading arriving once the sync had time to work → stop the
        // spinner. (History readings carry slot timestamps, so compare
        // against arrival time, not the reading's own timestamp.)
        if isSyncing, let started = syncStartedAt,
           Date().timeIntervalSince(started) > 4 {
            isSyncing = false
        }
        guard let metric = RingMetric(rawValue: reading.metric) else { return }
        // Activity metrics arrive as 15-minute increments — the card should
        // show today's running total, not the last slot's slice.
        if Self.activityMetrics.contains(metric) {
            let day = String(reading.recordedAt.formatted(.iso8601.year().month().day()).prefix(10))
            if day != activityTotalsDay {
                activityTotalsDay = day
                activityTotals = [:]
                activitySlotValues = [:]
            }
            let slotKey = ISO8601DateFormatter.shared.string(from: reading.recordedAt)
            let previous = activitySlotValues[metric]?[slotKey] ?? 0
            activitySlotValues[metric, default: [:]][slotKey] = reading.value
            let total = (activityTotals[metric] ?? 0) + (reading.value - previous)
            activityTotals[metric] = total
            latestByMetric[metric] = total
        } else {
            latestByMetric[metric] = reading.value
        }
        persistCache()
    }

    /// Metrics whose readings are per-slot increments summed into a daily total.
    private static let activityMetrics: Set<RingMetric> = [.steps, .calories, .distanceKm]
    private var activityTotalsDay: String?
    private var activityTotals: [RingMetric: Double] = [:]
    /// Last value counted per slot (metric → slot timestamp → value). The
    /// ring resends all slots on every sync — only a slot's *delta* may
    /// move the total, otherwise each re-sync inflates the day.
    private var activitySlotValues: [RingMetric: [String: Double]] = [:]

    // MARK: - Card value cache
    // The Latest readings cards persist to UserDefaults so an app restart
    // shows the last known values until fresh ring data replaces them.

    private static let cacheKey = "latestReadingsCache.v2"

    private static var todayKey: String {
        String(Date().formatted(.iso8601.year().month().day()).prefix(10))
    }

    /// Restores cached card values. Activity totals survive only if the
    /// cache is from today — yesterday's totals would read as today's.
    private func restoreCache() {
        guard let cache = UserDefaults.standard.dictionary(forKey: Self.cacheKey) else { return }
        if let latest = cache["latest"] as? [String: Double] {
            latestByMetric = Dictionary(uniqueKeysWithValues: latest.compactMap { key, value in
                RingMetric(rawValue: key).map { ($0, value) }
            })
        }
        if cache["totalsDay"] as? String == Self.todayKey,
           let totals = cache["totals"] as? [String: Double] {
            activityTotalsDay = cache["totalsDay"] as? String
            activityTotals = Dictionary(uniqueKeysWithValues: totals.compactMap { key, value in
                RingMetric(rawValue: key).map { ($0, value) }
            })
            if let slots = cache["slotValues"] as? [String: [String: Double]] {
                activitySlotValues = Dictionary(uniqueKeysWithValues: slots.compactMap { key, value in
                    RingMetric(rawValue: key).map { ($0, value) }
                })
            }
        } else {
            for metric in Self.activityMetrics {
                latestByMetric.removeValue(forKey: metric)
            }
        }
    }

    private func persistCache() {
        let latest = Dictionary(uniqueKeysWithValues: latestByMetric.map { ($0.key.rawValue, $0.value) })
        let totals = Dictionary(uniqueKeysWithValues: activityTotals.map { ($0.key.rawValue, $0.value) })
        let slots = Dictionary(uniqueKeysWithValues: activitySlotValues.map { ($0.key.rawValue, $0.value) })
        UserDefaults.standard.set([
            "latest": latest,
            "totalsDay": activityTotalsDay ?? "",
            "totals": totals,
            "slotValues": slots,
        ], forKey: Self.cacheKey)
    }

    // MARK: - Polling

    /// Start the periodic ring poll. The timer uses `.common` mode so it
    /// survives scrolling; background survival is handled by the
    /// `bluetooth-central` background mode + the background task guard.
    func startPolling() {
        stopPolling()
        let t = Timer(timeInterval: pollInterval, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        RunLoop.main.add(t, forMode: .common)
        pollTimer = t
        // Fire one immediately so the user sees data right away.
        Task { @MainActor in self.tick() }
    }

    func stopPolling() {
        pollTimer?.invalidate()
        pollTimer = nil
        isCollecting = false
    }

    /// One collection cycle: asks the ring for the next metric in the
    /// round-robin, reconnecting first if the link dropped.
    private func tick() {
        // Recycle a scan that has run fruitlessly for minutes (e.g. the ring
        // was held by another app and has since been released).
        ble.refreshScanIfStale(olderThan: 120)
        guard ble.state == .connected else {
            wasConnected = false
            connectedAt = nil
            // Try to (re)connect if we're not.
            if ble.state == .disconnected || ble.state == .failed {
                ble.connect()
            }
            return
        }
        // Fresh link: the BLE manager full-syncs on connect, so mark the
        // timer here and push any queued readings to the backend.
        if !wasConnected {
            wasConnected = true
            connectedAt = Date()
            lastFullSyncAt = Date()
            api.flushAll()
        }
        // Silence watchdog: a wedged ring still reports "connected" but
        // sends nothing. After 3 minutes without any frame, force a
        // reconnect (which re-runs the full sync on discovery).
        let aliveSince = ble.lastActivityAt ?? connectedAt ?? Date()
        if Date().timeIntervalSince(aliveSince) > 180 {
            ble.disconnect()
            ble.connect()
            return
        }
        // Every `fullSyncInterval`, re-pull all history (activity, stress,
        // HRV, SpO2, sleep) so the server stays complete, not just live.
        if lastFullSyncAt == nil || Date().timeIntervalSince(lastFullSyncAt!) > fullSyncInterval {
            requestFullSync()
        }
        // Round-robin through the poll commands: steps lead every other
        // tick so activity stays near-realtime; the realtime stream
        // alternates HR ↔ SpO2 with battery checks between. (Realtime
        // stress/HRV kinds are deliberately unused — see ColmiProtocol.)
        let cycle: [ColmiProtocol.Command] = [
            .steps, .realtimeHeartRate, .steps, .realtimeSpo2, .battery,
        ]
        let command = cycle[pollStep % cycle.count]
        pollStep += 1
        ble.requestRealtimeReading(command: command)
    }

    /// Pull all history from the ring now (button or 20-minute timer) and
    /// push anything queued to the backend. Spins `isSyncing` until the
    /// first fresh reading arrives (or a safety timeout).
    func requestFullSync() {
        guard ble.state == .connected else { return }
        lastFullSyncAt = Date()
        syncStartedAt = Date()
        isSyncing = true
        ble.startFullSync()
        api.flushAll()
        // Safety: never spin forever, even if the ring stays silent.
        DispatchQueue.main.asyncAfter(deadline: .now() + 60) { [weak self] in
            self?.isSyncing = false
        }
    }

    // MARK: - Scene phase

    /// Called by the App on `scenePhase` changes. Acquires a background task
    /// when leaving the foreground so the BLE link + uploads get time to
    /// finish, and schedules BG-task wakeups for later.
    func scenePhaseDidChange(_ phase: ScenePhase) {
        switch phase {
        case .active:
            endBackgroundTask()
            startPolling()
        case .inactive:
            break
        case .background:
            beginBackgroundTask()
            BackgroundTaskScheduler.shared.scheduleNext()
        @unknown default:
            break
        }
    }

    // MARK: - Background task guard

    private func beginBackgroundTask() {
        endBackgroundTask()
        backgroundTaskID = UIApplication.shared.beginBackgroundTask(withName: "ColmiRing.collection") { [weak self] in
            self?.endBackgroundTask()
        }
    }

    private func endBackgroundTask() {
        guard backgroundTaskID != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTaskID)
        backgroundTaskID = .invalid
    }
}
