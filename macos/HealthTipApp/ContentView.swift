import SwiftUI

/**
 The whole app: the latest hourly AI health tip, a timestamp, and a refresh
 button. Loads on appear and every 15 minutes; when the server has a NEW
 tip, a macOS notification is posted (see TipNotifier).
 */
struct ContentView: View {
    @State private var tip: Tip?
    @State private var isLoading = false
    @State private var failed = false

    /// Poll cadence — the backend generates a tip hourly, so 15 min catches
    /// each new one with at most a quarter-hour delay.
    private let pollTimer = Timer.publish(every: 15 * 60, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "lightbulb.fill")
                    .foregroundStyle(.yellow)
                Text("Latest health tip")
                    .font(.callout)
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
                        .font(.title3)
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
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(16)
        .frame(width: 340) // window width fixed; height follows the tip text
        .task {
            TipNotifier.shared.start()
            await load()
        }
        .onReceive(pollTimer) { _ in
            Task { await load() }
        }
    }

    private func load() async {
        isLoading = true
        failed = false
        do {
            let latest = try await TipFetcher.latest()
            tip = latest
            TipNotifier.shared.notifyIfNew(latest)
        } catch {
            failed = true
        }
        isLoading = false
    }
}
