import SwiftUI
import Charts

/**
 Today's stress by hour: a compact bar chart fed by `StressSeriesClient`.
 Renders one bar per clock hour that has readings; hours without data are
 simply absent (a gap) rather than drawn as a misleading zero. Used on the
 Profile page under the avatar.

 Tap or drag across the bars to inspect one — a callout shows that hour's
 average value together with the exact time the data was collected (the most
 recent reading within that hour). The callout defaults to the latest data
 point so a collection time is always visible.
 */
struct StressChartView: View {
    @ObservedObject var client: StressSeriesClient
    @State private var selectedHour: Int?

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
            return HourPoint(hour: bucket.hour, value: value, collectedAt: bucket.collectedAt)
        }
        let initialHour = selectedHour ?? points.last?.hour
        return Chart(points) { point in
            BarMark(
                x: .value("Hour", point.date, unit: .hour),
                y: .value("Stress", point.value),
            )
            .foregroundStyle(point.hour == selectedHour
                ? Color.orange.opacity(0.85).gradient
                : Color.orange.opacity(0.45).gradient)
            .cornerRadius(3)
        }
        .chartXAxis {
            AxisMarks(values: [0, 6, 12, 18, 23]) { _ in
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
        .chartOverlay { proxy in
            selectionOverlay(proxy: proxy, points: points, initialHour: initialHour)
        }
        .overlay(alignment: .topTrailing) {
            if let hour = selectedHour ?? initialHour,
               let point = points.first(where: { $0.hour == hour }) {
                callout(for: point)
                    .padding(.bottom, 8)
            }
        }
        .frame(height: 180)
    }

    /// Maps drag/tap location to the nearest hour bar and publishes the
    /// selection so the callout + highlight update as the finger moves.
    @ViewBuilder
    private func selectionOverlay(
        proxy: ChartProxy,
        points: [HourPoint],
        initialHour: Int?,
    ) -> some View {
        GeometryReader { geo in
            Rectangle().fill(.clear).contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            // Inside chartOverlay the GeometryReader is sized
                            // to the plot area, so the gesture location is
                            // already in plot-relative coordinates.
                            let x = value.location.x - geo.frame(in: .local).minX
                            guard let date: Date = proxy.value(atX: x, as: Date.self) else { return }
                            selectedHour = nearestHour(to: date, in: points) ?? initialHour
                        }
                        .onEnded { _ in /* keep the selection after release */ }
                )
        }
    }

    /// Finds the hour of the data point closest to the touched x-position.
    private func nearestHour(to date: Date, in points: [HourPoint]) -> Int? {
        let target = date.timeIntervalSince1970
        return points.min(by: {
            abs($0.date.timeIntervalSince1970 - target)
                < abs($1.date.timeIntervalSince1970 - target)
        })?.hour
    }

    /// Floating label showing the value and the exact collection time.
    private func callout(for point: HourPoint) -> some View {
        VStack(spacing: 2) {
            Text("\(Int(point.value))")
                .font(.caption.weight(.bold))
                .foregroundColor(.orange)
            if let collected = point.collectedAt {
                Text(collected, format: .dateTime.hour().minute())
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Capsule().fill(Color(.systemBackground)))
        .overlay(Capsule().stroke(Color(.separator), lineWidth: 0.5))
        .shadow(color: .black.opacity(0.1), radius: 2, y: 1)
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
    /// When the most recent reading in this hour was collected (may be nil if
    /// the backend omitted `latestAt`).
    let collectedAt: Date?

    /// Plottable date built from the hour-of-day, anchored at today.
    var date: Date {
        Calendar.current.date(
            bySettingHour: hour, minute: 0, second: 0,
            of: Date(),
        ) ?? Date()
    }
}
