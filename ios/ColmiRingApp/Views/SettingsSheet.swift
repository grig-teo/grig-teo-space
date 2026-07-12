import SwiftUI

/** Demo-mode toggle sheet, opened from the Ring page. The full Settings page
 *  (with the Security / Face ID section) is reachable from the Health hub's
 *  toolbar gear icon — see `SettingsView`. Backend URL and device key are
 *  baked into the build (Shared.xcconfig → Info.plist), so not shown here. */
struct SettingsSheet: View {
    @ObservedObject var settings: AppSettings

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Demo data feed", isOn: $settings.demoMode)
                } footer: {
                    Text("When on, the app emits simulated readings instead of reading the real ring. Use this to test the pipeline before the ring is paired.")
                }
                Section("About") {
                    LabeledContent("Protocol", value: "COLMI R02-family (placeholder)")
                    LabeledContent("Backend", value: settings.backendURL)
                    LabeledContent("Bundle id", value: Bundle.main.bundleIdentifier ?? "—")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
