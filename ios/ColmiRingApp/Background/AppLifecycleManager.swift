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

    let ble: any RingDataSource
    let api = ApiClient.shared
    let settings = AppSettings.shared

    /// Latest value per metric, for the UI cards.
    @Published private(set) var latestByMetric: [RingMetric: Double] = [:]
    @Published private(set) var isCollecting = false

    private var pollTimer: Timer?
    private var bag = Set<AnyCancellable>()
    private var pollStep = 0
    private var backgroundTaskID: UIBackgroundTaskIdentifier = .invalid
    /// Tracks link transitions so the upload flush fires once per connect.
    private var wasConnected = false

    /// Production wiring: the real BLE manager.
    init() {
        self.ble = RingBluetoothManager()
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
        if let metric = RingMetric(rawValue: reading.metric) {
            latestByMetric[metric] = reading.value
        }
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
        guard ble.state == .connected else {
            wasConnected = false
            // Try to (re)connect if we're not.
            if ble.state == .disconnected || ble.state == .failed {
                ble.connect()
            }
            return
        }
        // Fresh link: push any queued readings to the backend right away.
        if !wasConnected {
            wasConnected = true
            api.flushAll()
        }
        // Round-robin through the realtime-readable metrics.
        let cycle: [ColmiProtocol.Command] = [.realtimeHeartRate, .realtimeSpo2, .battery]
        let command = cycle[pollStep % cycle.count]
        pollStep += 1
        ble.requestRealtimeReading(command: command)
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
