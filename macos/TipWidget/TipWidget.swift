import SwiftUI
import WidgetKit

/**
 Notification Center widget showing the latest hourly AI health tip.
 Reloads every 30 minutes via the timeline policy; tapping it opens the app.
 */
struct TipEntry: TimelineEntry {
    let date: Date
    let text: String
    let generatedAt: String?
}

struct TipProvider: TimelineProvider {
    func placeholder(in context: Context) -> TipEntry {
        TipEntry(date: Date(), text: "Your latest health tip is loading…", generatedAt: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (TipEntry) -> Void) {
        Task { completion(await load()) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TipEntry>) -> Void) {
        Task {
            let entry = await load()
            let next = Date().addingTimeInterval(30 * 60)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }

    private func load() async -> TipEntry {
        if let tip = try? await TipFetcher.latest() {
            return TipEntry(
                date: Date(),
                text: tip.content,
                generatedAt: TipFetcher.clockTime(fromISO: tip.generatedAt),
            )
        }
        return TipEntry(date: Date(), text: "Couldn't load the tip — tap to open the app.", generatedAt: nil)
    }
}

struct TipWidgetView: View {
    let entry: TipEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "lightbulb.fill")
                    .foregroundStyle(.yellow)
                Text("Health tip")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Spacer()
                if let generatedAt = entry.generatedAt {
                    Text(generatedAt)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            Text(entry.text)
                .font(.caption)
                .lineLimit(5)
                .frame(maxHeight: .infinity, alignment: .topLeading)
        }
        .padding(12)
        .widgetURL(URL(string: "healthtip://open"))
    }
}

@main
struct TipWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HealthTipWidget", provider: TipProvider()) { entry in
            TipWidgetView(entry: entry)
        }
        .configurationDisplayName("Health Tip")
        .description("The latest AI health tip from your ring data.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
