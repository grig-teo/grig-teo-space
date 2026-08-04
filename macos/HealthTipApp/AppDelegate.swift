import AppKit
import UserNotifications

/**
 App-level plumbing:

 - Polls for the latest tip every 15 minutes REGARDLESS of window state —
   the polling used to live in the view, so closing the window stopped it.
 - Keeps the app running after the last window closes, so notifications keep
   flowing while the app sits in the Dock/background.
 - Shows notification banners even when the app is frontmost (without this
   delegate hook the system suppresses them).
 */
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    private var pollTimer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        TipNotifier.shared.start()
        UNUserNotificationCenter.current().delegate = self

        pollTimer?.invalidate()
        let timer = Timer.scheduledTimer(withTimeInterval: 15 * 60, repeats: true) { _ in
            Task { await TipStore.shared.poll() }
        }
        timer.tolerance = 60 // let macOS coalesce wakeups for battery
        pollTimer = timer

        Task { await TipStore.shared.poll() }
    }

    /// Stay alive with no windows — the poll loop and notifications depend
    /// on the process running.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    /// Show banners + play sound even while the app is in the foreground.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}
