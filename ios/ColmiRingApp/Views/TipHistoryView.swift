import SwiftUI

/**
 Shows persisted GLM health tips as a card deck.

 The latest tip sits in focus at the front of the stack — full size, fully
 readable — while older tips peek out behind it, scaled down and offset. The
 front card carries an icon at its top-right that sends it to the back of
 the deck (joining the other tips), bringing the next tip forward. Cycling
 near the end of the loaded deck paginates via TipClient.loadNext().
 */
struct TipHistoryView: View {
    @StateObject private var client = TipClient.shared
    /// Working copy of the loaded tips, reordered as cards go to the back.
    @State private var deck: [TipClient.Tip] = []
    /// Cards sent to the back so far — drives pagination near the deck's end.
    @State private var cycled = 0

    /// How many cards render visibly behind the front one.
    private let visibleDepth = 3

    var body: some View {
        Group {
            if deck.isEmpty && client.isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if deck.isEmpty {
                emptyState
            } else {
                deckView
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

    // MARK: - Deck

    private var deckView: some View {
        VStack(spacing: 16) {
            ZStack(alignment: .top) {
                // One extra card beyond the visible depth: the hidden landing
                // slot a card animates into when it goes to the back.
                ForEach(Array(deck.prefix(visibleDepth + 1).enumerated()), id: \.element.id) { position, tip in
                    card(tip, position: position)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

            footer
        }
    }

    private func card(_ tip: TipClient.Tip, position: Int) -> some View {
        let depth = min(position, visibleDepth)
        let isFront = position == 0
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center) {
                Image(systemName: "lightbulb.fill")
                    .foregroundColor(.yellow)
                    .font(.caption)
                Text(formattedDate(tip.generatedAt))
                    .font(.caption.bold())
                    .foregroundColor(.secondary)
                Spacer()
                if isFront && deck.count > 1 {
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
                .stroke(Color.primary.opacity(isFront ? 0.08 : 0.04), lineWidth: 1)
        )
        .shadow(color: .black.opacity(isFront ? 0.18 : 0.08), radius: isFront ? 12 : 6, y: isFront ? 6 : 3)
        .scaleEffect(1 - CGFloat(depth) * 0.05)
        .offset(y: CGFloat(depth) * 14)
        .opacity(position >= visibleDepth ? 0 : 1 - Double(depth) * 0.12)
        .zIndex(Double(-position))
        // Back cards are deck chrome — only the focused card is interactive.
        .allowsHitTesting(isFront)
        .transition(.asymmetric(
            insertion: .opacity,
            removal: .scale(scale: 0.85).combined(with: .opacity)
        ))
    }

    private var footer: some View {
        HStack(spacing: 8) {
            Image(systemName: "square.stack.3d.up.fill")
            Text("\(deck.count) tip\(deck.count == 1 ? "" : "s")")
            if client.isLoading {
                ProgressView().scaleEffect(0.7)
            }
        }
        .font(.caption)
        .foregroundColor(.secondary)
        .padding(.bottom, 12)
    }

    // MARK: - Actions

    /// Moves the front card to the back of the deck so the next tip comes
    /// forward — the same position the other tips sit at.
    private func sendToBack() {
        guard deck.count > 1 else { return }
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
            deck.append(deck.removeFirst())
        }
        cycled += 1
        // Approaching the end of the loaded deck? Pull in the next page.
        if cycled >= deck.count - visibleDepth, client.hasMore {
            Task { await client.loadNext() }
        }
    }

    /// Keeps the deck in sync with the client's tip list: a reload (the list
    /// shrank) resets the deck so the latest tip returns to the front; a new
    /// page appends behind the current stack without disturbing it.
    private func syncDeck() {
        let tips = client.tips
        if tips.count < deck.count {
            deck = tips
            cycled = 0
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
