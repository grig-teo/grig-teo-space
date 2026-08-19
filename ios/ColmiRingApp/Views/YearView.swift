import SwiftUI

/**
 Year in review: lifetime-ish totals from the ring data (window: the last
 365 days of stored data). A fun stats wall — total steps/km, best streak,
 best day, sleep averages, longest activity.
 */
struct YearView: View {
    @StateObject private var client = InsightsClient.shared

    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        ScrollView {
            if let year = client.year {
                LazyVGrid(columns: columns, spacing: 12) {
                    stat("\(year.totalSteps.formatted())", "total steps")
                    stat(String(format: "%.1f km", year.totalKm), "total distance")
                    stat("\(year.daysWithData)", "days tracked")
                    stat("\(year.bestStreakDays) days", "best streak")
                    if let best = year.bestDay {
                        stat("\(best.steps.formatted())", "best day · \(best.date)")
                    }
                    if let score = year.avgSleepScore {
                        stat("\(score)", "avg sleep score")
                    }
                    if let hours = year.avgSleepH {
                        stat(String(format: "%.1f h", hours), "avg sleep")
                    }
                    if let longest = year.longestActivityMin {
                        stat("\(longest) min", "longest activity")
                    }
                }
                .padding()
            } else {
                ProgressView().frame(maxWidth: .infinity).padding()
            }
        }
        .navigationTitle("Year in Review")
        .navigationBarTitleDisplayMode(.inline)
        .task { await client.loadYear() }
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(.title2, design: .rounded).bold())
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
    }
}
