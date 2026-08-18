import SwiftUI
import Charts

/**
 Metric detail page: a time-series chart for one ring metric with a
 24h / 7d / 30d range switcher (same ranges as the admin web health
 dashboard). Opened by tapping a "Latest readings" card on the Ring page.

 While this page is on screen the app allows landscape rotation (see
 `OrientationManager`); in landscape the chart takes over the full screen
 and the stats/picker collapse into a compact overlay.
 */
struct MetricDetailView: View {
    let metric: RingMetric

    @StateObject private var client = MetricSeriesClient()
    @State private var range: TimeRange = .day
    /// Compact vertical size class = iPhone in landscape.
    @Environment(\.verticalSizeClass) private var verticalSizeClass

    private var isLandscape: Bool { verticalSizeClass == .compact }

    var body: some View {
        Group {
            if isLandscape {
                landscapeLayout
            } else {
                portraitLayout
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(isLandscape ? .hidden : .visible, for: .navigationBar)
        .task(id: range) {
            await client.load(metric: metric, days: range.days)
        }
        .onAppear {
            OrientationManager.shared.set(.allButUpsideDown)
        }
        .onDisappear {
            OrientationManager.shared.set(.portrait)
        }
    }

    // --- Layouts -----------------------------------------------------------

    private var portraitLayout: some View {
        ScrollView {
            VStack(spacing: 16) {
                statsCard
                rangePicker
                chartCard(height: 260)
            }
            .padding()
        }
    }

    private var landscapeLayout: some View {
        chart
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.horizontal)
            .overlay(alignment: .top) {
                HStack {
                    statsLine
                    Spacer()
                    rangePicker
                        .frame(maxWidth: 260)
                }
                .padding(.horizontal)
                .padding(.top, 4)
            }
            .background(Color(.systemBackground))
    }

    // --- Components --------------------------------------------------------

    private var statsCard: some View {
        HStack {
            stat("Avg", client.series?.summary.avg)
            Spacer()
            stat("Min", client.series?.summary.min)
            Spacer()
            stat("Max", client.series?.summary.max)
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
    }

    /** One-line stats used as an overlay in landscape. */
    private var statsLine: some View {
        let s = client.series?.summary
        return Text(
            "avg \(format(s?.avg)) · \(format(s?.min))–\(format(s?.max)) \(metric.unit)",
        )
        .font(.caption)
        .foregroundColor(.secondary)
    }

    private func stat(_ label: String, _ value: Double?) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
            HStack(alignment: .lastTextBaseline, spacing: 2) {
                Text(format(value))
                    .font(.system(.title3, design: .rounded).bold())
                if !metric.unit.isEmpty {
                    Text(metric.unit)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
        }
    }

    private var rangePicker: some View {
        Picker("Range", selection: $range) {
            ForEach(TimeRange.allCases, id: \.self) { range in
                Text(range.label).tag(range)
            }
        }
        .pickerStyle(.segmented)
    }

    private func chartCard(height: CGFloat) -> some View {
        chart
            .frame(height: height)
            .padding()
            .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
    }

    @ViewBuilder
    private var chart: some View {
        let points = (client.series?.points ?? []).compactMap { point -> Plot? in
            guard let date = point.date else { return nil }
            return Plot(date: date, value: point.value)
        }
        if client.isLoading && points.isEmpty {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if points.isEmpty {
            Text("No \(metric.displayName.lowercased()) readings in the last \(range.label)")
                .font(.caption)
                .foregroundColor(.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            Chart(points) { point in
                LineMark(
                    x: .value("Time", point.date),
                    y: .value(metric.displayName, point.value),
                )
                .interpolationMethod(.catmullRom)
                .foregroundStyle(Color.accentColor)
                AreaMark(
                    x: .value("Time", point.date),
                    y: .value(metric.displayName, point.value),
                )
                .interpolationMethod(.catmullRom)
                .foregroundStyle(Color.accentColor.opacity(0.12))
            }
            .chartXAxis {
                AxisMarks { value in
                    AxisGridLine()
                    AxisValueLabel {
                        if let date = value.as(Date.self) {
                            Text(date, format: range.axisFormat)
                                .font(.caption2)
                        }
                    }
                }
            }
            .chartYAxis {
                AxisMarks(position: .trailing) { _ in
                    AxisGridLine()
                    AxisValueLabel()
                        .font(.caption2)
                }
            }
        }
    }

    private func format(_ value: Double?) -> String {
        guard let value else { return "—" }
        switch metric {
        case .sleepDurationH, .distanceKm:
            return String(format: "%.1f", value)
        default:
            return String(Int(value))
        }
    }
}

/** Selectable chart windows. `axisFormat` switches the time labels from
 *  clock hours (24h) to day+month (7d/30d). */
private enum TimeRange: CaseIterable {
    case day, week, month

    var days: Int {
        switch self {
        case .day: return 1
        case .week: return 7
        case .month: return 30
        }
    }

    var label: String {
        switch self {
        case .day: return "24h"
        case .week: return "7d"
        case .month: return "30d"
        }
    }

    var axisFormat: Date.FormatStyle {
        switch self {
        case .day: return .dateTime.hour().minute()
        case .week, .month: return .dateTime.day().month(.abbreviated)
        }
    }
}

/** One plottable reading (valid parsed date + value). */
private struct Plot: Identifiable {
    let date: Date
    let value: Double

    var id: Date { date }
}
