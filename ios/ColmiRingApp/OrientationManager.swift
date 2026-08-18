import UIKit

/**
 Runtime control over allowed interface orientations. The app is
 portrait-only except on the metric detail pages, which unlock landscape
 so the chart can use the full screen width. `AppDelegate` reads
 `allowed` for every orientation decision; views that change it must also
 call `apply()` so UIKit re-evaluates the current window.
 */
final class OrientationManager {
    static let shared = OrientationManager()

    /// Orientations the app currently allows. Read by the AppDelegate.
    private(set) var allowed: UIInterfaceOrientationMask = .portrait

    /** Switches the allowed orientations and asks the active window scene
     *  to re-evaluate (rotating back to portrait when landscape is revoked). */
    func set(_ mask: UIInterfaceOrientationMask) {
        allowed = mask
        guard let scene = UIApplication.shared.connectedScenes
            .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
        else { return }
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask))
    }
}
