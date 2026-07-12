import WidgetKit
import SwiftUI

/** Home-screen widget showing the latest stress index, sleep recovery, and the
 *  hourly GLM health tip. Fetches the combined payload from the backend in the
 *  timeline provider; the host app triggers a reload via WidgetCenter after
 *  each readings flush, and the OS refreshes on its own roughly every 30 min.
 *
 *  Supports `.systemSmall` and `.systemMedium`. Display-only (iOS 16+). */
@main
struct HealthWidget: Widget {
    let kind: String = "HealthWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HealthTimelineProvider()) { entry in
            HealthWidgetView(payload: entry.payload, family: entry.family)
                .containerBackgroundCompat()
        }
        .configurationDisplayName("Health")
        .description("Stress, sleep, and your latest health tip.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Timeline

struct HealthTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> HealthEntry {
        HealthEntry(date: .now, payload: nil, family: context.family)
    }

    func getSnapshot(in context: Context, completion: @escaping (HealthEntry) -> Void) {
        completion(HealthEntry(date: .now, payload: nil, family: context.family))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HealthEntry>) -> Void) {
        Task {
            let payload = await WidgetClient.fetchPayload()
            let entry = HealthEntry(date: .now, payload: payload, family: context.family)
            // Refresh every 30 minutes; the app also triggers reloads on sync.
            let next = Date().addingTimeInterval(30 * 60)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }
}

struct HealthEntry: TimelineEntry {
    let date: Date
    let payload: WidgetPayload?
    let family: WidgetFamily
}

// MARK: - Background compat

/** iOS 17+ uses `containerBackground`; iOS 16 needs the background applied
 *  directly. This wraps both so the widget renders correctly on 16–26. */
private extension View {
    @ViewBuilder
    func containerBackgroundCompat() -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(for: .widget) {
                Color(.systemGroupedBackground)
            }
        } else {
            self.background(Color(.systemGroupedBackground))
        }
    }
}

#if DEBUG
@available(iOS 17.0, *)
#Preview(as: .systemSmall) {
    HealthWidget()
} timeline: {
    HealthEntry(date: .now, payload: nil, family: .systemSmall)
}
#endif
