import SwiftUI

/**
 Profile tab: shows the profile photo, a small "CV" pill (alongside the site
 link) that opens a language menu to download the CV, today's stress graph
 by hour, the latest health tip under it (tap opens the full history), and
 the three newest media items with a "See more" jump to the Media tab.
 */
struct ProfileView: View {
    @ObservedObject var client: ProfileClient
    @ObservedObject var settings: AppSettings
    @StateObject private var stressClient = StressSeriesClient.shared
    @StateObject private var tipClient = TipClient.shared
    @StateObject private var mediaLibrary = MediaLibraryWrapper.shared
    @StateObject private var weatherClient = WeatherClient()
    @StateObject private var locationManager = LocationManager.shared
    @StateObject private var recoveryClient = RecoveryClient.shared
    @StateObject private var insightsClient = InsightsClient.shared
    @State private var latestMedia: [MediaLibraryWrapper.AssetSnapshot] = []
    @State private var noteText = ""
    @State private var noteSaved = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    header
                    recoveryCard
                    streakCard
                    weatherRow
                    StressChartView(client: stressClient)
                    digestCard
                    noteCard
                    tipCard
                    mediaSection
                    if let error = client.lastError {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                            .padding(.horizontal)
                    }
                }
                .padding()
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task {
            latestMedia = Array(mediaLibrary.allSnapshots().prefix(3))
            // Triggers the permission prompt on first run and refreshes the
            // city label; the backend upload itself is throttled internally.
            LocationManager.shared.shareLocation()
            await weatherClient.load(days: 1)
            await recoveryClient.load()
            await insightsClient.loadInsights()
            await insightsClient.loadDigest()
        }
    }

    /// Step-goal streak: today's progress bar + the current streak count.
    @ViewBuilder
    private var streakCard: some View {
        if let insights = insightsClient.insights {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: "flame.fill")
                        .foregroundStyle(.orange)
                    Text("\(insights.streakDays)-day streak")
                        .font(.subheadline.bold())
                    Spacer()
                    Text("\(insights.todaySteps) / \(insights.goalSteps) steps")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                ProgressView(value: Double(insights.todaySteps), total: Double(insights.goalSteps))
                    .tint(insights.goalReached ? .green : .orange)
            }
            .padding()
            .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
        }
    }

    /// Quick context note ("tired", "ate pizza", "sleep at 23:30") — the
    /// hourly tip generator reads the last 24h of these.
    private var noteCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("How do you feel?")
                .font(.caption)
                .foregroundColor(.secondary)
            HStack(spacing: 8) {
                TextField("tired, ate pizza, sleep at 23:30…", text: $noteText)
                    .font(.callout)
                    .submitLabel(.send)
                    .onSubmit { saveNote() }
                Button(action: saveNote) {
                    Image(systemName: noteSaved ? "checkmark" : "paperplane.fill")
                        .foregroundStyle(noteSaved ? Color.green : Color.accentColor)
                }
                .disabled(noteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
    }

    private func saveNote() {
        let text = noteText
        noteText = ""
        Task {
            if await insightsClient.addNote(text) {
                noteSaved = true
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                noteSaved = false
            }
        }
    }

    /// The LLM weekly digest (this week vs last), cached server-side.
    @ViewBuilder
    private var digestCard: some View {
        if let digest = insightsClient.digest {
            VStack(alignment: .leading, spacing: 6) {
                Text("This week")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(digest.text)
                    .font(.callout)
                    .foregroundColor(.primary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
        }
    }

    /// Morning recovery: one 0–100 number from sleep + HRV and resting-HR
    /// baselines, with the component breakdown underneath.
    @ViewBuilder
    private var recoveryCard: some View {
        if let recovery = recoveryClient.recovery {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .lastTextBaseline, spacing: 8) {
                    Text("Recovery")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text("\(recovery.score)")
                        .font(.system(.subheadline, design: .rounded).bold())
                        .foregroundStyle(recoveryColor(recovery.score))
                    Text(recovery.label)
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                }
                HStack(spacing: 12) {
                    component("Sleep", recovery.components.sleepScore.map { "\($0)" })
                    component("HRV", recovery.components.hrv.current.map { String(format: "%.0f ms", $0) })
                    component("Resting HR", recovery.components.restingHr.current.map { "\($0) bpm" })
                }
                ForEach(recovery.alerts, id: \.self) { alert in
                    Label(alert, systemImage: "exclamationmark.triangle.fill")
                        .font(.caption2)
                        .foregroundColor(.orange)
                }
            }
            .padding()
            .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
        }
    }

    private func component(_ label: String, _ value: String?) -> some View {
        HStack(spacing: 4) {
            Text(label)
            Text(value ?? "—").bold()
        }
        .font(.caption2)
        .foregroundColor(.secondary)
    }

    private func recoveryColor(_ score: Int) -> Color {
        if score >= 80 { return .green }
        if score >= 65 { return .yellow }
        if score >= 50 { return .orange }
        return .red
    }

    /// One-line current conditions (temp · pressure · humidity) above the
    /// stress chart — the environmental context for the body's numbers.
    @ViewBuilder
    private var weatherRow: some View {
        if let current = weatherClient.series?.current {
            HStack(spacing: 12) {
                Label("\(Int(current.temperatureC.rounded()))°C", systemImage: "thermometer.medium")
                if let locality = locationManager.locality {
                    Label(locality, systemImage: "location.fill")
                }
                if let pressure = current.pressureHpa {
                    Label("\(Int(pressure.rounded())) hPa", systemImage: "barometer")
                }
                if let humidity = current.humidityPct {
                    Label("\(Int(humidity.rounded()))%", systemImage: "humidity")
                }
                Spacer()
            }
            .font(.caption)
            .foregroundColor(.secondary)
        }
    }

    /// The three newest photos/videos from the library. Tap one to open it;
    /// "See more" jumps to the Media tab.
    @ViewBuilder
    private var mediaSection: some View {
        if !latestMedia.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Latest media")
                    .font(.caption)
                    .foregroundColor(.secondary)
                HStack(spacing: 3) {
                    ForEach(latestMedia) { snapshot in
                        NavigationLink {
                            MediaViewerView(snapshot: snapshot)
                        } label: {
                            MediaThumbnailCell(
                                snapshot: snapshot,
                                uploaded: MediaSyncer.shared.isUploaded(snapshot.id),
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                Button {
                    AppState.shared.deepLinkMedia = true
                } label: {
                    HStack(spacing: 4) {
                        Text("See more")
                        Image(systemName: "chevron.right")
                            .font(.caption2)
                    }
                    .font(.subheadline)
                    .foregroundColor(.accentColor)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    /// The latest hourly health tip (with its generation time), under the
    /// stress graph. Tap opens the full tip history.
    private var tipCard: some View {
        NavigationLink {
            TipHistoryView()
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: "lightbulb.fill")
                        .foregroundColor(.yellow)
                    Text("Latest tip")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                    if let tip = tipClient.tips.first {
                        Text(tipDate(tip.generatedAt))
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    Image(systemName: "chevron.right")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                if let tip = tipClient.tips.first {
                    Text(tip.content)
                        .font(.subheadline)
                        .lineLimit(3)
                } else {
                    Text("Tips are generated hourly from your ring data.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
        }
        .buttonStyle(.plain)
        .task { if tipClient.tips.isEmpty { await tipClient.reload() } }
    }

    /// "Aug 3, 2026, 16:47" for the tip card's timestamp (24-hour clock).
    private func tipDate(_ iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: iso) ?? Date()
        return date.dateTime24(dateStyle: .medium)
    }

    private var header: some View {
        VStack(spacing: 12) {
            Image("ProfilePhoto")
                .resizable()
                .scaledToFill()
                .frame(width: 160, height: 160)
                .clipShape(Circle())
                .overlay(Circle().stroke(Color(.separator), lineWidth: 0.5))
                .shadow(color: .black.opacity(0.1), radius: 6, y: 3)

            HStack(spacing: 8) {
                Link(destination: URL(string: "https://grig-teo.space")!) {
                    Text("grig-teo.space")
                        .font(.subheadline)
                        .foregroundColor(.accentColor)
                }
                cvPill
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
    }

    /// Small label pill that opens the CV language menu. Sits inline with the
    /// site link rather than taking a full-width button.
    private var cvPill: some View {
        Menu {
            ForEach(CVLanguage.allCases) { language in
                Button {
                    client.downloadCV(language: language)
                } label: {
                    Label(language.label, systemImage: flagIcon(for: language))
                }
            }
        } label: {
            HStack(spacing: 4) {
                if client.downloadingLanguage != nil {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Image(systemName: "square.and.arrow.down")
                }
                Text("CV")
            }
            .font(.caption.weight(.medium))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(Color.accentColor.opacity(0.15)))
            .foregroundColor(.accentColor)
        }
        .disabled(client.downloadingLanguage != nil)
    }

    private func flagIcon(for language: CVLanguage) -> String {
        switch language {
        case .en: return "globe"
        case .ru: return "globe.americas"
        case .ro: return "globe.europe.africa"
        }
    }
}

enum CVLanguage: String, CaseIterable, Identifiable {
    case en, ru, ro
    var id: String { rawValue }
    var label: String {
        switch self {
        case .en: return "English"
        case .ru: return "Russian"
        case .ro: return "Romanian"
        }
    }
}
