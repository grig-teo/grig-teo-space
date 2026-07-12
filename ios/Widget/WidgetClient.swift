import Foundation

/** Reads the baked-in backend URL + device key from the widget's own Info.plist
 *  and fetches the combined widget payload.
 *
 *  Both values come from `Shared.xcconfig` at build time (same file as the host
 *  app), so the widget carries its own copy — no App Group / shared container
 *  needed. */
enum WidgetClient {
    private static let timeout: TimeInterval = 12

    /** Fetches `/api/health/widget`. Returns nil on any failure — the caller
     *  shows a placeholder state rather than crashing the timeline. */
    static func fetchPayload() async -> WidgetPayload? {
        guard let (base, deviceKey) = config() else { return nil }
        guard let url = URL(string: "\(base)/api/health/widget") else { return nil }

        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.setValue(deviceKey, forHTTPHeaderField: "X-Device-Key")

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse, http.statusCode == 200
        else { return nil }
        return try? JSONDecoder().decode(WidgetPayload.self, from: data)
    }

    /** Backend URL + device key from the widget's own Info.plist, trimming
     *  trailing slashes from the URL so the path joins cleanly. */
    private static func config() -> (base: String, deviceKey: String)? {
        let info = Bundle.main.infoDictionary
        let base = (info?["BACKEND_URL"] as? String ?? "http://localhost:3001")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let deviceKey = info?["DEVICE_API_KEY"] as? String ?? "dev-device-key"
        guard !base.isEmpty, !deviceKey.isEmpty else { return nil }
        return (base, deviceKey)
    }
}
