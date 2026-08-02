import Foundation
import SwiftUI
import Combine

/**
 The single observable root held by `ColmiRingApp` as a `@StateObject`.

 Bundles the long-lived `AppLifecycleManager` (BLE, API, timers) and
 `AppSettings`, and re-publishes the values the UI needs. Views observe this
 instead of creating their own `@StateObject`s, so collection survives view
 re-creation and app backgrounding.

 `shared` exists so background-task closures (which aren't in the SwiftUI
       view hierarchy) can reach the lifecycle manager.
 */
@MainActor
final class AppState: ObservableObject {
    static let shared = AppState()

    let lifecycle: AppLifecycleManager
    let settings: AppSettings
    /// Optional Face ID / passcode lock. Observed directly by `ColmiRingApp`
    /// (not via AppState) so the root view re-renders when `isLocked` flips.
    let appLock = AppLockManager.shared

    /// Set by a widget deep link (grigteo://tips) to ask the Health tab to
    /// push the Tip history page. HealthView clears it after navigating.
    @Published var deepLinkTips = false

    /// Convenience passthrough so views can bind directly. The BLE source is
    /// boxed once into a stable `AnyRingDataSource` instance so SwiftUI's
    /// `@ObservedObject` keeps a consistent observation identity across
    /// re-renders (re-boxing every body pass would break observation).
    let bleBox: AnyRingDataSource
    var api: ApiClient { lifecycle.api }
    var latestByMetric: [RingMetric: Double] { lifecycle.latestByMetric }

    private var bag = Set<AnyCancellable>()

    init() {
        let settings = AppSettings.shared
        self.settings = settings
        let lifecycle = AppLifecycleManager()
        self.lifecycle = lifecycle
        self.bleBox = AnyRingDataSource(lifecycle.ble)
        // Forward lifecycle changes (readings, sync state) so observing
        // views re-render — without this the cards and battery stay stale.
        lifecycle.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &bag)
    }
}
