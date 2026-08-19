import SwiftUI

/**
 Health hub: entry point for the Health tab. Navigation buttons to the ring
 metrics, scanned records, body stats, and tip history. A floating button at
 the bottom-right opens the AI doctor chat (moved here from the Records page).
 */
struct HealthView: View {
    @ObservedObject var appState: AppState
    @StateObject private var client = DocumentsClient.shared
    @State private var showingChat = false

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
                            subtitle: "Scanned documents",
                            systemImage: "doc.viewfinder",
                            color: .teal,
                        )
                    }

                    NavigationLink {
                        BodyStatsView()
                    } label: {
                        HubButton(
                            title: "Body Stats",
                            subtitle: "Height, weight & BMI",
                            systemImage: "figure.stand",
                            color: .indigo,
                        )
                    }

                    NavigationLink {
                        SleepView()
                    } label: {
                        HubButton(
                            title: "Sleep",
                            subtitle: "Stages, score & bedtime consistency",
                            systemImage: "moon.stars.fill",
                            color: .purple,
                        )
                    }

                    NavigationLink {
                        WeatherView()
                    } label: {
                        HubButton(
                            title: "Weather & You",
                            subtitle: "Weather vs your stress, HRV & heart rate",
                            systemImage: "cloud.sun.fill",
                            color: .blue,
                        )
                    }

                    NavigationLink {
                        JournalView()
                    } label: {
                        HubButton(
                            title: "Journal",
                            subtitle: "Notes, food & how you feel",
                            systemImage: "note.text",
                            color: .brown,
                        )
                    }

                    NavigationLink {
                        ActivitiesView()
                    } label: {
                        HubButton(
                            title: "Activities",
                            subtitle: "Auto-detected walks & workouts",
                            systemImage: "figure.walk",
                            color: .green,
                        )
                    }

                    NavigationLink {
                        YearView()
                    } label: {
                        HubButton(
                            title: "Year in Review",
                            subtitle: "Totals, streaks & best days",
                            systemImage: "calendar",
                            color: .orange,
                        )
                    }

                    NavigationLink {
                        TipHistoryView()
                    } label: {
                        HubButton(
                            title: "Health Tip",
                            subtitle: "Hourly AI-generated advice",
                            systemImage: "lightbulb",
                            color: .yellow,
                        )
                    }
                }
                .padding()
                // Leave room for the floating AI-doctor button so it never
                // covers the last hub item.
                .padding(.bottom, 84)
            }
            .navigationTitle("")
            .overlay(alignment: .bottomTrailing) {
                Button {
                    showingChat = true
                } label: {
                    Image(systemName: "stethoscope")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 56, height: 56)
                        .background(Circle().fill(Color.teal).shadow(radius: 4, y: 2))
                        .overlay(alignment: .topTrailing) {
                            if client.unreadCount > 0 {
                                Text("\(client.unreadCount)")
                                    .font(.caption2.bold())
                                    .foregroundColor(.white)
                                    .frame(minWidth: 20, minHeight: 20)
                                    .background(Circle().fill(Color.red))
                                    .offset(x: 4, y: -4)
                            }
                        }
                }
                .padding(20)
            }
            .sheet(isPresented: $showingChat) {
                RecordsChatView()
            }
            // Badge stays fresh whenever the hub is visible.
            .task { await client.refreshUnread() }
            .onChange(of: showingChat) { shown in
                if !shown {
                    Task { await client.refreshUnread() }
                }
            }
            .navigationDestination(isPresented: $appState.deepLinkTips) {
                TipHistoryView()
            }
            .navigationDestination(isPresented: $appState.deepLinkRing) {
                RingView(appState: appState)
            }
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
