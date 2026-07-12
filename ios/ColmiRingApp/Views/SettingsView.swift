import SwiftUI

/**
 App settings page, pushed onto the Health hub's NavigationStack via the
 toolbar gear icon. Owns the demo-mode toggle and the Security section
 (Face ID / passcode app lock).

 The app-lock toggle is gated on a `verifyIdentity` prompt so enabling or
 disabling it always requires authentication. A "Lock now" button forces the
 lock screen for testing.
 */
struct SettingsView: View {
    @ObservedObject var settings: AppSettings
    @ObservedObject private var appLock = AppLockManager.shared

    /// Drives the toggle locally; we commit to `settings.appLockEnabled`
    /// only after a successful Face ID / passcode prompt, so a stray tap
    /// can't silently change the lock state.
    @State private var appLockToggle: Bool = AppSettings.shared.appLockEnabled
    @State private var lockError: String?

    var body: some View {
        Form {
            Section {
                Toggle("Demo data feed", isOn: $settings.demoMode)
            } footer: {
                Text("When on, the app emits simulated readings instead of reading the real ring. Use this to test the pipeline before the ring is paired.")
            }

            Section {
                Toggle("Require Face ID", isOn: $appLockToggle)
                Button("Lock now") { appLock.lockNow() }
            } header: {
                Text("Security")
            } footer: {
                Text("Ask for Face ID (or your device passcode) when opening the app and switching back to it. “Lock now” shows the lock screen immediately for testing.")
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
            requestLockChange(enabled: newValue)
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
            } else {
                appLockToggle = !enabled
                lockError = "Authentication failed; lock setting unchanged."
            }
        }
    }
}
