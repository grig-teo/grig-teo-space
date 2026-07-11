import SwiftUI

/** Edits backend URL, device key, and demo mode. Values persist via AppSettings. */
struct SettingsSheet: View {
    @ObservedObject var settings: AppSettings

    var body: some View {
        NavigationStack {
            Form {
                Section("Backend") {
                    TextField("Backend URL", text: $settings.backendURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    SecureField("Device API key", text: $settings.deviceKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                Section {
                    Toggle("Demo data feed", isOn: $settings.demoMode)
                } footer: {
                    Text("When on, the app emits simulated readings instead of reading the real ring. Use this to test the pipeline before the ring is paired.")
                }
                Section("About") {
                    LabeledContent("Protocol", value: "COLMI R02-family (placeholder)")
                    LabeledContent("Bundle id", value: Bundle.main.bundleIdentifier ?? "—")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
