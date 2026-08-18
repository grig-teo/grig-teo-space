import AppIntents
import SwiftUI
import WidgetKit

/** Displays the latest AI health tip, the last-updated time, and a refresh
 *  button (top-right). Nothing else — the widget is tip-only.
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
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                Text("Updated \(updatedAt.time24)")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Spacer()
                RefreshButton()
            }
            if let text = payload?.tip.tip, !text.isEmpty {
                Text(text)
                    .font(.title3)
                    .foregroundColor(.primary)
            } else {
                Label("No tip yet", systemImage: "lightbulb")
                    .font(.callout)
                    .foregroundColor(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(Self.deepLink)
    }
}

// MARK: - Refresh button

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
