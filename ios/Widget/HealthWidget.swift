import AppIntents
import WidgetKit
import SwiftUI

/** Home-screen widget showing the latest stress index, sleep recovery, key
 *  vitals, and the hourly AI health tip. Fetches the combined payload from
 *  the backend in the timeline provider; the host app triggers a reload via
 *  WidgetCenter after each readings flush, and the in-widget refresh button
 *  lets the user force a reload on demand.
 *
 *  Single size: `.systemLarge`. iOS 17+ (interactive button). */
@main
struct HealthWidget: Widget {
    let kind: String = "HealthWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HealthTimelineProvider()) { entry in
            HealthWidgetView(payload: entry.payload, updatedAt: entry.date, family: entry.family)
                .containerBackground(for: .widget) {
                    Color(.systemGroupedBackground)
                }
        }
        .configurationDisplayName("Health")
        .description("Stress, sleep, vitals, your latest health tip, and a refresh button.")
        .supportedFamilies([.systemLarge])
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
            // Refresh every 30 minutes; the app also triggers reloads on sync,
            // and the user can force one with the refresh button.
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

// MARK: - Refresh intent

/** Tapped by the widget's refresh button. Asks WidgetKit to re-run the timeline
 *  provider, which re-fetches from the backend. The button re-enables once the
 *  reload completes (the timeline entry's date updates). */
struct RefreshWidgetIntent: AppIntent {
    static var title: LocalizedStringResource = "Refresh Health Widget"
    static var description = IntentDescription("Fetches the latest health data and tip.")

    func perform() async throws -> some IntentResult {
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

#Preview(as: .systemLarge) {
    HealthWidget()
} timeline: {
    HealthEntry(date: .now, payload: nil, family: .systemLarge)
}
