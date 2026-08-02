import SwiftUI

/** Displays the most recent value for one metric, or "—" until the first
 *  reading of that kind arrives. */
struct MetricCard: View {
    let metric: RingMetric
    let value: Double?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(metric.displayName)
                .font(.caption)
                .foregroundColor(.secondary)
            HStack(alignment: .lastTextBaseline, spacing: 2) {
                Text(value.map(format) ?? "—")
                    .font(.system(.title2, design: .rounded).bold())
                if value != nil, !metric.unit.isEmpty {
                    Text(metric.unit)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
    }

    private func format(_ v: Double) -> String {
        switch metric {
        case .sleepDurationH, .bodyTemperature:
            return String(format: "%.1f", v)
        case .distanceKm:
            return String(format: "%.2f", v)
        default:
            return String(Int(v))
        }
    }
}
