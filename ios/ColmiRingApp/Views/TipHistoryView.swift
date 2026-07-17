import SwiftUI

/**
 Shows persisted GLM health tips as one scrollable list where the latest tip
 is in focus: it renders at the top as an elevated card with the full text,
 while every other tip is a normal compact row underneath (tap a row to
 expand its text). The icon at the focused card's top-right sends it to the
 back of the list — it becomes a normal row like the others, and the next
 tip takes the focus. Paginated via TipClient.loadNext().
 */
struct TipHistoryView: View {
    @StateObject private var client = TipClient.shared
    /// Working copy of the loaded tips, reordered as the focus cycles.
    @State private var deck: [TipClient.Tip] = []
    @State private var expandedId: String?

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

    /// The tip in focus (the latest): full text, elevated card, and the
    /// send-to-back icon at the top-right.
    private func focusedCard(_ tip: TipClient.Tip) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center) {
                Image(systemName: "lightbulb.fill")
                    .foregroundColor(.yellow)
                Text(formattedDate(tip.generatedAt))
                    .font(.caption.bold())
                    .foregroundColor(.secondary)
                Text("Latest")
                    .font(.caption2.bold())
                    .foregroundColor(.accentColor)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(Color.accentColor.opacity(0.12)))
                Spacer()
                if deck.count > 1 {
                    Button(action: sendToBack) {
                        Image(systemName: "square.3.layers.3d.down.right")
                            .font(.title3)
                            .foregroundColor(.accentColor)
                    }
                    .accessibilityLabel("Send tip to back")
                }
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

    /// A normal, non-focused tip: compact row, two lines, tap to expand.
    private func tipRow(_ tip: TipClient.Tip) -> some View {
        let isExpanded = expandedId == tip.id
        return VStack(alignment: .leading, spacing: 6) {
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
                .lineLimit(isExpanded ? nil : 2)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.secondarySystemBackground)))
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

    // MARK: - Actions

    /// Sends the focused tip to the back of the list, where it becomes a
    /// normal row like the others; the next tip takes the focus.
    private func sendToBack() {
        guard deck.count > 1 else { return }
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
            deck.append(deck.removeFirst())
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
