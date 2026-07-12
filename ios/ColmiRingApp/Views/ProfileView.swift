import SwiftUI

/**
 Profile tab: shows the profile photo, a small "CV" pill (alongside the site
 link) that opens a language menu to download the CV, and today's stress graph
 by hour.
 */
struct ProfileView: View {
    @ObservedObject var client: ProfileClient
    @ObservedObject var settings: AppSettings
    @StateObject private var stressClient = StressSeriesClient.shared

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    header
                    StressChartView(client: stressClient)
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
