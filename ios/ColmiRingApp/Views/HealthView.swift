import SwiftUI

/**
 Health hub: entry point for the Health tab. Two large navigation buttons:
 - Ring:    ring connection, sync, latest metrics.
 - Records: scanned health documents + AI doctor chat.
 */
struct HealthView: View {
    @ObservedObject var appState: AppState

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    NavigationLink {
                        RingView(appState: appState)
                    } label: {
                        HubButton(
                            title: "Ring",
                            subtitle: "Connection, sync & live metrics",
                            systemImage: "sensor.tag.radiowaves.forward",
                            color: .pink,
                        )
                    }

                    NavigationLink {
                        RecordsView()
                    } label: {
                        HubButton(
                            title: "Records",
                            subtitle: "Scanned documents & AI doctor",
                            systemImage: "doc.viewfinder",
                            color: .teal,
                        )
                    }
                }
                .padding()
            }
            .navigationTitle("Health")
        }
    }
}

/** A large tappable card used on the Health hub. */
struct HubButton: View {
    let title: String
    let subtitle: String
    let systemImage: String
    let color: Color

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: systemImage)
                .font(.system(size: 28, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 56, height: 56)
                .background(RoundedRectangle(cornerRadius: 14).fill(color))

            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.title3.bold())
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .foregroundColor(.secondary)
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
        .contentShape(Rectangle())
    }
}
