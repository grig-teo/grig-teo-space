import Foundation

/** Metrics collected from the ring, matching the backend's metric identifiers. */
enum RingMetric: String, CaseIterable, Codable {
    case heartRate = "heart_rate"
    case spo2 = "spo2"
    case steps = "steps"
    case calories = "calories"
    case distanceKm = "distance_km"
    case stress = "stress"
    case hrv = "hrv"
    case sleepDurationH = "sleep_duration_h"
    case sleepQuality = "sleep_quality"

    var displayName: String {
        switch self {
        case .heartRate: return "Heart Rate"
        case .spo2: return "Blood Oxygen"
        case .steps: return "Steps"
        case .calories: return "Calories"
        case .distanceKm: return "Distance"
        case .stress: return "Stress"
        case .hrv: return "HRV"
        case .sleepDurationH: return "Sleep"
        case .sleepQuality: return "Sleep Quality"
        }
    }

    var unit: String {
        switch self {
        case .heartRate: return "bpm"
        case .spo2: return "%"
        case .steps: return ""
        case .calories: return "kcal"
        case .distanceKm: return "km"
        case .stress: return ""
        case .hrv: return "ms"
        case .sleepDurationH: return "h"
        case .sleepQuality: return "%"
        }
    }
}
