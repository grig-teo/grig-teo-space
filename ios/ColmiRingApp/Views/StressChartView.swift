import SwiftUI
import Charts

/**
 Today's stress by hour: a bare bar chart fed by `StressSeriesClient`. One bar
 per clock hour that has readings, each labeled underneath with the exact time
 that hour's data was collected (HH:mm). The value axis runs down the right
 side as a percentage. No header, callout, or interaction — just the graph.
 */
struct StressChartView: View {
    @ObservedObject var client: StressSeriesClient

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Today's stress")
                .font(.caption)
                .foregroundColor(.secondary)
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
            .frame(maxWidth: .infinity, minHeight: 160)
    }

    private var emptyState: some View {
        Text("No stress data today")
            .font(.caption)
            .foregroundColor(.secondary)
            .frame(maxWidth: .infinity, minHeight: 160)
    }

    private func chart(for series: StressSeriesClient.StressSeries) -> some View {
        let points = series.buckets.compactMap { bucket -> Bar? in
            guard let value = bucket.value else { return nil }
            return Bar(hour: hourLabel(for: bucket), value: value)
        }
        return Chart(points) { bar in
            BarMark(
                x: .value("Time", bar.hour),
                y: .value("Stress", bar.value),
            )
            .foregroundStyle(stressColor(for: bar.value).gradient)
            .cornerRadius(3)
            // Time on top of each column — hour only, attached to the bar
            // (not the chart frame).
            .annotation(
                position: .top,
                spacing: 4,
            ) {
                Text(bar.hour)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        // No bottom axis labels — the time sits on top of each column.
        .chartXAxis(.hidden)
        // Value scale on the right, formatted as a percentage.
        .chartYAxis {
            AxisMarks(position: .trailing) { value in
                AxisGridLine()
                AxisValueLabel {
                    if let d = value.as(Double.self) {
                        Text("\(Int(d))%")
                    }
                }
                .font(.caption2)
            }
        }
        .frame(height: 200)
    }

    /// Hour-of-day (e.g. "14") of the most recent reading in this hour, shown
    /// on top of its column. Falls back to the bucket's hour if `latestAt` is
    /// missing.
    private func hourLabel(for bucket: StressSeriesClient.StressSeries.Bucket) -> String {
        let date = bucket.collectedAt
            ?? Calendar.current.date(
                bySettingHour: bucket.hour, minute: 0, second: 0, of: Date(),
            )
            ?? Date()
        return date.formatted(.dateTime.hour())
    }

    /// Maps a stress percentage to a color: green at 0% (calm) → yellow at
    /// 50% → red at 100% (high stress), via a hue rotation.
    private func stressColor(for value: Double) -> Color {
        let clamped = min(max(value, 0), 100) / 100
        // Hue: 0.33 (green) at low end → 0 (red) at high end.
        let hue = 0.33 * (1 - clamped)
        return Color(hue: hue, saturation: 0.8, brightness: 0.9)
    }
}

private struct Bar: Identifiable {
    let id = UUID()
    let hour: String
    let value: Double
}
