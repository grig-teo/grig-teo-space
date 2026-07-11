import Foundation
import Combine

/** App configuration persisted in UserDefaults, editable via the settings sheet. */
final class AppSettings: ObservableObject {
    static let shared = AppSettings()

    @Published var backendURL: String {
        didSet { UserDefaults.standard.set(backendURL, forKey: "backendURL") }
    }
    @Published var deviceKey: String {
        didSet { UserDefaults.standard.set(deviceKey, forKey: "deviceKey") }
    }
    @Published var demoMode: Bool {
        didSet { UserDefaults.standard.set(demoMode, forKey: "demoMode") }
    }

    private init() {
        let defaults = UserDefaults.standard
        self.backendURL = defaults.string(forKey: "backendURL") ?? "http://localhost:3001"
        self.deviceKey = defaults.string(forKey: "deviceKey") ?? "dev-device-key"
        self.demoMode = defaults.bool(forKey: "demoMode")
    }
}
