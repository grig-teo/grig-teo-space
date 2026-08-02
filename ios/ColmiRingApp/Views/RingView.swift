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

                if !latestByMetric.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Latest readings").font(.headline).padding(.horizontal)
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                            ForEach(RingMetric.allCases, id: \.self) { metric in
                                if let value = latestByMetric[metric] {
                                    MetricCard(metric: metric, value: value)
                                }
                            }
                        }
                        .padding(.horizontal)
                    }
                }

                if !appState.bleBox.traffic.isEmpty {
                    trafficCard
                }
            }
            .padding(.vertical)
        }
        .navigationTitle("Ring")
    }

    /// Raw ring traffic (newest at the bottom): what the app sent (→) and
    /// what the ring answered (←), so collected data is visible on the page
    /// before it is uploaded to the server.
    private var trafficCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Ring traffic").font(.headline)
            Text("Raw packets exchanged with the ring.")
                .font(.caption)
                .foregroundStyle(.secondary)
            ForEach(Array(appState.bleBox.traffic.enumerated()), id: \.offset) { _, line in
                Text(line)
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .truncationMode(.middle)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
        .padding(.horizontal)
    }
}
