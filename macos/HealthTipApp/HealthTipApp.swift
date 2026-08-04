import SwiftUI

@main
struct HealthTipApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        // The window is strictly content-sized: it fits the tip text and
        // cannot be resized by the user.
        .windowResizability(.contentSize)
    }
}
