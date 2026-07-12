import Foundation
import Combine

/** App configuration.
 *
 *  `backendURL` and `deviceKey` are baked into the binary at build time via
 *  `Shared.xcconfig` → Info.plist keys `BACKEND_URL` / `DEVICE_API_KEY`, so
 *  the host app and the widget extension carry identical values without
 *  needing a shared App Group (which would require a paid developer account).
 *
 *  `demoMode` is a runtime preference persisted in UserDefaults.standard —
 *  the widget does not read it, and the app is the only writer. */
final class AppSettings: ObservableObject {
    static let shared = AppSettings()

    @Published var demoMode: Bool {
        didSet { UserDefaults.standard.set(demoMode, forKey: "demoMode") }
    }

    /** Backend base URL, baked into Info.plist at build time. Trailing slash
     *  trimmed so URL construction joins cleanly. Read-only at runtime. */
    let backendURL: String
    /** Shared device key, baked into Info.plist at build time. Read-only. */
    let deviceKey: String

    private init() {
        let info = Bundle.main.infoDictionary
        self.backendURL = (info?["BACKEND_URL"] as? String ?? "http://localhost:3001")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        self.deviceKey = info?["DEVICE_API_KEY"] as? String ?? "dev-device-key"
        self.demoMode = UserDefaults.standard.bool(forKey: "demoMode")
    }
}
