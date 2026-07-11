import Foundation

/**
 A background `URLSession` whose transfers survive app termination and can
 trigger a background relaunch when they complete.

 The app uses two sessions:
  - Foreground: the shared `URLSession.shared`, used while active for low latency.
  - Background: this session, used when the app is suspended so uploads can
    continue and be retried by iOS even after a kill.

 `sessionSendsLaunchEvents = true` asks iOS to relaunch the app in the
 background when a transfer finishes, so the result can be processed. The
 delegate routes completion into `ApiClient`, which clears the on-disk queue.
 */
final class BackgroundUploadSession: NSObject, URLSessionDelegate, URLSessionDataDelegate {
    static let shared = BackgroundUploadSession()

    /// Stable identifier iOS uses to persist transfers across launches.
    static let identifier = "space.grig-teo.colmi-ring.upload"

    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: Self.identifier)
        config.isDiscretionary = false          // don't defer — health data is time-sensitive
        config.sessionSendsLaunchEvents = true   // relaunch app on completion
        config.allowsCellularAccess = true
        config.shouldUseExtendedBackgroundIdleMode = true
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    /// The underlying URLSession. Lazily created on first access.
    var urlSession: URLSession { session }

    /// Closure invoked when all background transfers have finished, so the
    /// app can flush any remaining queued readings and update UI state.
    var didFinishBackgroundEvents: (() -> Void)?

    private override init() {
        super.init()
    }

    // MARK: - URLSessionDelegate

    /// Called by iOS when all background tasks for this session complete. Must
    /// call the completion handler promptly or the app is killed.
    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async { [weak self] in
            self?.didFinishBackgroundEvents?()
        }
    }
}
