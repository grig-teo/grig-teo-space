import AppIntents
import SwiftUI
import WidgetKit

/** Displays the health status (stress, sleep, quality, plus heart rate,
 *  SpO2 and steps), the latest AI tip, the last-updated time, and a refresh
 *  button (top-right).
 *
 *  Tapping anywhere on the widget (outside the refresh button) opens the host
 *  app on the Ring page via the `grigteo://ring` deep link.
 *
 *  Single size: `.systemLarge` — the only family the widget supports. */
struct HealthWidgetView: View {
    static let deepLink = URL(string: "grigteo://ring")!

    let payload: WidgetPayload?
    let updatedAt: Date
    let family: WidgetFamily

    var body: some View {
        LargeLayout(payload: payload, updatedAt: updatedAt)
            .widgetURL(Self.deepLink)
    }
}

// MARK: - Large layout

private struct LargeLayout: View {
    let payload: WidgetPayload?
    let updatedAt: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                Text("Updated \(updatedAt.time24)")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Spacer()
                RefreshButton()
            }
            if let payload {
                HStack(spacing: 12) {
                    StressBadge(value: payload.summary.latest("stress"))
                    Divider().frame(height: 36)
                    Stat(value: payload.summary.latest("sleep_duration_h"), label: "Sleep", unit: "h", fractionDigits: 1)
                    Stat(value: payload.summary.latest("sleep_quality"), label: "Quality", unit: "%")
                }
                Divider()
                HStack(spacing: 12) {
                    Stat(value: payload.summary.latest("heart_rate"), label: "Heart Rate", unit: "bpm")
                    Stat(value: payload.summary.latest("spo2"), label: "Blood Oxygen", unit: "%")
                    Stat(value: payload.summary.latest("steps"), label: "Steps today", unit: "")
                }
                Divider()
                TipLine(text: payload.tip.tip)
                Spacer(minLength: 0)
            } else {
                Placeholder()
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - Shared components

/** Refresh button wired to RefreshWidgetIntent via WidgetKit's AppIntent
 *  support. Triggers a timeline reload that re-fetches from the backend.
 *  The icon plays a one-shot rotation whenever the view (re)appears — which
 *  happens right after the tap, since the intent reloads the timeline. */
private struct RefreshButton: View {
    var body: some View {
        Button(intent: RefreshWidgetIntent()) {
            Image(systemName: "arrow.clockwise")
                .font(.caption)
                .foregroundColor(.secondary)
                .symbolEffect(.rotate)
        }
        .buttonStyle(.plain)
    }
}

private struct StressBadge: View {
    let value: Double?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Stress")
                .font(.caption2)
                .foregroundColor(.secondary)
            HStack(alignment: .lastTextBaseline, spacing: 2) {
                Text(value.map { String(Int($0)) } ?? "—")
                    .font(.system(.title, design: .rounded).bold())
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
}

/** One labeled stat (sleep, quality, HR, SpO2, steps). */
private struct Stat: View {
    let value: Double?
    let label: String
    let unit: String
    var fractionDigits: Int = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption2)
                .foregroundColor(.secondary)
            HStack(alignment: .lastTextBaseline, spacing: 2) {
                Text(value.map { String(format: "%.\(fractionDigits)f", $0) } ?? "—")
                    .font(.system(.headline, design: .rounded).bold())
                if !unit.isEmpty {
                    Text(unit)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
        }
    }
}

/** The latest AI tip — the large widget has room for the full text. */
private struct TipLine: View {
    let text: String?

    var body: some View {
        if let text, !text.isEmpty {
            Text(text)
                .font(.callout)
                .foregroundColor(.primary)
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
