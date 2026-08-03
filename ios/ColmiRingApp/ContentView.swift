import SwiftUI

/**
 Root view with a bottom tab bar: Profile, Health, Media, Settings.

 - Profile: grig-teo identity + CV download (per language).
 - Health:  ring connection, sync, latest metrics, settings.
 - Media:   photo/video gallery grid + one-tap backup to the backend.
 - Settings: Face ID app lock, backend info.

 Both tabs observe the shared `AppState` so BLE collection and uploads keep
 running regardless of which tab is active.
 */
struct ContentView: View {
    @ObservedObject var appState: AppState
    @StateObject private var profileClient = ProfileClient.shared
    @State private var selectedTab = 1

    var body: some View {
        TabView(selection: $selectedTab) {
            ProfileView(client: profileClient, settings: appState.settings)
                .tabItem {
                    Label("Profile", systemImage: "person.crop.circle")
                }
                .tag(0)

            HealthView(appState: appState)
                .tabItem {
                    Label("Health", systemImage: "heart.text.clipboard")
                }
                .tag(1)

            MediaView()
                .tabItem {
                    Label("Media", systemImage: "photo.stack")
                }
                .tag(2)

            NavigationStack {
                SettingsView(settings: appState.settings)
            }
            .tabItem {
                Label("Settings", systemImage: "gearshape")
            }
            .tag(3)
        }
        .onChange(of: appState.deepLinkTips) { open in
            // Widget deep link: switch to the Health tab; HealthView pushes
            // the Tip page and clears the flag itself.
            if open { selectedTab = 1 }
        }
        .onChange(of: appState.deepLinkRing) { open in
            // Widget deep link: switch to the Health tab; HealthView pushes
            // the Ring page and clears the flag itself.
            if open { selectedTab = 1 }
        }
        .onChange(of: appState.deepLinkMedia) { open in
            // Profile page "See more": jump to the Media tab.
            if open {
                selectedTab = 2
                appState.deepLinkMedia = false
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
