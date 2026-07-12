import Foundation
import LocalAuthentication
import SwiftUI

/**
 Optional app lock built on `LocalAuthentication`.

 Uses `.deviceOwnerAuthentication`: Face ID first, then the iPhone passcode as
 fallback. No credentials are stored — iOS owns the prompt and the retry flow.

 Locking policy: lock on cold launch when the toggle is on, and re-lock every
 time the app moves to `.background`; prompt for Face ID/passcode when it
 returns to `.active`. The BLE + upload pipeline runs on `AppState`, which is
 a `@StateObject` held by the `App` — so collection keeps running behind the
 lock screen regardless of which view is shown.

 Presenting in-app modals (camera, photo picker, sheets) does NOT flip
 `scenePhase` to `.background`, so locking on `.background` will not lock the
 app mid-scan.
 */
@MainActor
final class AppLockManager: ObservableObject {
    static let shared = AppLockManager()

    /// True while the lock screen should be shown over the app content.
    @Published private(set) var isLocked: Bool
    /// Last authentication error; shown non-fatally on the lock screen.
    @Published var lastError: String?

    /// Re-entry guard: repeated `.active` transitions (e.g. dismissal of a
    /// system permission alert) must not fire overlapping `evaluatePolicy`
    /// calls, which iOS would reject.
    private var isAuthenticating = false

    private let settings = AppSettings.shared

    init() {
        // Launch locked only when the user has enabled the feature. Reads
        // `AppSettings` directly so the value is consistent across relaunches.
        isLocked = settings.appLockEnabled
    }

    /// Called by `ColmiRingApp` alongside the lifecycle manager's handler.
    /// Keep this independent of `AppLifecycleManager.scenePhaseDidChange` so
    /// the BLE/upload wiring is untouched.
    func scenePhaseDidChange(_ phase: ScenePhase) {
        switch phase {
        case .background:
            if settings.appLockEnabled { isLocked = true }
        case .active:
            if isLocked { authenticate() }
        case .inactive:
            break
        @unknown default:
            break
        }
    }

    /**
     Run the Face ID / passcode prompt. Idempotent: concurrent calls are
     collapsed by `isAuthenticating`.

     - parameter completion: invoked on the main actor with `true` on success
       (or when the lock is disabled / already unlocked). Used by the Settings
       toggle so enabling/disabling the lock is gated on a successful auth.
     */
    func authenticate(completion: ((Bool) -> Void)? = nil) {
        guard settings.appLockEnabled, isLocked, !isAuthenticating else {
            completion?(true)
            return
        }
        isAuthenticating = true

        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            lastError = error?.localizedDescription ?? "Biometric authentication unavailable"
            isAuthenticating = false
            completion?(false)
            return
        }

        // `evaluatePolicy` delivers its reply on a private queue; marshal back
        // to the main actor before touching `@Published` state.
        context.evaluatePolicy(
            .deviceOwnerAuthentication,
            localizedReason: "Unlock Grig·Teo Space"
        ) { [weak self] success, authError in
            Task { @MainActor in
                guard let self else { return }
                self.isAuthenticating = false
                if success {
                    self.isLocked = false
                    self.lastError = nil
                } else {
                    self.lastError = authError?.localizedDescription ?? "Authentication failed"
                }
                completion?(success)
            }
        }
    }

    /**
     Always run the Face ID / passcode prompt, independent of `isLocked`.

     Use this for privileged actions taken while the app is already unlocked —
     e.g. changing the app-lock toggle in Settings. Unlike `authenticate`, it
     does not early-return when unlocked: it verifies identity on every call.
     */
    func verifyIdentity(reason: String, completion: @escaping (Bool) -> Void) {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            lastError = error?.localizedDescription ?? "Biometric authentication unavailable"
            completion(false)
            return
        }
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { [weak self] success, authError in
            Task { @MainActor in
                if !success {
                    self?.lastError = authError?.localizedDescription ?? "Authentication failed"
                }
                completion(success)
            }
        }
    }
}
