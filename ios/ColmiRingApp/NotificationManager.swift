import UserNotifications

/**
 Local notifications for health deviation alerts (HRV drop, resting-HR
 rise, very low sleep score). Permission is requested lazily the first
 time an alert arrives — the prompt is then clearly motivated. Already
 shown alerts are deduped by the recovery payload's timestamp.
 */
@MainActor
final class NotificationManager {
    static let shared = NotificationManager()

    private let stampKey = "alerts.lastNotifiedStamp"

    /** Posts a local notification for new alerts (deduped by `stamp`). */
    func notifyNewAlerts(_ alerts: [String], stamp: String) {
        guard !alerts.isEmpty, stamp != lastStamp else { return }
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .notDetermined:
                // Ask now; the alert that triggered this posts next time.
                center.requestAuthorization(options: [.alert, .sound]) { _, _ in }
            case .authorized, .provisional, .ephemeral:
                Task { @MainActor in
                    self.post(alerts, stamp: stamp)
                }
            case .denied:
                break
            @unknown default:
                break
            }
        }
    }

    private var lastStamp: String? {
        get { UserDefaults.standard.string(forKey: stampKey) }
        set { UserDefaults.standard.set(newValue, forKey: stampKey) }
    }

    private func post(_ alerts: [String], stamp: String) {
        let content = UNMutableNotificationContent()
        content.title = "Health alert"
        content.body = alerts.joined(separator: "\n")
        content.sound = .default
        let request = UNNotificationRequest(
            identifier: "health-alert-\(stamp)",
            content: content,
            trigger: nil,
        )
        UNUserNotificationCenter.current().add(request)
        lastStamp = stamp
    }
}
