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

    /// Caption for the range legend under a metric chart.
    var guideCaption: String {
        switch self {
        case .steps, .calories, .distanceKm:
            return "Typical daily totals"
        default:
            return "Typical adult ranges"
        }
    }

    /// Ordered low → high bands. Classification uses `lower` as the inclusive floor.
    var guideBands: [MetricBand] {
        switch self {
        case .heartRate: return Self.heartRateBands
        case .spo2: return Self.spo2Bands
        case .steps: return Self.stepsBands
        case .calories: return Self.caloriesBands
        case .distanceKm: return Self.distanceBands
        case .stress: return Self.stressBands
        case .hrv: return Self.hrvBands
        case .sleepDurationH: return Self.sleepDurationBands
        case .sleepQuality: return Self.sleepQualityBands
        }
    }

    /// Y-axis window that includes the guide bands (nil = leave the scale to data).
    /// Slot-based activity metrics skip this — their chart is 15-min totals, not daily.
    var chartGuideDomain: ClosedRange<Double>? {
        switch self {
        case .heartRate: return 40...140
        case .spo2: return 85...100
        case .stress: return 0...100
        case .hrv: return 0...100
        case .sleepDurationH: return 4...11
        case .sleepQuality: return 0...100
        default: return nil
        }
    }

    /// Band the value falls into, or nil when there are no bands.
    func classify(_ value: Double) -> MetricBand? {
        guideBands.last { value >= $0.lower }
    }
}

/** One labeled slice of a metric's typical range (Low / Normal / Best / …). */
struct MetricBand: Equatable, Identifiable {
    let label: String
    let rangeText: String
    let tone: MetricBandTone
    /// Inclusive floor. The next band's `lower` (or +∞) is the exclusive ceiling.
    let lower: Double

    var id: String { label }
}

enum MetricBandTone: String, Equatable {
    case best, normal, fair, low, high
}

private extension RingMetric {
    static let heartRateBands: [MetricBand] = [
        MetricBand(label: "Low", rangeText: "< 50", tone: .low, lower: -.infinity),
        MetricBand(label: "Normal", rangeText: "50–90", tone: .normal, lower: 50),
        MetricBand(label: "Elevated", rangeText: "90–120", tone: .fair, lower: 90),
        MetricBand(label: "High", rangeText: "≥ 120", tone: .high, lower: 120),
    ]

    static let spo2Bands: [MetricBand] = [
        MetricBand(label: "Low", rangeText: "< 90", tone: .high, lower: -.infinity),
        MetricBand(label: "Fair", rangeText: "90–94", tone: .low, lower: 90),
        MetricBand(label: "Normal", rangeText: "95–97", tone: .normal, lower: 95),
        MetricBand(label: "Best", rangeText: "98–100", tone: .best, lower: 98),
    ]

    static let stepsBands: [MetricBand] = [
        MetricBand(label: "Sedentary", rangeText: "< 5,000", tone: .low, lower: -.infinity),
        MetricBand(label: "Low", rangeText: "5,000–7,499", tone: .fair, lower: 5_000),
        MetricBand(label: "Typical", rangeText: "7,500–9,999", tone: .normal, lower: 7_500),
        MetricBand(label: "Goal", rangeText: "≥ 10,000", tone: .best, lower: 10_000),
    ]

    static let caloriesBands: [MetricBand] = [
        MetricBand(label: "Light", rangeText: "< 250", tone: .low, lower: -.infinity),
        MetricBand(label: "Typical", rangeText: "250–500", tone: .normal, lower: 250),
        MetricBand(label: "Active", rangeText: "500–800", tone: .best, lower: 500),
        MetricBand(label: "High", rangeText: "≥ 800", tone: .fair, lower: 800),
    ]

    static let distanceBands: [MetricBand] = [
        MetricBand(label: "Low", rangeText: "< 3", tone: .low, lower: -.infinity),
        MetricBand(label: "Typical", rangeText: "3–7", tone: .normal, lower: 3),
        MetricBand(label: "Goal", rangeText: "7–10", tone: .best, lower: 7),
        MetricBand(label: "High", rangeText: "≥ 10", tone: .fair, lower: 10),
    ]

    static let stressBands: [MetricBand] = [
        MetricBand(label: "Relaxed", rangeText: "0–25", tone: .best, lower: -.infinity),
        MetricBand(label: "Normal", rangeText: "26–50", tone: .normal, lower: 26),
        MetricBand(label: "Elevated", rangeText: "51–75", tone: .fair, lower: 51),
        MetricBand(label: "High", rangeText: "76–100", tone: .high, lower: 76),
    ]

    static let hrvBands: [MetricBand] = [
        MetricBand(label: "Low", rangeText: "< 20", tone: .high, lower: -.infinity),
        MetricBand(label: "Fair", rangeText: "20–40", tone: .low, lower: 20),
        MetricBand(label: "Good", rangeText: "40–70", tone: .normal, lower: 40),
        MetricBand(label: "Best", rangeText: "≥ 70", tone: .best, lower: 70),
    ]

    static let sleepDurationBands: [MetricBand] = [
        MetricBand(label: "Short", rangeText: "< 6", tone: .high, lower: -.infinity),
        MetricBand(label: "Low", rangeText: "6–7", tone: .low, lower: 6),
        MetricBand(label: "Best", rangeText: "7–9", tone: .best, lower: 7),
        MetricBand(label: "Long", rangeText: "> 9", tone: .fair, lower: 9.nextUp),
    ]

    static let sleepQualityBands: [MetricBand] = [
        MetricBand(label: "Poor", rangeText: "< 50", tone: .high, lower: -.infinity),
        MetricBand(label: "Fair", rangeText: "50–64", tone: .low, lower: 50),
        MetricBand(label: "Good", rangeText: "65–79", tone: .normal, lower: 65),
        MetricBand(label: "Best", rangeText: "≥ 80", tone: .best, lower: 80),
    ]
}
