import SwiftUI
import Combine

/**
 The app's single primary view: connection + sync status, latest metrics,
 and access to settings.

 The long-lived BLE/demo/API objects are owned by `AppState` (held at the App
 layer), NOT here, so they survive backgrounding and view re-creation. This
 view just observes and renders their published state.
 */
struct ContentView: View {
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
            .navigationTitle("COLMI Ring")
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
