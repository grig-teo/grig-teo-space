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
    @State private var latestMedia: [MediaLibraryWrapper.AssetSnapshot] = []

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    header
                    weatherRow
                    StressChartView(client: stressClient)
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
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task {
            latestMedia = Array(mediaLibrary.allSnapshots().prefix(3))
            await weatherClient.load(days: 1)
        }
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
