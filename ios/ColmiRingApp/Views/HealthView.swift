import SwiftUI

/**
 Health tab: ring connection + sync status + latest metrics, plus a settings
 entry point. This is the original single primary view, now scoped to the
 Health tab of the bottom nav.
 */
struct HealthView: View {
    @ObservedObject var appState: AppState

    @State private var showingSettings = false

    private var lifecycle: AppLifecycleManager { appState.lifecycle }
    private var latestByMetric: [RingMetric: Double] { appState.latestByMetric }

    var body: some View {
        NavigationStack {
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
            .navigationTitle("Health")
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
}
