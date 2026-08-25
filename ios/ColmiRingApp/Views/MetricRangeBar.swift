import SwiftUI

/**
 Colored Low / Normal / Best (etc.) legend shown under a metric chart.
 Highlights the band the current average falls into.
 */
struct MetricRangeBar: View {
    let metric: RingMetric
    var current: Double?
    var compact = false

    var body: some View {
        if compact {
            compactRow
        } else {
            fullLegend
        }
    }

    private var fullLegend: some View {
        VStack(alignment: .leading, spacing: 8) {
            header
            HStack(alignment: .top, spacing: 2) {
                ForEach(metric.guideBands) { band in
                    bandColumn(band)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    private var compactRow: some View {
        HStack(spacing: 8) {
            ForEach(metric.guideBands) { band in
                HStack(spacing: 3) {
                    Circle()
                        .fill(band.tone.color)
                        .frame(width: 6, height: 6)
                    Text("\(band.label) \(band.rangeText)")
                        .fontWeight(isCurrent(band) ? .semibold : .regular)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
            }
        }
        .font(.caption2)
        .foregroundColor(.secondary)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    private var header: some View {
        HStack(spacing: 6) {
            Text(metric.guideCaption)
            if !metric.unit.isEmpty {
                Text("·")
                Text(metric.unit)
            }
            Spacer()
            if let current, let band = metric.classify(current) {
                Text(band.label)
                    .fontWeight(.semibold)
                    .foregroundColor(band.tone.color)
            }
        }
        .font(.caption)
        .foregroundColor(.secondary)
    }

    private func bandColumn(_ band: MetricBand) -> some View {
        let active = isCurrent(band)
        return VStack(spacing: 4) {
            Image(systemName: "arrowtriangle.down.fill")
                .font(.system(size: 8))
                .foregroundColor(active ? band.tone.color : .clear)
            RoundedRectangle(cornerRadius: 3)
                .fill(band.tone.color.opacity(active ? 1 : 0.4))
                .frame(height: 8)
            Text(band.label)
                .font(.caption2.weight(active ? .semibold : .regular))
                .foregroundColor(active ? .primary : .secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(band.rangeText)
                .font(.caption2)
                .foregroundColor(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }

    private func isCurrent(_ band: MetricBand) -> Bool {
        guard let current else { return false }
        return metric.classify(current)?.id == band.id
    }

    private var accessibilityText: String {
        let bands = metric.guideBands
            .map { "\($0.label) \($0.rangeText)" }
            .joined(separator: ", ")
        let unit = metric.unit.isEmpty ? "" : " \(metric.unit)"
        guard let current, let band = metric.classify(current) else {
            return "\(metric.guideCaption)\(unit): \(bands)"
        }
        return "\(metric.guideCaption)\(unit): \(bands). Current average is \(band.label)"
    }
}

extension MetricBandTone {
    var color: Color {
        switch self {
        case .best: return .green
        case .normal: return Color(red: 0.35, green: 0.78, blue: 0.55)
        case .fair: return .yellow
        case .low: return .orange
        case .high: return .red
        }
    }
}
