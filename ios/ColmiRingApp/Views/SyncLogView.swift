import SwiftUI

/** Shows backend sync status: last upload time, pending count, errors, and a Sync now button. */
struct SyncLogView: View {
    @ObservedObject var api: ApiClient

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Server sync").font(.headline)

            HStack {
                Text("Pending").foregroundColor(.secondary)
                Spacer()
                Text("\(api.pendingCount)").fontWeight(.medium)
            }
            if let last = api.lastSyncAt {
                HStack {
                    Text("Last upload").foregroundColor(.secondary)
                    Spacer()
                    Text(last.formatted(date: .abbreviated, time: .shortened)).fontWeight(.medium)
                }
            }
            if let error = api.lastError {
                Text(error).font(.caption).foregroundColor(.red)
            }

            Button("Sync now") {
                Task { await api.syncNow() }
            }
            .buttonStyle(.bordered)
            .disabled(api.pendingCount == 0)
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
    }
}
