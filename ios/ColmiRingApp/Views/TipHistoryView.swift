import SwiftUI

/**
 Shows persisted GLM health tips as one scrollable list where a single tip is
 in focus: it renders at the top as an elevated card with the full text,
 while every other tip is a normal compact row underneath (two-line preview).
 The latest tip starts in focus; tapping any row moves that tip to the top
 and focuses it the same way. Paginated via TipClient.loadNext().
 */
struct TipHistoryView: View {
    @StateObject private var client = TipClient.shared
    /// Working copy of the loaded tips, reordered as the focus changes.
    @State private var deck: [TipClient.Tip] = []

    var body: some View {
        Group {
            if deck.isEmpty && client.isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if deck.isEmpty {
                emptyState
            } else {
                tipList
            }
        }
        .navigationTitle("Health Tips")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if client.tips.isEmpty { await client.reload() }
            syncDeck()
        }
        .onChange(of: client.tips.count) { _ in syncDeck() }
    }

    // MARK: - List

    private var tipList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(Array(deck.enumerated()), id: \.element.id) { position, tip in
                    if position == 0 {
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

    /// The tip in focus: full text on an elevated card. The "Latest" badge
    /// shows only while the focused tip is actually the newest one.
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

    /// A normal, non-focused tip: compact two-line row. Tap moves it to the
    /// top and focuses it like the latest.
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
        .onTapGesture { focus(tip) }
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

    // MARK: - Actions

    /// Moves a tapped tip to the top of the list, giving it the focus.
    private func focus(_ tip: TipClient.Tip) {
        guard let index = deck.firstIndex(where: { $0.id == tip.id }), index > 0 else { return }
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
            deck.insert(deck.remove(at: index), at: 0)
        }
    }

    /// Keeps the list in sync with the client's tips: a reload (the list
    /// shrank) resets the order so the latest tip returns to the focus; a
    /// new page appends at the end without disturbing the current order.
    private func syncDeck() {
        let tips = client.tips
        if tips.count < deck.count {
            deck = tips
        } else if tips.count > deck.count {
            deck.append(contentsOf: tips.suffix(tips.count - deck.count))
        }
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
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}
