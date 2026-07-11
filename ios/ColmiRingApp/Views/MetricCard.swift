import SwiftUI

/** Displays the most recent value for one metric. */
struct MetricCard: View {
    let metric: RingMetric
    let value: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(metric.displayName)
                .font(.caption)
                .foregroundColor(.secondary)
            HStack(alignment: .lastTextBaseline, spacing: 2) {
                Text(format(value))
                    .font(.system(.title2, design: .rounded).bold())
                if !metric.unit.isEmpty {
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
        metric == .sleepDurationH || metric == .distanceKm
            ? String(format: "%.1f", v)
            : String(Int(v))
    }
}
