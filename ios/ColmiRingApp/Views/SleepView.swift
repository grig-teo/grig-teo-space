import SwiftUI

/**
 Sleep page: last night's stage breakdown, the week's averages, bedtime
 consistency, and sleep debt. Fed by `SleepClient` (server-side data
 uploaded from the ring's sleep frames).
 */
struct SleepView: View {
    @StateObject private var client = SleepClient.shared

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if let night = client.overview?.sessions.first {
                    lastNightCard(night)
                }
                statsCard
                nightsList
            }
            .padding()
        }
        .navigationTitle("Sleep")
        .navigationBarTitleDisplayMode(.inline)
        .task { await client.load(days: 7) }
    }

    // --- Last night ----------------------------------------------------------

    private func lastNightCard(_ night: SleepClient.Session) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .lastTextBaseline) {
                Text(String(format: "%.1f", Double(night.durationMin) / 60))
                    .font(.system(.largeTitle, design: .rounded).bold())
                Text("h")
                    .font(.title3)
                    .foregroundColor(.secondary)
                Spacer()
                scoreBadge(night.score)
            }
            if let start = night.start, let end = night.end {
                Text("\(start.time24) → \(end.time24)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            StageBar(night: night)
            stageLegend
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
    }

    private func scoreBadge(_ score: Double) -> some View {
        HStack(alignment: .lastTextBaseline, spacing: 4) {
            Text("\(Int(score.rounded()))")
                .font(.system(.title, design: .rounded).bold())
                .foregroundColor(scoreColor(score))
            Text("score")
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    private var stageLegend: some View {
        HStack(spacing: 12) {
            ForEach(Stage.all, id: \.self) { stage in
                HStack(spacing: 4) {
                    Circle().fill(stage.color).frame(width: 6, height: 6)
                    Text(stage.label)
                }
                .font(.caption2)
                .foregroundColor(.secondary)
            }
        }
    }

    private func scoreColor(_ score: Double) -> Color {
        if score >= 80 { return .green }
        if score >= 65 { return .yellow }
        if score >= 50 { return .orange }
        return .red
    }

    // --- Week stats ------------------------------------------------------------

    @ViewBuilder
    private var statsCard: some View {
        if let overview = client.overview, !overview.sessions.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    stat("Avg score", overview.avgScore.map { String(Int($0)) })
                    Spacer()
                    stat("Avg duration", overview.avgDurationMin.map { String(format: "%.1f h", Double($0) / 60) })
                    Spacer()
                    stat("Sleep debt", String(format: "%.1f h", Double(overview.debtMin) / 60))
                }
                if let range = overview.bedtimeRange {
                    Text("Bedtime this week: \(formatMinutes(range.earliestMin))–\(formatMinutes(range.latestMin))")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding()
            .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
        }
    }

    private func stat(_ label: String, _ value: String?) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
            Text(value ?? "—")
                .font(.system(.headline, design: .rounded).bold())
        }
    }

    /// Local minutes after midnight → "22:47".
    private func formatMinutes(_ minutes: Int) -> String {
        String(format: "%d:%02d", minutes / 60, minutes % 60)
    }

    // --- Nights list -------------------------------------------------------------

    @ViewBuilder
    private var nightsList: some View {
        let sessions = client.overview?.sessions ?? []
        if sessions.count > 1 {
            VStack(alignment: .leading, spacing: 8) {
                Text("This week")
                    .font(.caption)
                    .foregroundColor(.secondary)
                ForEach(sessions.dropFirst()) { night in
                    HStack(spacing: 12) {
                        Text(night.end.map { dayLabel($0) } ?? "—")
                            .font(.subheadline)
                            .frame(width: 92, alignment: .leading)
                        StageBar(night: night, height: 8)
                        Text(String(format: "%.1f h", Double(night.durationMin) / 60))
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .frame(width: 44, alignment: .trailing)
                        Text("\(Int(night.score.rounded()))")
                            .font(.system(.subheadline, design: .rounded).bold())
                            .foregroundStyle(scoreColor(night.score))
                            .frame(width: 30, alignment: .trailing)
                    }
                }
            }
            .padding()
            .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
        }
    }

    private func dayLabel(_ date: Date) -> String {
        date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
    }
}

/** Proportional stacked bar of sleep stages for one night. */
private struct StageBar: View {
    let night: SleepClient.Session
    var height: CGFloat = 14

    var body: some View {
        let stages = Stage.all
        let total = max(1, stages.reduce(0) { $0 + $1.minutes(in: night) })
        GeometryReader { geo in
            HStack(spacing: 1) {
                ForEach(stages, id: \.self) { stage in
                    let minutes = stage.minutes(in: night)
                    if minutes > 0 {
                        stage.color
                            .frame(width: geo.size.width * CGFloat(minutes) / CGFloat(total))
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: height / 2))
        }
        .frame(height: height)
    }
}

/** Sleep stages in display order with their colors. */
private enum Stage: CaseIterable {
    case deep, rem, light, awake

    static var all: [Stage] { allCases }

    var label: String {
        switch self {
        case .deep: return "Deep"
        case .rem: return "REM"
        case .light: return "Light"
        case .awake: return "Awake"
        }
    }

    var color: Color {
        switch self {
        case .deep: return .indigo
        case .rem: return .cyan
        case .light: return Color(.systemGray3)
        case .awake: return .orange
        }
    }

    func minutes(in night: SleepClient.Session) -> Int {
        switch self {
        case .deep: return night.deepMin
        case .rem: return night.remMin
        case .light: return night.lightMin
        case .awake: return night.awakeMin
        }
    }
}
