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
    /// Pinch-zoom state: 1 = full range, up to 16x (anchored at newest data).
    @State private var zoom: CGFloat = 1
    @State private var baseZoom: CGFloat = 1
    /// Pan state: seconds the visible window is shifted back from the
    /// newest reading (0 = latest data; grows as you drag left).
    @State private var pan: TimeInterval = 0
    @State private var basePan: TimeInterval = 0
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
        .navigationTitle(metric.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .toolbar(isLandscape ? .hidden : .visible, for: .navigationBar)
        .task(id: range) {
            await client.load(metric: metric, days: range.days)
        }
        .onChange(of: range) { _ in
            zoom = 1
            baseZoom = 1
            pan = 0
            basePan = 0
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
                chartControls
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
            .overlay(alignment: .bottom) {
                VStack(spacing: 8) {
                    MetricRangeBar(
                        metric: metric,
                        current: statValues.avg,
                        compact: true,
                    )
                    chartControls
                }
                .padding(.bottom, 8)
            }
            .background(Color(.systemBackground))
    }

    // --- Zoom / pan controls ---------------------------------------------------

    /** On-screen zoom/pan buttons (alternative to pinch/drag). Hidden when
     *  there is no data to move through. */
    @ViewBuilder
    private var chartControls: some View {
        if !points.isEmpty {
            HStack(spacing: 20) {
                controlButton("chevron.left", "Older") { panBy(0.5) }
                controlButton("minus.magnifyingglass", "Zoom out") { zoomBy(1 / 1.5) }
                controlButton("plus.magnifyingglass", "Zoom in") { zoomBy(1.5) }
                controlButton("chevron.right", "Newer") { panBy(-0.5) }
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func controlButton(
        _ icon: String,
        _ label: String,
        action: @escaping () -> Void,
    ) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.subheadline.weight(.semibold))
                .frame(width: 40, height: 32)
        }
        .buttonStyle(.bordered)
        .accessibilityLabel(label)
    }

    private func zoomBy(_ factor: CGFloat) {
        zoom = max(1, min(16, zoom * factor))
        baseZoom = zoom
        clampPan()
    }

    /** Moves the window by `spans` of the visible span (positive = older). */
    private func panBy(_ spans: Double) {
        pan += spans * currentSpan(for: points)
        clampPan()
    }

    private func clampPan() {
        let dates = points.map(\.date)
        guard let first = dates.first, let last = dates.last, last > first else {
            pan = 0
            basePan = 0
            return
        }
        let full = last.timeIntervalSince(first)
        let maxPan = max(0, full - full / zoom)
        pan = min(max(pan, 0), maxPan)
        basePan = pan
    }

    // --- Components --------------------------------------------------------

    private var statsCard: some View {
        HStack {
            stat("Avg", statValues.avg)
            Spacer()
            stat("Min", statValues.min)
            Spacer()
            stat("Max", statValues.max)
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
    }

    /** One-line stats used as an overlay in landscape. */
    private var statsLine: some View {
        Text(
            "avg \(format(statValues.avg)) · \(format(statValues.min))–\(format(statValues.max)) \(metric.unit)",
        )
        .font(.caption)
        .foregroundColor(.secondary)
    }

    /** Count metrics (steps/calories/distance) are meaningless as per-slot
     *  avg/min/max — stats are computed over DAILY totals instead. */
    private var statValues: (avg: Double?, min: Double?, max: Double?) {
        guard isCountMetric else {
            let s = client.series?.summary
            return (s?.avg, s?.min, s?.max)
        }
        let totals = dailyTotals(rawPoints).map(\.value)
        guard !totals.isEmpty else { return (nil, nil, nil) }
        return (
            totals.reduce(0, +) / Double(totals.count),
            totals.min(),
            totals.max(),
        )
    }

    /** Steps/calories/distance add up per day — everything else is a rate. */
    private var isCountMetric: Bool {
        metric == .steps || metric == .calories || metric == .distanceKm
    }

    /** Sums slot readings into daily totals (local days). */
    private func dailyTotals(_ plots: [Plot]) -> [Plot] {
        var byDay: [Date: Double] = [:]
        for plot in plots {
            let day = Calendar.current.startOfDay(for: plot.date)
            byDay[day, default: 0] += plot.value
        }
        return byDay.map { Plot(date: $0.key, value: $0.value) }
            .sorted { $0.date < $1.date }
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
        VStack(alignment: .leading, spacing: 12) {
            chart
                .frame(height: height)
            MetricRangeBar(metric: metric, current: statValues.avg)
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
    }

    @ViewBuilder
    private var chart: some View {
        if client.isLoading && points.isEmpty {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if points.isEmpty {
            Text("No \(metric.displayName.lowercased()) readings in the last \(range.label)")
                .font(.caption)
                .foregroundColor(.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            plottedChart
        }
    }

    private var plottedChart: some View {
        Chart {
            ForEach(guidePlotBands) { band in
                RectangleMark(
                    yStart: .value("low", band.lower),
                    yEnd: .value("high", band.upper),
                )
                .foregroundStyle(band.color.opacity(0.14))
            }
            ForEach(points) { point in
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
        }
        // Pinch zooms the time window (anchored at the newest data);
        // double-tap resets. chartXScale is iOS 16 — no scrollable-axes
        // dependency needed.
        .chartXScale(domain: visibleDomain(for: points))
        .modifier(YScaleIfPresent(domain: yDomain(for: points)))
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
        .clipped()
        .contentShape(Rectangle())
        .chartPanZoom(
            zoom: $zoom,
            baseZoom: $baseZoom,
            pan: $pan,
            basePan: $basePan,
            span: currentSpan(for: points),
        )
    }

    /** Seconds currently on screen (full range ÷ zoom). */
    private func currentSpan(for points: [Plot]) -> TimeInterval {
        let dates = points.map(\.date)
        guard let first = dates.first, let last = dates.last, last > first else { return 3600 }
        return last.timeIntervalSince(first) / zoom
    }

    /** Plottable points (parsed date + value) for the current range.
     *  Count metrics show DAILY totals on 7d/30d (hourly on 24h). */
    private var points: [Plot] {
        guard isCountMetric, range != .day else { return rawPoints }
        return dailyTotals(rawPoints)
    }

    /** Raw slot readings as plottable points. */
    private var rawPoints: [Plot] {
        (client.series?.points ?? []).compactMap { point in
            guard let date = point.date else { return nil }
            return Plot(date: date, value: point.value)
        }
    }

    /** The visible time window: full range at zoom 1; pinch narrows it,
     *  drag slides it back/forward (both clamped to the data). */
    private func visibleDomain(for points: [Plot]) -> ClosedRange<Date> {
        let dates = points.map(\.date)
        guard let first = dates.first, let last = dates.last, last > first else {
            return Date().addingTimeInterval(-3600)...Date()
        }
        let full = last.timeIntervalSince(first)
        let span = full / zoom
        let maxPan = max(0, full - span)
        let clampedPan = min(max(pan, 0), maxPan)
        let end = last - clampedPan
        let start = max(end - span, first)
        return start...max(end, start.addingTimeInterval(60))
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

    /** Horizontal colored bands for the typical ranges, clipped to the Y window. */
    private var guidePlotBands: [PlotBand] {
        guard let domain = metric.chartGuideDomain else { return [] }
        let bands = metric.guideBands
        return bands.enumerated().compactMap { index, band in
            plotBand(band, nextLower: bands[safe: index + 1]?.lower, domain: domain)
        }
    }

    private func plotBand(
        _ band: MetricBand,
        nextLower: Double?,
        domain: ClosedRange<Double>,
    ) -> PlotBand? {
        let lo = max(band.lower.isFinite ? band.lower : domain.lowerBound, domain.lowerBound)
        let rawHi = nextLower ?? domain.upperBound
        let hi = min(rawHi.isFinite ? rawHi : domain.upperBound, domain.upperBound)
        guard hi > lo else { return nil }
        return PlotBand(id: band.id, lower: lo, upper: hi, color: band.tone.color)
    }

    /** Union of the data and the typical-range window so the bands stay visible. */
    private func yDomain(for points: [Plot]) -> ClosedRange<Double>? {
        guard let guide = metric.chartGuideDomain else { return nil }
        let values = points.map(\.value)
        let lo = min(values.min() ?? guide.lowerBound, guide.lowerBound)
        let hi = max(values.max() ?? guide.upperBound, guide.upperBound)
        return lo...max(hi, lo + 1)
    }
}

/** Applies `chartYScale` only when a typical-range window exists. */
private struct YScaleIfPresent: ViewModifier {
    let domain: ClosedRange<Double>?

    func body(content: Content) -> some View {
        if let domain {
            content.chartYScale(domain: domain)
        } else {
            content
        }
    }
}

/** Drag pans, pinch zooms, double-tap resets — same gestures as before the
 *  range-band overlay was added. */
private struct ChartPanZoom: ViewModifier {
    @Binding var zoom: CGFloat
    @Binding var baseZoom: CGFloat
    @Binding var pan: TimeInterval
    @Binding var basePan: TimeInterval
    let span: TimeInterval

    func body(content: Content) -> some View {
        content
            .simultaneousGesture(
                DragGesture()
                    .onChanged { value in
                        pan = basePan - Double(value.translation.width) / 320 * span
                    }
                    .onEnded { _ in
                        basePan = pan
                    },
            )
            .gesture(
                MagnificationGesture()
                    .onChanged { scale in
                        zoom = max(1, min(16, baseZoom * scale))
                    }
                    .onEnded { _ in
                        baseZoom = zoom
                    },
            )
            .onTapGesture(count: 2) {
                zoom = 1
                baseZoom = 1
                pan = 0
                basePan = 0
            }
    }
}

private extension View {
    func chartPanZoom(
        zoom: Binding<CGFloat>,
        baseZoom: Binding<CGFloat>,
        pan: Binding<TimeInterval>,
        basePan: Binding<TimeInterval>,
        span: TimeInterval,
    ) -> some View {
        modifier(ChartPanZoom(
            zoom: zoom,
            baseZoom: baseZoom,
            pan: pan,
            basePan: basePan,
            span: span,
        ))
    }
}

/** One colored Y-band drawn behind the metric line. */
private struct PlotBand: Identifiable {
    let id: String
    let lower: Double
    let upper: Double
    let color: Color
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
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
