import Foundation
import UserNotifications

/**
 Posts a macOS notification when a NEW tip appears on the server.

 The app polls `/api/health/tips` on a timer; this class dedupes by tip id
 (persisted in UserDefaults). The first tip seen after launch is only
 recorded, not notified — so you don't get a banner for something that was
 already there.
 */
@MainActor
final class TipNotifier {
    static let shared = TipNotifier()

    private let center = UNUserNotificationCenter.current()
    private let lastSeenKey = "TipNotifier.lastSeenTipId"
    private var authorized = false

    private init() {}

    /// Ask for notification permission once (macOS shows the system prompt
    /// on first call).
    func start() {
        center.requestAuthorization(options: [.alert, .sound]) { [weak self] granted, _ in
            Task { @MainActor in self?.authorized = granted }
        }
    }

    /// Notify the user if this tip hasn't been seen yet. Always records the
    /// id so future polls only fire on genuinely new tips.
    func notifyIfNew(_ tip: Tip) {
        let lastSeen = UserDefaults.standard.string(forKey: lastSeenKey)
        guard tip.id != lastSeen else { return }
        UserDefaults.standard.set(tip.id, forKey: lastSeenKey)

        // First run after install: record the current tip silently.
        guard lastSeen != nil, authorized else { return }

        let content = UNMutableNotificationContent()
        content.title = "New health tip"
        content.body = tip.content
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: tip.id,
            content: content,
            trigger: nil, // deliver immediately
        )
        center.add(request)
    }
}
