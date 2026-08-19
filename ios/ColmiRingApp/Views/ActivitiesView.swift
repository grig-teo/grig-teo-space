import SwiftUI

/**
 Auto-detected activities: windows where the step rate spiked (with HR
 stats from the same window), newest first. Turns raw readings into a
 readable timeline ("18:20–18:55 · 4.2k steps · avg 118 bpm").
 */
struct ActivitiesView: View {
    @StateObject private var client = InsightsClient.shared

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if client.activities.isEmpty {
                    Text("No activities detected this week — windows with 800+ steps will show up here.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding()
                }
                ForEach(client.activities) { activity in
                    activityRow(activity)
                }
            }
            .padding()
        }
        .navigationTitle("Activities")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .task { await client.loadActivities(days: 7) }
    }

    private func activityRow(_ activity: InsightsClient.Activity) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "figure.walk")
                .font(.title3)
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(Circle().fill(Color.green))
            VStack(alignment: .leading, spacing: 2) {
                Text(timeRange(activity))
                    .font(.subheadline.bold())
                Text(subtitle(activity))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            Spacer()
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
    }

    /// "Tue 18 Aug, 18:20–18:55".
    private func timeRange(_ activity: InsightsClient.Activity) -> String {
        guard let start = activity.startDate, let end = activity.endDate else { return "—" }
        let day = start.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
        return "\(day), \(start.time24)–\(end.time24)"
    }

    private func subtitle(_ activity: InsightsClient.Activity) -> String {
        var parts = ["\(activity.steps) steps"]
        if activity.km > 0 { parts.append(String(format: "%.2f km", activity.km)) }
        if let avg = activity.avgHr {
            parts.append("avg \(avg) bpm")
        }
        if let peak = activity.peakHr, peak != activity.avgHr {
            parts.append("peak \(peak)")
        }
        return parts.joined(separator: " · ")
    }
}
