import SwiftUI
import Charts

/**
 Today's stress by hour: a compact bar chart fed by `StressSeriesClient`.
 Renders one bar per clock hour that has readings; hours without data are
 simply absent (a gap) rather than drawn as a misleading zero. Used on the
 Profile page under the avatar.
 */
struct StressChartView: View {
    @ObservedObject var client: StressSeriesClient

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Stress today")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                if let latest = latestValue {
                    Text("\(Int(latest))")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.orange)
                }
            }

            content
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
        .task { await client.load() }
    }

    @ViewBuilder
    private var content: some View {
        if client.isLoading && client.series == nil {
            loadingPlaceholder
        } else if let series = client.series, !series.buckets.contains(where: { $0.value != nil }) {
            emptyState
        } else if let series = client.series {
            chart(for: series)
        } else {
            emptyState
        }
    }

    private var loadingPlaceholder: some View {
        ProgressView()
            .frame(maxWidth: .infinity, minHeight: 120)
    }

    private var emptyState: some View {
        Text("No stress data today")
            .font(.caption)
            .foregroundColor(.secondary)
            .frame(maxWidth: .infinity, minHeight: 120)
    }

    private func chart(for series: StressSeriesClient.StressSeries) -> some View {
        let points = series.buckets.compactMap { bucket -> HourPoint? in
            guard let value = bucket.value else { return nil }
            return HourPoint(hour: bucket.hour, value: value)
        }
        return Chart(points) { point in
            BarMark(
                x: .value("Hour", point.date, unit: .hour),
                y: .value("Stress", point.value),
            )
            .foregroundStyle(Color.orange.gradient)
            .cornerRadius(3)
        }
        .chartXAxis {
            AxisMarks(values: [0, 6, 12, 18, 23]) { value in
                AxisGridLine()
                AxisValueLabel(format: .dateTime.hour())
            }
        }
        .chartYAxis {
            AxisMarks { _ in
                AxisGridLine()
                AxisValueLabel()
            }
        }
        .frame(height: 140)
    }

    /// Most recent non-nil bucket value, for the header summary.
    private var latestValue: Double? {
        client.series?.buckets.last(where: { $0.value != nil })?.value
    }
}

private struct HourPoint: Identifiable {
    let id = UUID()
    let hour: Int
    let value: Double
}

extension HourPoint {
    /// Plottable date built from the hour-of-day, anchored at today.
    var date: Date {
        Calendar.current.date(
            bySettingHour: hour, minute: 0, second: 0,
            of: Date(),
        ) ?? Date()
    }
}
