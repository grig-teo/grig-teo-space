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
    private let goalKey = "alerts.lastGoalNotifiedDay"
    private let anomalyKey = "alerts.sentAnomalyKeys"

    /** Anomaly alerts (elevated HR, low SpO2) — one notification per new
     *  alert, deduped by a persisted key set. */
    func notifyAnomalies(_ alerts: [(key: String, text: String)]) {
        let sent = UserDefaults.standard.stringArray(forKey: anomalyKey) ?? []
        let fresh = alerts.filter { !sent.contains($0.key) }
        guard !fresh.isEmpty else { return }
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .notDetermined:
                center.requestAuthorization(options: [.alert, .sound]) { _, _ in }
            case .authorized, .provisional, .ephemeral:
                for alert in fresh.prefix(3) {
                    let content = UNMutableNotificationContent()
                    content.title = "Health alert"
                    content.body = alert.text
                    content.sound = .default
                    center.add(UNNotificationRequest(identifier: alert.key, content: content, trigger: nil))
                }
                let updated = Array((sent + fresh.map(\.key)).suffix(200))
                UserDefaults.standard.set(updated, forKey: self.anomalyKey)
            case .denied:
                break
            @unknown default:
                break
            }
        }
    }

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

    /** "Goal reached" milestone — once per local day, when today's steps
     *  cross the goal. */
    func notifyGoalReached(steps: Int, goal: Int, reached: Bool) {
        guard reached else { return }
        let today = Date().formatted(.dateTime.year().month().day())
        guard today != UserDefaults.standard.string(forKey: goalKey) else { return }
        UserDefaults.standard.set(today, forKey: goalKey)
        let content = UNMutableNotificationContent()
        content.title = "Step goal reached"
        content.body = "\(steps) steps today — goal of \(goal) hit. Keep it up tomorrow."
        content.sound = .default
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: "step-goal-\(today)", content: content, trigger: nil),
        )
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
