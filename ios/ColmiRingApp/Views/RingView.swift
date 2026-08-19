import SwiftUI

/**
 Ring page: ring connection + sync status + latest metrics, plus a settings
 entry point. Reached from the Health hub → "Ring" button.
 */
struct RingView: View {
    @ObservedObject var appState: AppState

    private var lifecycle: AppLifecycleManager { appState.lifecycle }
    private var latestByMetric: [RingMetric: Double] { appState.latestByMetric }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                ConnectionCard(ble: appState.bleBox)
                SyncLogView(api: lifecycle.api)

                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Latest readings").font(.headline)
                        Spacer()
                        Button {
                            lifecycle.requestFullSync()
                        } label: {
                            Image(systemName: "arrow.clockwise")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Color.accentColor)
                                .rotationEffect(.degrees(lifecycle.isSyncing ? 360 : 0))
                                .animation(
                                    lifecycle.isSyncing
                                        ? .linear(duration: 1).repeatForever(autoreverses: false)
                                        : .default,
                                    value: lifecycle.isSyncing,
                                )
                        }
                        .disabled(lifecycle.ble.state != .connected || lifecycle.isSyncing)
                        .opacity(lifecycle.ble.state == .connected ? 1 : 0.4)
                        .accessibilityLabel("Read all data from the ring now")
                    }
                    .padding(.horizontal)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        ForEach(RingMetric.allCases, id: \.self) { metric in
                            NavigationLink {
                                MetricDetailView(metric: metric)
                            } label: {
                                MetricCard(
                                    metric: metric,
                                    value: valueForDisplay(metric),
                                    loading: lifecycle.isSyncing,
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal)
                }

                if !appState.bleBox.traffic.isEmpty {
                    trafficCard
                }
            }
            .padding(.vertical)
        }
        .navigationTitle("Ring")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
    }

    /// Cards show the slot-history totals (same data the server gets —
    /// the ring's live counter is unreliable and reads inflated).
    private func valueForDisplay(_ metric: RingMetric) -> Double? {
        latestByMetric[metric]
    }

    /// Live activity with the ring (newest at the bottom): what the app
    /// asked for (→) and what the ring answered (←), in readable form — the
    /// data is visible here before it is uploaded to the server.
    private var trafficCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Ring activity").font(.headline)
            Text("Live data read from the ring.")
                .font(.caption)
                .foregroundStyle(.secondary)
            ForEach(Array(appState.bleBox.traffic.enumerated()), id: \.offset) { _, line in
                Text(line)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .truncationMode(.tail)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
        .padding(.horizontal)
    }
}
