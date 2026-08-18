import Foundation

/** A single reading, matching the backend's `/api/health/readings` DTO. */
struct HealthReading: Codable, Identifiable {
    var id = UUID()
    let metric: String
    let value: Double
    let unit: String?
    let recordedAt: Date
    var source: String = "ring"
    var raw: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case metric, value, unit
        case recordedAt // backend reads camelCase `recordedAt`
        case source, raw
    }

    init(metric: RingMetric, value: Double, recordedAt: Date = Date(), source: String = "ring") {
        self.metric = metric.rawValue
        self.value = value
        self.unit = metric.unit.isEmpty ? nil : metric.unit
        self.recordedAt = recordedAt
        self.source = source
        self.raw = nil
    }

    /** Custom encode: the backend expects ISO8601 under `recordedAt`. */
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(metric, forKey: .metric)
        try container.encode(value, forKey: .value)
        try container.encodeIfPresent(unit, forKey: .unit)
        try container.encode(ISO8601DateFormatter.shared.string(from: recordedAt), forKey: .recordedAt)
        try container.encode(source, forKey: .source)
        try container.encodeIfPresent(raw, forKey: .raw)
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = UUID()
        self.metric = try container.decode(String.self, forKey: .metric)
        self.value = try container.decode(Double.self, forKey: .value)
        self.unit = try container.decodeIfPresent(String.self, forKey: .unit)
        let raw = try container.decode(String.self, forKey: .recordedAt)
        self.recordedAt = ISO8601DateFormatter.shared.date(from: raw) ?? Date()
        self.source = try container.decodeIfPresent(String.self, forKey: .source) ?? "ring"
        self.raw = nil
    }
}

/** Shared ISO8601 formatter with milliseconds, matching the backend's timestamptz. */
extension ISO8601DateFormatter {
    static let shared: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}

/**
 Tiny type-erased wrapper so `raw` can carry arbitrary JSON to the backend.
 Adapted from the standard AnyCodable pattern.
 */
struct AnyCodable: Codable {
    let value: Any
    init(_ value: Any) { self.value = value }
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let int = try? container.decode(Int.self) { value = int }
        else if let double = try? container.decode(Double.self) { value = double }
        else if let string = try? container.decode(String.self) { value = string }
        else if let bool = try? container.decode(Bool.self) { value = bool }
        else { value = NSNull() }
    }
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let v as Int: try container.encode(v)
        case let v as Double: try container.encode(v)
        case let v as String: try container.encode(v)
        case let v as Bool: try container.encode(v)
        default: try container.encodeNil()
        }
    }
}
