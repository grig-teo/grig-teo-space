import SwiftUI

/**
 Full-screen lock shown over the app content while `AppLockManager.isLocked`.

 Auto-prompts Face ID / passcode on appear via `.task`, and again on tap of the
 Unlock button. The opaque `.systemBackground` ensures no health data is
 visible behind the prompt. BLE collection and uploads keep running on
 `AppState` while this view is displayed.
 */
struct LockScreen: View {
    @ObservedObject private var appLock = AppLockManager.shared

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()

            VStack(spacing: 20) {
                Spacer()

                Image(systemName: "lock.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(.tint)

                Text("Grig·Teo Space")
                    .font(.title2.weight(.semibold))

                Text("Authenticate to view your health data.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                if let error = appLock.lastError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }

                Spacer()

                Button("Unlock") {
                    appLock.authenticate()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .padding(.bottom, 60)
            }
            .padding()
        }
        .task {
            // Auto-prompt on appear so returning to the app fires Face ID
            // without an extra tap.
            appLock.authenticate()
        }
    }
}
