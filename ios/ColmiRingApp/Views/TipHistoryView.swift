import SwiftUI

/**
 Shows persisted AI health tips as one scrollable list where a single tip is
 in focus: it renders as an elevated card with the full text, while every
 other tip is a normal compact row (two-line preview). The latest tip starts
 in focus; tapping any row focuses that tip in place — the list order never
 changes. Paginated via TipClient.loadNext().
 */
struct TipHistoryView: View {
    @StateObject private var client = TipClient.shared
    /// The tapped tip in focus; nil means "the latest one".
    @State private var focusedId: String?

    /// The tip currently in focus: the tapped one, or the latest by default.
    /// Falls back to the latest when the focused id is no longer in the list
    /// (e.g. after a reload).
    private var focusedTipId: String? {
        if let focusedId, client.tips.contains(where: { $0.id == focusedId }) {
            return focusedId
        }
        return client.tips.first?.id
    }

    var body: some View {
        Group {
            if client.tips.isEmpty && client.isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if client.tips.isEmpty {
                emptyState
            } else {
                tipList
            }
        }
        .navigationTitle("Health Tips")
        .navigationBarTitleDisplayMode(.inline)
        .task { if client.tips.isEmpty { await client.reload() } }
    }

    // MARK: - List

    private var tipList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(client.tips) { tip in
                    if tip.id == focusedTipId {
                        focusedCard(tip)
                    } else {
                        tipRow(tip)
                    }
                }
                if client.hasMore {
                    loadMoreRow
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 16)
        }
    }

    /// The tip in focus: full text on an elevated card, in its own position
    /// in the list. The "Latest" badge shows only when the focused tip is
    /// actually the newest one.
    private func focusedCard(_ tip: TipClient.Tip) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center) {
                Image(systemName: "lightbulb.fill")
                    .foregroundColor(.yellow)
                Text(formattedDate(tip.generatedAt))
                    .font(.caption.bold())
                    .foregroundColor(.secondary)
                if tip.id == client.tips.first?.id {
                    Text("Latest")
                        .font(.caption2.bold())
                        .foregroundColor(.accentColor)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(Color.accentColor.opacity(0.12)))
                }
                Spacer()
            }
            Text(tip.content)
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 20).fill(Color(.secondarySystemBackground)))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(Color.accentColor.opacity(0.35), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.18), radius: 12, y: 6)
    }

    /// A normal, non-focused tip: compact two-line row. Tap focuses it in
    /// place — it stays exactly where it is in the list.
    private func tipRow(_ tip: TipClient.Tip) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "lightbulb.fill")
                    .foregroundColor(.yellow)
                    .font(.caption)
                Text(formattedDate(tip.generatedAt))
                    .font(.caption.bold())
                    .foregroundColor(.secondary)
                Spacer()
            }
            Text(tip.content)
                .font(.subheadline)
                .lineLimit(2)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.secondarySystemBackground)))
        .contentShape(Rectangle())
        .onTapGesture {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
                focusedId = tip.id
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

    // MARK: - Empty state

    private var emptyState: some View {
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
    }

    private func formattedDate(_ iso: String) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = f.date(from: iso) ?? Date()
        return date.dateTime24(dateStyle: .abbreviated)
    }
}
