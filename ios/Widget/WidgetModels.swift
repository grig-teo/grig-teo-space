import Foundation

/** Codable mirror of the backend's `GET /api/health/widget` response.
 *
 *  Intentionally independent of the host app's types — the widget extension
 *  target does not depend on app sources, so it carries its own lightweight
 *  decodable shapes. Only the fields the widget renders are modeled. */

struct WidgetPayload: Codable {
    let summary: WidgetSummary
    let tip: WidgetTip
}

struct WidgetSummary: Codable {
    let metrics: [WidgetMetric]
    let alerts: [WidgetAlert]

    /** Finds the latest value for a metric identifier (e.g. "stress"). */
    func latest(_ metric: String) -> Double? {
        metrics.first { $0.metric == metric }?.latest?.value
    }
}

struct WidgetMetric: Codable {
    let metric: String
    let avg: Double?
    let latest: WidgetMetricPoint?
}

struct WidgetMetricPoint: Codable {
    let recordedAt: String
    let value: Double
}

struct WidgetAlert: Codable, Identifiable {
    let metric: String
    let level: String
    let message: String
    let value: Double
    let recordedAt: String

    var id: String { "\(metric)-\(level)-\(recordedAt)" }
}

struct WidgetTip: Codable {
    let tip: String?
    let generatedAt: String
    let skippedReason: String?
}
