import SwiftUI
import Charts

/**
 "Weather & You": local weather (fetched server-side from Open-Meteo using
 the location this app pushes) overlaid on ring metrics, plus plain-English
 weather × health correlations.

 Layout mirrors `MetricDetailView`: a 24h/7d/30d range switcher, and the
 chart goes full-screen in landscape via `OrientationManager`.
 */
struct WeatherView: View {
    @StateObject private var weather = WeatherClient()
    @StateObject private var metricSeries = MetricSeriesClient()

    @State private var range: ChartRange = .day
    @State private var metric: RingMetric = .stress
    @State private var weatherVar: WeatherVar = .temperature
    /// Zoom/pan state for the overlay chart (see MetricDetailView).
    @State private var zoom: CGFloat = 1
    @State private var baseZoom: CGFloat = 1
    @State private var pan: TimeInterval = 0
    @State private var basePan: TimeInterval = 0
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
        .navigationTitle("Weather & You")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .toolbar(isLandscape ? .hidden : .visible, for: .navigationBar)
        .task(id: range) { await weather.load(days: range.days) }
        .onChange(of: range) { _ in resetView() }
        .task(id: "\(metric.rawValue)-\(range.days)") {
            await metricSeries.load(metric: metric, days: range.days)
        }
        .task { await weather.loadCorrelations() }
        .onAppear {
            // Ask for location (first time) and unlock landscape rotation.
            LocationManager.shared.shareLocation()
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
                currentCard
                rangePicker
                overlayChart(height: 260)
                chartControls
                pickers
                insightsCard
            }
            .padding()
        }
    }

    private var landscapeLayout: some View {
        overlayChart(height: nil)
            .padding(.horizontal)
            .overlay(alignment: .top) {
                HStack {
                    legend
                    Spacer()
                    rangePicker
                        .frame(maxWidth: 240)
                }
                .padding(.horizontal)
                .padding(.top, 4)
            }
            .overlay(alignment: .bottom) {
                chartControls
                    .padding(.bottom, 8)
            }
    }

    // --- Current conditions --------------------------------------------------

    private var currentCard: some View {
        let current = weather.series?.current
        return HStack(spacing: 16) {
            Image(systemName: conditionIcon(current?.conditionCode))
                .font(.system(size: 34))
                .foregroundStyle(.orange)
                .frame(width: 48)
            VStack(alignment: .leading, spacing: 2) {
                Text(current.map { "\(Int($0.temperatureC.rounded()))°C" } ?? "—")
                    .font(.system(.title, design: .rounded).bold())
                if let feels = current?.feelsLikeC {
                    Text("feels like \(Int(feels.rounded()))°C")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                if let pressure = current?.pressureHpa {
                    Text("\(Int(pressure.rounded())) hPa")
                }
                if let humidity = current?.humidityPct {
                    Text("\(Int(humidity.rounded()))% humidity")
                }
            }
            .font(.caption)
            .foregroundColor(.secondary)
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
    }

    /// WMO weather code → SF Symbol.
    private func conditionIcon(_ code: Int?) -> String {
        guard let code else { return "cloud.fill" }
        switch code {
        case 0: return "sun.max.fill"
        case 1, 2, 3: return "cloud.sun.fill"
        case 45, 48: return "cloud.fog.fill"
        case 51...67, 80...82: return "cloud.rain.fill"
        case 71...77, 85, 86: return "cloud.snow.fill"
        case 95...99: return "cloud.bolt.rain.fill"
        default: return "cloud.fill"
        }
    }

    // --- Pickers -------------------------------------------------------------

    private var rangePicker: some View {
        Picker("Range", selection: $range) {
            ForEach(ChartRange.allCases, id: \.self) { Text($0.label).tag($0) }
        }
        .pickerStyle(.segmented)
    }

    private var pickers: some View {
        HStack(spacing: 12) {
            Picker("Metric", selection: $metric) {
                Text("Stress").tag(RingMetric.stress)
                Text("HRV").tag(RingMetric.hrv)
                Text("Heart Rate").tag(RingMetric.heartRate)
            }
            Picker("Weather", selection: $weatherVar) {
                Text("Temperature").tag(WeatherVar.temperature)
                Text("Pressure").tag(WeatherVar.pressure)
            }
        }
        .pickerStyle(.menu)
    }

    // --- Overlay chart ---------------------------------------------------------

    private var legend: some View {
        HStack(spacing: 12) {
            Label(metric.displayName, systemImage: "heart.fill")
                .foregroundStyle(Color.accentColor)
            Label(weatherVar.label, systemImage: weatherVar == .temperature ? "thermometer" : "barometer")
                .foregroundStyle(.orange)
        }
        .font(.caption)
    }

    private func overlayChart(height: CGFloat?) -> some View {
        let domain = visibleDomain()

        return VStack(alignment: .leading, spacing: 8) {
            legend
            ZStack {
                if weatherPlots.isEmpty && metricPlots.isEmpty && !weather.isLoading {
                    Text("No data yet — allow location access and check back soon")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    weatherChart(weatherPlots, domain: domain)
                    metricChart(metricPlots, domain: domain)
                }
            }
            // Gestures on the stack: contentShape makes the whole plot area
            // touchable, drag pans, pinch zooms, double-tap resets.
            .contentShape(Rectangle())
            .simultaneousGesture(
                DragGesture()
                    .onChanged { value in
                        pan = basePan - Double(value.translation.width) / 320 * currentSpan
                    }
                    .onEnded { _ in basePan = pan },
            )
            .gesture(
                MagnificationGesture()
                    .onChanged { scale in
                        zoom = max(1, min(16, baseZoom * scale))
                    }
                    .onEnded { _ in baseZoom = zoom },
            )
            .onTapGesture(count: 2) { resetView() }
            .frame(height: height)
            .frame(maxHeight: height == nil ? .infinity : nil)
        }
        .padding(height == nil ? 0 : 16)
        .background(height == nil ? nil : RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
    }

    // --- Zoom / pan (same interaction model as the metric detail charts) -------

    private var weatherPlots: [Plot] {
        plots(from: weather.series?.points ?? [])
    }

    private var metricPlots: [Plot] {
        (metricSeries.series?.points ?? []).compactMap { point in
            guard let date = point.date else { return nil }
            return Plot(date: date, value: point.value)
        }
    }

    /** Seconds on screen at the current zoom (full range ÷ zoom). */
    private var currentSpan: TimeInterval {
        let dates = (weatherPlots + metricPlots).map(\.date)
        guard let first = dates.min(), let last = dates.max(), last > first else { return 3600 }
        return last.timeIntervalSince(first) / zoom
    }

    /** The shared visible time window for both overlaid charts. */
    private func visibleDomain() -> ClosedRange<Date> {
        let dates = (weatherPlots + metricPlots).map(\.date)
        guard let first = dates.min(), let last = dates.max(), last > first else {
            return Date().addingTimeInterval(-3600)...Date()
        }
        let full = last.timeIntervalSince(first)
        let span = full / zoom
        let clampedPan = min(max(pan, 0), max(0, full - span))
        let end = last - clampedPan
        let start = max(end - span, first)
        return start...max(end, start.addingTimeInterval(60))
    }

    private func resetView() {
        zoom = 1
        baseZoom = 1
        pan = 0
        basePan = 0
    }

    private func zoomBy(_ factor: CGFloat) {
        zoom = max(1, min(16, zoom * factor))
        baseZoom = zoom
        clampPan()
    }

    /** Moves the window by `spans` of the visible span (positive = older). */
    private func panBy(_ spans: Double) {
        pan += spans * currentSpan
        clampPan()
    }

    private func clampPan() {
        let dates = (weatherPlots + metricPlots).map(\.date)
        guard let first = dates.min(), let last = dates.max(), last > first else {
            pan = 0
            basePan = 0
            return
        }
        let full = last.timeIntervalSince(first)
        pan = min(max(pan, 0), max(0, full - full / zoom))
        basePan = pan
    }

    /** On-screen zoom/pan buttons (alternative to pinch/drag). */
    @ViewBuilder
    private var chartControls: some View {
        if !weatherPlots.isEmpty || !metricPlots.isEmpty {
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

    private func weatherChart(_ points: [Plot], domain: ClosedRange<Date>) -> some View {
        Chart(points) { point in
            LineMark(x: .value("Time", point.date), y: .value("Weather", point.value))
                .interpolationMethod(.catmullRom)
                .foregroundStyle(.orange)
        }
        .chartXScale(domain: domain)
        .chartXAxis {
            AxisMarks { value in
                AxisGridLine()
                AxisValueLabel {
                    if let date = value.as(Date.self) {
                        Text(date, format: range.axisFormat).font(.caption2)
                    }
                }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading) { _ in
                AxisValueLabel()
                    .font(.caption2)
                    .foregroundStyle(.orange)
            }
        }
        .clipped()
    }

    private func metricChart(_ points: [Plot], domain: ClosedRange<Date>) -> some View {
        Chart(points) { point in
            LineMark(x: .value("Time", point.date), y: .value(metric.displayName, point.value))
                .interpolationMethod(.catmullRom)
                .foregroundStyle(Color.accentColor)
        }
        .chartXScale(domain: domain)
        .chartXAxis(.hidden)
        .chartYAxis {
            AxisMarks(position: .trailing) { _ in
                AxisValueLabel()
                    .font(.caption2)
                    .foregroundStyle(Color.accentColor)
            }
        }
        .clipped()
    }

    // --- Insights -------------------------------------------------------------

    private var insightsCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Insights (last 30 days)")
                .font(.caption)
                .foregroundColor(.secondary)
            let statements = weather.correlations?.statements ?? []
            if statements.isEmpty {
                Text("Not enough overlapping data yet to find weather patterns.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            } else {
                ForEach(statements, id: \.self) { statement in
                    HStack(alignment: .top, spacing: 6) {
                        Text("—").foregroundStyle(Color.accentColor)
                        Text(statement)
                    }
                    .font(.caption)
                    .foregroundColor(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
    }

    private func plots(from points: [WeatherClient.WeatherSeries.Point]) -> [Plot] {
        points.compactMap { point in
            guard let date = point.date else { return nil }
            let value = weatherVar == .temperature ? point.temperatureC : point.pressureHpa
            guard let value else { return nil }
            return Plot(date: date, value: value)
        }
    }
}

/** Selectable chart windows (same ranges as the metric detail pages). */
private enum ChartRange: CaseIterable {
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

/** Which weather variable the overlay chart shows. */
private enum WeatherVar {
    case temperature, pressure

    var label: String {
        switch self {
        case .temperature: return "Temperature"
        case .pressure: return "Pressure"
        }
    }
}

/** One plottable point (valid date + value). */
private struct Plot: Identifiable {
    let date: Date
    let value: Double

    var id: Date { date }
}
