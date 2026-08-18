import CoreLocation
import Foundation

/**
 Shares the owner's location with the backend so it can fetch local weather
 (Open-Meteo) for the weather × health correlations. The backend stores only
 coordinates rounded to ~100 m.

 Permission is requested lazily: the first call to `shareLocation()` asks for
 When-In-Use authorization; later calls are silent. Uploads are throttled to
 one per hour — weather changes slowly, and the app isn't a tracker.
 */
@MainActor
final class LocationManager: NSObject {
    static let shared = LocationManager()

    /// Whether the user granted (any) location authorization.
    private(set) var isAuthorized = false

    private let manager = CLLocationManager()
    private let settings = AppSettings.shared
    private let lastSentKey = "location.lastSentAt"

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        isAuthorized = Self.authorized(manager.authorizationStatus)
    }

    /**
     * Requests permission on first use, then pushes the current location to
     * the backend. No-op when throttled or when the user denied permission.
     */
    func shareLocation(force: Bool = false) {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            isAuthorized = true
            if !force, let last = lastSent, Date().timeIntervalSince(last) < 3600 { return }
            manager.requestLocation()
        case .denied, .restricted:
            isAuthorized = false
        @unknown default:
            break
        }
    }

    private var lastSent: Date? {
        get { UserDefaults.standard.object(forKey: lastSentKey) as? Date }
        set { UserDefaults.standard.set(newValue, forKey: lastSentKey) }
    }

    private static func authorized(_ status: CLAuthorizationStatus) -> Bool {
        status == .authorizedWhenInUse || status == .authorizedAlways
    }

    private func upload(_ location: CLLocationCoordinate2D) {
        guard let url = URL(string: "\(settings.backendURL)/api/health/weather/location") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "PUT"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(settings.deviceKey, forHTTPHeaderField: "X-Device-Key")
        req.httpBody = try? JSONEncoder().encode(["lat": location.latitude, "lon": location.longitude])
        guard req.httpBody != nil else { return }
        URLSession.shared.dataTask(with: req).resume()
        lastSent = Date()
    }
}

extension LocationManager: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            let granted = Self.authorized(manager.authorizationStatus)
            LocationManager.shared.isAuthorized = granted
            if granted { LocationManager.shared.shareLocation() }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let coordinate = locations.last?.coordinate else { return }
        Task { @MainActor in
            LocationManager.shared.upload(coordinate)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // A failed one-shot request is not fatal — the next shareLocation()
        // call (app foreground, weather view open) retries.
    }
}
