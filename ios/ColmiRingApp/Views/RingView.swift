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
                ConnectionCard(
                    ble: appState.bleBox,
                    demo: appState.demoBox,
                    demoMode: Binding(
                        get: { appState.settings.demoMode },
                        set: { appState.settings.demoMode = $0 },
                    ),
                )
                SyncLogView(api: lifecycle.api)

                demoModeCard

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
            }
            .padding(.vertical)
        }
        .navigationTitle("Ring")
    }

    /// Demo data feed toggle, inline on the Ring page. Mirrors the card
    /// styling used by `ConnectionCard` so it reads as part of the page.
    private var demoModeCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle(isOn: Binding(
                get: { appState.settings.demoMode },
                set: { appState.settings.demoMode = $0 },
            )) {
                Text("Demo data feed").font(.subheadline.weight(.semibold))
            }
            Text("Emit simulated readings instead of reading the real ring. Useful to test the pipeline before the ring is paired.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
    }
}
