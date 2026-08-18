import SwiftUI
import BackgroundTasks

/** Restricts the app to portrait everywhere except views that explicitly
 *  widen the mask via `OrientationManager` (metric detail charts). */
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?,
    ) -> UIInterfaceOrientationMask {
        OrientationManager.shared.allowed
    }
}

@main
struct ColmiRingApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var appState = AppState.shared
    /// Observed directly (not via `AppState`) so SwiftUI re-renders the root
    /// when `isLocked` flips. `AppState` is a plain `ObservableObject` that
    /// holds `appLock` as a `let`, which would not forward change notifications.
    @ObservedObject private var appLock = AppLockManager.shared
    @Environment(\.scenePhase) private var scenePhase

    init() {
        // MUST register background task handlers before the app finishes
        // launching, i.e. here in App.init(). The identifiers must match those
        // declared in Info.plist under BGTaskSchedulerPermittedIdentifiers.
        BackgroundTaskScheduler.shared.register()
    }

    var body: some Scene {
        WindowGroup {
            // Gate the root behind the app lock. BLE collection and uploads
            // run on `AppState` (a @StateObject), so they keep running while
            // the lock screen is shown.
            Group {
                if appLock.isLocked {
                    LockScreen()
                } else {
                    ContentView(appState: appState)
                }
            }
            .onChange(of: scenePhase) { phase in
                appState.lifecycle.scenePhaseDidChange(phase)
                appLock.scenePhaseDidChange(phase)
            }
            .onOpenURL { url in
                // Deep links from the home-screen widget: grigteo://ring
                // opens the Ring page; grigteo://tips opens Tip history.
                switch url.host {
                case "ring":
                    appState.deepLinkRing = true
                case "tips":
                    appState.deepLinkTips = true
                default:
                    break
                }
            }
        }
    }
}
