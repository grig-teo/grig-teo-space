import SwiftUI

/**
 The whole app: the latest hourly AI health tip, a timestamp, and a refresh
 button. Polling + notifications live in the AppDelegate (see AppDelegate /
 TipStore) so they keep working with the window closed; this view just
 observes the shared store.
 */
struct ContentView: View {
    @StateObject private var store = TipStore.shared

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
                    Task { await store.poll() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .rotationEffect(.degrees(store.isLoading ? 360 : 0))
                        .animation(
                            store.isLoading
                                ? .linear(duration: 1).repeatForever(autoreverses: false)
                                : .default,
                            value: store.isLoading,
                        )
                }
                .buttonStyle(.plain)
                .disabled(store.isLoading)
            }

            Group {
                if let tip = store.latest {
                    Text(tip.content)
                        .font(.title3)
                        .fixedSize(horizontal: false, vertical: true)
                } else if store.failed {
                    Text("Couldn't load the tip. Check the connection and try again.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity, alignment: .center)
                }
            }
            .frame(alignment: .topLeading)

            if let tip = store.latest {
                Text("Generated \(TipFetcher.clockTime(fromISO: tip.generatedAt))")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(16)
        .frame(width: 340) // window width fixed; height follows the tip text
        .task {
            if store.latest == nil {
                await store.poll()
            }
        }
    }
}
