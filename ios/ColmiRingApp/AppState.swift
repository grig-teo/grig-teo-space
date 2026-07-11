import Foundation
import SwiftUI

/**
 The single observable root held by `ColmiRingApp` as a `@StateObject`.

 Bundles the long-lived `AppLifecycleManager` (BLE, demo, API, timers) and
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

    /// Convenience passthroughs so views can bind directly.
    var ble: RingBluetoothManager { lifecycle.ble }
    var demo: DemoDataFeed { lifecycle.demo }
    var api: ApiClient { lifecycle.api }
    var latestByMetric: [RingMetric: Double] { lifecycle.latestByMetric }

    init() {
        let settings = AppSettings.shared
        self.settings = settings
        self.lifecycle = AppLifecycleManager()
    }
}
