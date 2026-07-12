import AppIntents
import SwiftUI
import WidgetKit

/** Displays the health status (stress + sleep recovery), the latest GLM tip,
 *  the last-updated time, and a refresh button (top-right).
 *
 *  Tapping anywhere on the widget (outside the refresh button) opens the host
 *  app on the Tip history page via the `grigteo://tips` deep link.
 *
 *  Two layouts: `.systemSmall` (compact) and `.systemMedium` (full). */
struct HealthWidgetView: View {
    static let deepLink = URL(string: "grigteo://tips")!

    let payload: WidgetPayload?
    let updatedAt: Date
    let family: WidgetFamily

    var body: some View {
        Group {
            switch family {
            case .systemSmall:
                SmallLayout(payload: payload, updatedAt: updatedAt)
            default:
                MediumLayout(payload: payload, updatedAt: updatedAt)
            }
        }
        .widgetURL(Self.deepLink)
    }
}

// MARK: - Small layout

private struct SmallLayout: View {
    let payload: WidgetPayload?
    let updatedAt: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                Text("Updated \(updatedAt.formatted(.dateTime.hour().minute()))")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Spacer()
                RefreshButton()
            }
            if let payload {
                StressBadge(value: payload.summary.latest("stress"), compact: true)
                SleepLine(payload: payload)
                Spacer(minLength: 0)
                TipLine(text: payload.tip.tip)
            } else {
                Placeholder()
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - Medium layout

private struct MediumLayout: View {
    let payload: WidgetPayload?
    let updatedAt: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                Text("Updated \(updatedAt.formatted(.dateTime.hour().minute()))")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Spacer()
                RefreshButton()
            }
            if let payload {
                HStack(spacing: 12) {
                    StressBadge(value: payload.summary.latest("stress"), compact: false)
                    Divider().frame(height: 36)
                    SleepStat(value: payload.summary.latest("sleep_duration_h"), label: "Sleep", unit: "h")
                    SleepStat(value: payload.summary.latest("sleep_quality"), label: "Quality", unit: "%")
                }
                Divider()
                TipLine(text: payload.tip.tip, multiline: true)
                Spacer(minLength: 0)
            } else {
                Placeholder()
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - Shared components

/** Refresh button wired to RefreshWidgetIntent via WidgetKit's AppIntent
 *  support. Triggers a timeline reload that re-fetches from the backend. */
private struct RefreshButton: View {
    var body: some View {
        Button(intent: RefreshWidgetIntent()) {
            Image(systemName: "arrow.clockwise")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .buttonStyle(.plain)
    }
}

private struct StressBadge: View {
    let value: Double?
    let compact: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Stress")
                .font(.caption2)
                .foregroundColor(.secondary)
            HStack(alignment: .lastTextBaseline, spacing: 2) {
                Text(value.map { formatStress($0) } ?? "—")
                    .font(compact ? .system(.title2, design: .rounded).bold() : .system(.title, design: .rounded).bold())
                Text(tier)
                    .font(.caption2.bold())
                    .foregroundColor(tierColor)
            }
        }
    }

    private var tier: String {
        guard let value else { return "" }
        if value < 30 { return "low" }
        if value < 60 { return "med" }
        return "high"
    }

    private var tierColor: Color {
        guard let value else { return .secondary }
        if value < 30 { return .green }
        if value < 60 { return .orange }
        return .red
    }

    private func formatStress(_ v: Double) -> String { String(Int(v)) }
}

private struct SleepStat: View {
    let value: Double?
    let label: String
    let unit: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption2)
                .foregroundColor(.secondary)
            HStack(alignment: .lastTextBaseline, spacing: 2) {
                Text(value.map { String(format: "%.1f", $0) } ?? "—")
                    .font(.system(.headline, design: .rounded).bold())
                Text(unit)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
    }
}

private struct SleepLine: View {
    let payload: WidgetPayload

    var body: some View {
        let duration = payload.summary.latest("sleep_duration_h")
        let quality = payload.summary.latest("sleep_quality")
        if duration != nil || quality != nil {
            HStack(spacing: 6) {
                if let duration {
                    Text(String(format: "%.1f h sleep", duration))
                }
                if let quality {
                    Text("\(Int(quality))% quality")
                }
            }
            .font(.caption2)
            .foregroundColor(.secondary)
        }
    }
}

/** Renders the tip text, or a neutral placeholder when no tip is available. */
private struct TipLine: View {
    let text: String?
    var multiline: Bool = false

    var body: some View {
        if let text, !text.isEmpty {
            Text(text)
                .font(.caption)
                .foregroundColor(.primary)
                .lineLimit(multiline ? 4 : 2)
        } else {
            Label("No tip yet", systemImage: "lightbulb")
                .font(.caption2)
                .foregroundColor(.secondary)
        }
    }
}

private struct Placeholder: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "heart.text.square")
                .font(.title2)
                .foregroundColor(.secondary)
            Text("No health data")
                .font(.caption)
                .foregroundColor(.secondary)
            Spacer()
        }
    }
}
