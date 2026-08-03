import SwiftUI

/**
 The whole app: the latest hourly AI health tip, a timestamp, and a refresh
 button. Loads on appear and every time the window regains focus.
 */
struct ContentView: View {
    @State private var tip: Tip?
    @State private var isLoading = false
    @State private var failed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "lightbulb.fill")
                    .foregroundStyle(.yellow)
                Text("Latest health tip")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button {
                    Task { await load() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .rotationEffect(.degrees(isLoading ? 360 : 0))
                        .animation(
                            isLoading ? .linear(duration: 1).repeatForever(autoreverses: false) : .default,
                            value: isLoading,
                        )
                }
                .buttonStyle(.plain)
                .disabled(isLoading)
            }

            Group {
                if let tip {
                    Text(tip.content)
                        .font(.body)
                        .fixedSize(horizontal: false, vertical: true)
                } else if failed {
                    Text("Couldn't load the tip. Check the connection and try again.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity, alignment: .center)
                }
            }
            .frame(maxHeight: .infinity, alignment: .topLeading)

            if let tip {
                Text("Generated \(TipFetcher.clockTime(fromISO: tip.generatedAt))")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(16)
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        failed = false
        do {
            tip = try await TipFetcher.latest()
        } catch {
            failed = true
        }
        isLoading = false
    }
}
