import SwiftUI
import BackgroundTasks

@main
struct ColmiRingApp: App {
    @StateObject private var appState = AppState.shared
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
                if appState.appLock.isLocked {
                    LockScreen()
                } else {
                    ContentView(appState: appState)
                }
            }
            .onChange(of: scenePhase) { phase in
                appState.lifecycle.scenePhaseDidChange(phase)
                appState.appLock.scenePhaseDidChange(phase)
            }
            .onOpenURL { url in
                // Deep link from the home-screen widget: grigteo://tips
                // opens the Health tab and pushes the Tip history page.
                if url.host == "tips" {
                    appState.deepLinkTips = true
                }
            }
        }
    }
}
