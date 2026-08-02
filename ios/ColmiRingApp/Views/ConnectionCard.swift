import SwiftUI

/**
 Shows Bluetooth connection status, RSSI, battery, and connect/disconnect
 controls. Observes a type-erased source box (`AnyRingDataSource`) so the
 underlying source can be a real `RingBluetoothManager` or a `MockRingClient`
 (in previews) without changing the view.
 */
struct ConnectionCard: View {
    @ObservedObject var ble: AnyRingDataSource

    private var statusText: String { ble.state.rawValue.capitalized }
    private var statusColor: Color {
        switch ble.state {
        case .connected: return .green
        case .connecting, .scanning: return .orange
        case .failed: return .red
        case .disconnected: return .secondary
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Circle().fill(statusColor).frame(width: 10, height: 10)
                Text("Ring: \(statusText)")
                    .font(.headline)
                Spacer()
            }

            if let name = ble.deviceName {
                let battery = ble.batteryLevel.map { " · \($0)%" } ?? ""
                LabeledRow(label: "Device", value: "\(name)\(battery)")
            }
            if let rssi = ble.rssi {
                LabeledRow(label: "Signal", value: "\(rssi) dBm")
            }
            if let last = ble.lastReadingAt {
                LabeledRow(label: "Last reading", value: last.formatted(date: .omitted, time: .shortened))
            }
            if let error = ble.lastError {
                Text(error).font(.caption).foregroundColor(.red)
            }

            HStack(spacing: 12) {
                switch ble.state {
                case .connected:
                    // Connected: the only action is to drop the link.
                    Button("Disconnect") { ble.disconnect() }
                        .buttonStyle(.borderedProminent)
                case .scanning, .connecting:
                    // In-flight attempt: the only action is to cancel it.
                    Button("Cancel") { ble.disconnect() }
                        .buttonStyle(.bordered)
                case .disconnected, .failed:
                    Button("Connect") { ble.connect() }
                        .buttonStyle(.borderedProminent)
                }
            }
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
    }
}

private struct LabeledRow: View {
    let label: String
    let value: String
    var body: some View {
        HStack {
            Text(label).foregroundColor(.secondary)
            Spacer()
            Text(value).fontWeight(.medium)
        }
        .font(.subheadline)
    }
}
