import SwiftUI

/** Displays the most recent value for one metric: the value, a wave
 *  placeholder while a sync is pulling it, or "—" when there's no data. */
struct MetricCard: View {
    let metric: RingMetric
    let value: Double?
    var loading = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(metric.displayName)
                .font(.caption)
                .foregroundColor(.secondary)
            HStack(alignment: .lastTextBaseline, spacing: 2) {
                if let value {
                    Text(format(value))
                        .font(.system(.title2, design: .rounded).bold())
                    if !metric.unit.isEmpty {
                        Text(metric.unit)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                } else if loading {
                    ShimmerLine()
                } else {
                    Text("—")
                        .font(.system(.title2, design: .rounded).bold())
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

/** Animated wave line shown on a card while its data is being read from
 *  the ring. */
private struct ShimmerLine: View {
    @State private var phase: CGFloat = -16

    var body: some View {
        RoundedRectangle(cornerRadius: 3)
            .fill(Color.secondary.opacity(0.15))
            .frame(width: 44, height: 14)
            .overlay(alignment: .leading) {
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color.secondary.opacity(0.55))
                    .frame(width: 14, height: 14)
                    .offset(x: phase)
            }
            .clipped()
            .onAppear {
                withAnimation(.linear(duration: 0.9).repeatForever(autoreverses: false)) {
                    phase = 46
                }
            }
    }
}
