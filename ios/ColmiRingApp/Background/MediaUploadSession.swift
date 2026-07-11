import Foundation
import UIKit

/**
 A background `URLSession` dedicated to media (photo/video) uploads. Mirrors
 `BackgroundUploadSession`: transfers survive app termination and iOS relaunches
 the app in the background when they complete.

 Unlike ring readings (JSON), media uploads are large, so each task carries a
 file-backed request body (the multipart temp file produced by `MediaClient`).
 The delegate maps completed task IDs back to asset local identifiers so
 `MediaSyncer` can mark them uploaded.
 */
final class MediaUploadSession: NSObject, URLSessionDelegate, URLSessionDataDelegate, URLSessionTaskDelegate {
    static let shared = MediaUploadSession()

    /// Stable identifier iOS uses to persist transfers across launches.
    static let identifier = "space.grig-teo.colmi-ring.media-upload"

    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: Self.identifier)
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        config.allowsCellularAccess = true
        config.shouldUseExtendedBackgroundIdleMode = true
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    /// The underlying URLSession. Lazily created on first access.
    var urlSession: URLSession { session }

    /// Invoked when all background transfers finish (so the app can flush state).
    var didFinishBackgroundEvents: (() -> Void)?

    /// taskID → asset local identifier, so completions can be reconciled.
    private var inflight: [Int: String] = [:]
    private let lock = NSLock()

    private override init() {
        super.init()
    }

    /// Records the asset id behind an enqueued task, so on completion we know
    /// what to mark uploaded.
    func register(task: URLSessionTask, assetLocalId: String) {
        lock.lock(); defer { lock.unlock() }
        inflight[task.taskIdentifier] = assetLocalId
    }

    func assetLocalId(for task: URLSessionTask) -> String? {
        lock.lock(); defer { lock.unlock() }
        return inflight[task.taskIdentifier]
    }

    func clear(task: URLSessionTask) {
        lock.lock(); defer { lock.unlock() }
        inflight.removeValue(forKey: task.taskIdentifier)
    }

    // MARK: - URLSessionTaskDelegate

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        // Surface result to the main-actor syncer; it owns the upload registry.
        let assetId = assetLocalId(for: task)
        clear(task: task)
        Task { @MainActor in
            MediaSyncer.shared.handleTaskComplete(
                assetLocalId: assetId,
                task: task,
                error: error
            )
        }
    }

    // MARK: - URLSessionDelegate

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async { [weak self] in
            self?.didFinishBackgroundEvents?()
        }
    }
}
