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
            ContentView(appState: appState)
                .onChange(of: scenePhase) { phase in
                    appState.lifecycle.scenePhaseDidChange(phase)
                }
        }
    }
}
