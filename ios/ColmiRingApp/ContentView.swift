import SwiftUI

/**
 Root view with a bottom tab bar: Profile and Health.

 - Profile: grig-teo identity + CV download (per language).
 - Health:  ring connection, sync, latest metrics, settings.

 Both tabs observe the shared `AppState` so BLE collection and uploads keep
 running regardless of which tab is active.
 */
struct ContentView: View {
    @ObservedObject var appState: AppState
    @StateObject private var profileClient = ProfileClient.shared

    var body: some View {
        TabView {
            ProfileView(client: profileClient, settings: appState.settings)
                .tabItem {
                    Label("Profile", systemImage: "person.crop.circle")
                }

            HealthView(appState: appState)
                .tabItem {
                    Label("Health", systemImage: "heart.text.clipboard")
                }
        }
        .sheet(item: $profileClient.sharedItem) { shared in
            ShareSheet(items: [shared.url])
        }
    }
}

/** Wrapper around UIActivityViewController for the share sheet. */
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
