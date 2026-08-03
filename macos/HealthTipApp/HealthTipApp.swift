import SwiftUI

@main
struct HealthTipApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .defaultSize(width: 360, height: 260)
        .windowResizability(.contentSize)
    }
}
