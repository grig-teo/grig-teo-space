import SwiftUI

/** Shows persisted GLM health tips as a scrollable history. Each row expands
 *  to reveal the full tip text. Paginated via TipClient.loadNext(). */
struct TipHistoryView: View {
    @StateObject private var client = TipClient.shared
    @State private var expandedId: String?

    var body: some View {
        Group {
            if client.tips.isEmpty && client.isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if client.tips.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "lightbulb")
                        .font(.system(size: 40))
                        .foregroundColor(.secondary)
                    Text("No tips yet")
                        .font(.headline)
                    Text("Tips are generated each hour from your ring data. Check back later.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(client.tips) { tip in
                        tipRow(tip)
                    }
                    if client.hasMore {
                        loadMoreRow
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Health Tips")
        .navigationBarTitleDisplayMode(.inline)
        .task { if client.tips.isEmpty { await client.reload() } }
    }

    private func tipRow(_ tip: TipClient.Tip) -> some View {
        let isExpanded = expandedId == tip.id
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "lightbulb.fill").foregroundColor(.yellow).font(.caption)
                Text(formattedDate(tip.generatedAt))
                    .font(.caption.bold())
                    .foregroundColor(.secondary)
                Spacer()
            }
            Text(tip.content)
                .font(.subheadline)
                .lineLimit(isExpanded ? nil : 2)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .onTapGesture {
            withAnimation(.easeInOut(duration: 0.2)) {
                expandedId = (expandedId == tip.id) ? nil : tip.id
            }
        }
    }

    private var loadMoreRow: some View {
        HStack {
            Spacer()
            if client.isLoading {
                ProgressView()
            } else {
                Button("Load more") { Task { await client.loadNext() } }
            }
            Spacer()
        }
        .padding(.vertical, 8)
    }

    private func formattedDate(_ iso: String) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = f.date(from: iso) ?? Date()
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}
