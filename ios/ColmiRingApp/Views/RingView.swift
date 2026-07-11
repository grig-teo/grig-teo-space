import SwiftUI

/**
 Ring page: ring connection + sync status + latest metrics, plus a settings
 entry point. Reached from the Health hub → "Ring" button.
 */
struct RingView: View {
    @ObservedObject var appState: AppState

    @State private var showingSettings = false

    private var lifecycle: AppLifecycleManager { appState.lifecycle }
    private var latestByMetric: [RingMetric: Double] { appState.latestByMetric }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                ConnectionCard(
                    ble: lifecycle.ble,
                    demo: lifecycle.demo,
                    demoMode: Binding(
                        get: { appState.settings.demoMode },
                        set: { appState.settings.demoMode = $0 },
                    ),
                )
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
            }
            .padding(.vertical)
        }
        .navigationTitle("Ring")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingSettings = true
                } label: {
                    Image(systemName: "gearshape")
                }
            }
        }
        .sheet(isPresented: $showingSettings) {
            SettingsSheet(settings: appState.settings)
        }
    }
}
