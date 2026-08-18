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
final class LocationManager: NSObject, ObservableObject {
    static let shared = LocationManager()

    /// Whether the user granted (any) location authorization.
    private(set) var isAuthorized = false

    /// Reverse-geocoded city/locality of the last uploaded location, shown
    /// next to the weather on the Profile page. Persisted across launches.
    @Published private(set) var locality: String?

    private let manager = CLLocationManager()
    private let settings = AppSettings.shared
    private let lastSentKey = "location.lastSentAt"
    private let localityKey = "location.locality"

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        isAuthorized = Self.authorized(manager.authorizationStatus)
        locality = UserDefaults.standard.string(forKey: localityKey)
    }

    /**
     * Requests permission on first use, then pushes the current location to
     * the backend. The backend upload is throttled to one per hour, but the
     * on-device locality (city label) is refreshed whenever it's missing.
     */
    func shareLocation(force: Bool = false) {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            isAuthorized = true
            if force || needsUpload || locality == nil {
                manager.requestLocation()
            }
        case .denied, .restricted:
            isAuthorized = false
        @unknown default:
            break
        }
    }

    /// True when the last backend upload is older than the 1h throttle.
    private var needsUpload: Bool {
        guard let last = lastSent else { return true }
        return Date().timeIntervalSince(last) >= 3600
    }

    private var lastSent: Date? {
        get { UserDefaults.standard.object(forKey: lastSentKey) as? Date }
        set { UserDefaults.standard.set(newValue, forKey: lastSentKey) }
    }

    private static func authorized(_ status: CLAuthorizationStatus) -> Bool {
        status == .authorizedWhenInUse || status == .authorizedAlways
    }

    /** Handles a fresh fix: uploads when the throttle allows, always
     *  refreshes the city label. */
    private func handle(_ coordinate: CLLocationCoordinate2D) {
        if needsUpload { upload(coordinate) }
        Task { await reverseGeocode(coordinate) }
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

    /// Resolves coordinates to a city name for display (on-device, no API).
    private func reverseGeocode(_ coordinate: CLLocationCoordinate2D) async {
        let location = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        let placemarks = try? await CLGeocoder().reverseGeocodeLocation(location)
        guard let name = placemarks?.first?.locality ?? placemarks?.first?.subAdministrativeArea else { return }
        locality = name
        UserDefaults.standard.set(name, forKey: localityKey)
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
            LocationManager.shared.handle(coordinate)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // A failed one-shot request is not fatal — the next shareLocation()
        // call (app foreground, weather view open) retries.
    }
}
