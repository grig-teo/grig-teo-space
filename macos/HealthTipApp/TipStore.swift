import Foundation

/** Shared latest-tip state: the AppDelegate polls it, the window observes it. */
@MainActor
final class TipStore: ObservableObject {
    static let shared = TipStore()

    @Published private(set) var latest: Tip?
    @Published private(set) var isLoading = false
    @Published private(set) var failed = false

    private init() {}

    /// Fetch the latest tip; notifies when it's a new one. Safe to call
    /// often — TipNotifier dedupes by id.
    func poll() async {
        isLoading = true
        failed = false
        do {
            let tip = try await TipFetcher.latest()
            latest = tip
            TipNotifier.shared.notifyIfNew(tip)
        } catch {
            failed = true
        }
        isLoading = false
    }
}
