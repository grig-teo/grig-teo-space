import SwiftUI

/**
 Profile tab: shows the profile photo and a single "Download CV" button that
 opens a menu to choose a language (English / Russian / Romanian). Tapping a
 language downloads the PDF and presents the iOS share sheet so the user can
 save or send it.
 */
struct ProfileView: View {
    @ObservedObject var client: ProfileClient
    @ObservedObject var settings: AppSettings

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    header
                    cvButton
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
            Link(destination: URL(string: "https://grig-teo.space")!) {
                Text("grig-teo.space")
                    .font(.subheadline)
                    .foregroundColor(.accentColor)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
    }

    private var cvButton: some View {
        Menu {
            ForEach(CVLanguage.allCases) { language in
                Button {
                    client.downloadCV(language: language)
                } label: {
                    Label(language.label, systemImage: flagIcon(for: language))
                }
            }
        } label: {
            HStack {
                if client.downloadingLanguage != nil {
                    ProgressView()
                } else {
                    Image(systemName: "square.and.arrow.down")
                }
                Text(client.downloadingLanguage != nil ? "Downloading…" : "Download CV")
            }
            .font(.body.weight(.medium))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color.accentColor))
            .foregroundColor(.white)
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
