import SwiftUI
import Combine

/**
 The app's single primary view: connection + sync status, latest metrics,
 and access to settings.
 */
struct ContentView: View {
    @StateObject private var ble = RingBluetoothManager()
    @StateObject private var demo = DemoDataFeed()
    @StateObject private var api = ApiClient.shared
    @StateObject private var settings = AppSettings.shared

    @State private var latestByMetric: [RingMetric: Double] = [:]
    @State private var cancellables = Set<AnyCancellable>()
    @State private var showingSettings = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    ConnectionCard(ble: ble, demo: demo, demoMode: $settings.demoMode)
                    SyncLogView(api: api)

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
                SettingsSheet(settings: settings)
            }
        }
        .onAppear {
            wireUp()
        }
        .onChange(of: settings.demoMode) { isDemo in
            if isDemo {
                ble.disconnect()
                demo.start()
            } else {
                demo.stop()
            }
        }
    }

    /// Route readings (real or demo) to the display + the API client.
    private func wireUp() {
        // Real ring readings.
        ble.readings
            .sink { reading in handle(reading) }
            .store(in: &cancellables)
        // Demo readings.
        demo.readings
            .sink { reading in handle(reading) }
            .store(in: &cancellables)
        // Both feed the API client.
        api.subscribe(to: ble.readings.merge(with: demo.readings))

        if settings.demoMode { demo.start() }
    }

    private func handle(_ reading: HealthReading) {
        if let metric = RingMetric(rawValue: reading.metric) {
            latestByMetric[metric] = reading.value
        }
    }
}
