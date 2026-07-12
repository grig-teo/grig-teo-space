import SwiftUI

/** Toggles the demo data feed and the app lock. Backend URL and device key
 *  are baked into the build (Shared.xcconfig → Info.plist), so they are not
 *  shown here. */
struct SettingsSheet: View {
    @ObservedObject var settings: AppSettings

    /// Drives the app-lock toggle locally; we commit to `settings.appLockEnabled`
    /// only after a successful Face ID / passcode prompt, so a stray tap can't
    /// silently change the lock state.
    @State private var appLockToggle: Bool = AppSettings.shared.appLockEnabled
    @State private var lockError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Demo data feed", isOn: $settings.demoMode)
                } footer: {
                    Text("When on, the app emits simulated readings instead of reading the real ring. Use this to test the pipeline before the ring is paired.")
                }

                Section {
                    Toggle("Require Face ID", isOn: $appLockToggle)
                } header: {
                    Text("Security")
                } footer: {
                    Text("Ask for Face ID (or your device passcode) when opening the app and switching back to it. Enabling and disabling both require authentication.")
                }

                if let lockError {
                    Section {
                        Text(lockError)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }

                Section("About") {
                    LabeledContent("Protocol", value: "COLMI R02-family (placeholder)")
                    LabeledContent("Backend", value: settings.backendURL)
                    LabeledContent("Bundle id", value: Bundle.main.bundleIdentifier ?? "—")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .onChange(of: appLockToggle) { newValue in
                // A change here means the user flipped the toggle. Gate the
                // actual setting change on a successful auth; revert the
                // toggle if they cancel or fail.
                requestLockChange(enabled: newValue)
            }
        }
    }

    /// Authenticate, then apply the requested lock state on success or revert
    /// the toggle on failure. Uses `verifyIdentity` (always prompts) rather
    /// than `authenticate` (which early-returns when already unlocked), so the
    /// user must confirm identity to change this privileged setting.
    private func requestLockChange(enabled: Bool) {
        lockError = nil
        AppLockManager.shared.verifyIdentity(reason: "Change app lock setting") { success in
            if success {
                settings.appLockEnabled = enabled
                // The lock engages on the next background→foreground transition
                // (scenePhaseDidChange) and on the next cold launch (init reads
                // appLockEnabled). No need to lock mid-settings.
            } else {
                appLockToggle = !enabled
                lockError = "Authentication failed; lock setting unchanged."
            }
        }
    }
}
