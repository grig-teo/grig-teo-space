import Foundation
import Combine
import UIKit

/**
 Drives the photo/video backup. Responsibilities:

   - Enumerate the device photo library via `MediaLibraryWrapper`.
   - Diff against the persisted set of already-uploaded asset ids.
   - For each pending asset: export the file, build a multipart request, and
     upload it on the foreground session (or the background session when the
     app is suspended).
   - On success: persist the asset id as uploaded and bump progress.
   - On failure: record the last error so the UI can show it (never silent).

 State is `@Published` so the grid + FAB reflect progress live. The uploaded
 registry (`media_sync_state.json`) makes sync idempotent and resumable across
 app restarts and OS relaunches.

 Triggers (all funnel into `syncIfNeeded()`):
   - Media tab appearance (`.task`)
   - FAB tap (manual start)
   - Periodic `BGAppRefreshTask` (BackgroundTaskScheduler)
 */

@MainActor
final class MediaSyncer: ObservableObject {
    static let shared = MediaSyncer()

    enum Status: Equatable {
        case idle
        case scanning
        case syncing
        case paused
        case failed(String)
    }

    @Published private(set) var status: Status = .idle
    @Published private(set) var uploadedCount: Int = 0
    @Published private(set) var totalCount: Int = 0
    @Published private(set) var failedCount: Int = 0
    @Published private(set) var currentAssetName: String?
    @Published private(set) var lastSyncAt: Date?
    /// Bumped whenever an asset is marked uploaded, so grid cells observing
    /// `isUploaded(_:)` re-evaluate when the set's membership changes.
    @Published private(set) var uploadedRevision: Int = 0
    /// Last error message (for the UI). Cleared at the start of each run.
    @Published private(set) var lastError: String?

    private let library = MediaLibraryWrapper.shared
    private let client = MediaClient.shared

    /// assetLocalId → server id, for what's already safely backed up.
    private var uploaded: [String: String] = [:]
    private let stateURL: URL = {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent("media_sync_state.json")
    }()

    /// Max simultaneous uploads.
    private let concurrency = 2
    private var stopRequested = false
    /// Guard against overlapping runs (e.g. onAppear + FAB).
    private var running = false
    /// True once we've reconciled the local registry against the server this
    /// launch. Prevents repeated fetches and limits the rebuild to the case it
    /// fixes: a fresh install with an empty `media_sync_state.json`.
    private var reconciled = false

    private init() {
        loadState()
    }

    // MARK: - Public

    var isBusy: Bool {
        switch status {
        case .scanning, .syncing: return true
        default: return false
        }
    }

    /// Starts a sync run unless one is already in progress.
    func syncIfNeeded() async {
        guard !running else { return }
        guard library.access == .full || library.access == .limited else {
            status = .failed("Photo library access required")
            return
        }
        await runSync()
    }

    /// Force a sync (FAB tap).
    func startSync() async {
        guard !running else { return }
        guard library.access == .full || library.access == .limited else {
            status = .failed("Photo library access required")
            return
        }
        await runSync()
    }

    /// Stops after the current in-flight uploads finish.
    func stop() {
        stopRequested = true
        status = .paused
    }

    // MARK: - Core loop

    private func runSync() async {
        running = true
        stopRequested = false
        lastError = nil
        failedCount = 0
        status = .scanning

        // After a reinstall the local registry (`media_sync_state.json`) is
        // gone, so `uploaded` is empty and every library asset would look
        // pending — re-uploading the whole library. Rebuild it from the
        // server's source of truth first, so already-backed-up assets are
        // correctly skipped. Runs once per launch, only when the file is
        // absent or empty.
        await reconcileIfNeeded()

        let snapshots = library.allSnapshots()
        totalCount = snapshots.count
        let toUpload = snapshots.filter { uploaded[$0.id] == nil }
        uploadedCount = totalCount - toUpload.count

        if toUpload.isEmpty {
            status = .idle
            lastSyncAt = Date()
            running = false
            return
        }

        status = .syncing

        await withTaskGroup(of: AssetResult.self) { [concurrency, weak self] group in
            guard let self else { return }
            var iterator = toUpload.makeIterator()
            // Prime the group with `concurrency` tasks.
            for _ in 0..<concurrency {
                if let snapshot = iterator.next() {
                    group.addTask { await self.uploadOne(snapshot: snapshot) }
                }
            }
            // As each finishes, feed the next pending asset in.
            while let result = await group.next() {
                self.applyResult(result)
                if self.stopRequested { break }
                if let snapshot = iterator.next() {
                    group.addTask { await self.uploadOne(snapshot: snapshot) }
                }
            }
        }

        // If backgrounded, foreground uploads aren't possible — hand the rest
        // off to the background session by enqueueing file-backed tasks.
        if UIApplication.shared.applicationState == .background {
            await enqueueBackgroundBatch(toUpload)
        }

        lastSyncAt = Date()
        running = false
        if stopRequested {
            status = .paused
        } else if failedCount > 0 && uploadedCount == 0 {
            status = .failed(lastError ?? "Upload failed")
        } else {
            status = .idle
        }
    }

    private struct AssetResult {
        let assetLocalId: String
        let success: Bool
        let error: String?
        let serverId: String?
    }

    /// Uploads one asset on the foreground session and returns a result.
    /// Sets `lastError`/`currentAssetName` for UI feedback.
    private func uploadOne(snapshot: MediaLibraryWrapper.AssetSnapshot) async -> AssetResult {
        currentAssetName = snapshot.id
        do {
            let (fileURL, _) = try await library.exportFile(for: snapshot.id)
            let descriptor = MediaClient.UploadDescriptor(
                assetLocalId: snapshot.id,
                kind: snapshot.kind.rawValue,
                filename: filename(for: snapshot),
                mimeType: mimeType(for: snapshot),
                width: snapshot.pixelWidth,
                height: snapshot.pixelHeight,
                durationMs: snapshot.durationMs,
                recordedAt: snapshot.creationDate
            )
            let (request, bodyFile) = try client.makeUploadRequest(fileURL: fileURL, descriptor: descriptor)
            try? FileManager.default.removeItem(at: fileURL) // source copy no longer needed

            let (data, response) = try await URLSession.shared.upload(for: request, fromFile: bodyFile)
            try? FileManager.default.removeItem(at: bodyFile)
            guard let http = response as? HTTPURLResponse else {
                return AssetResult(assetLocalId: snapshot.id, success: false, error: "No HTTP response", serverId: nil)
            }
            guard (200..<300).contains(http.statusCode) else {
                let msg = "HTTP \(http.statusCode)"
                return AssetResult(assetLocalId: snapshot.id, success: false, error: msg, serverId: nil)
            }
            // Capture the server-assigned id so the grid can delete it later.
            let serverId = (try? JSONDecoder().decode(MediaItem.self, from: data))?.id
            return AssetResult(assetLocalId: snapshot.id, success: true, error: nil, serverId: serverId)
        } catch let urlError as URLError {
            return AssetResult(assetLocalId: snapshot.id, success: false, error: urlError.localizedDescription, serverId: nil)
        } catch {
            return AssetResult(assetLocalId: snapshot.id, success: false, error: error.localizedDescription, serverId: nil)
        }
    }

    /// Applies a finished upload's result to published state.
    private func applyResult(_ result: AssetResult) {
        if result.success {
            markUploaded(assetLocalId: result.assetLocalId, serverId: result.serverId)
            uploadedCount += 1
        } else {
            failedCount += 1
            lastError = result.error
        }
    }

    /**
     Deletes a media item from the backend (and clears the local uploaded
     marker so the green check disappears). Called from the grid's long-press
     context menu. `localOnly=true` just forgets the marker without hitting the
     server (for items that failed to upload).
     */
    func delete(localId: String, localOnly: Bool = false) async {
        let serverId = uploaded[localId]
        if !localOnly, let serverId {
            do {
                try await client.delete(id: serverId)
            } catch {
                lastError = "Delete failed: \(error.localizedDescription)"
                return
            }
        }
        uploaded.removeValue(forKey: localId)
        uploadedRevision &+= 1
        if uploadedCount > 0 { uploadedCount -= 1 }
        saveState()
    }

    // MARK: - Background path

    /**
     When the app is suspended, the foreground async upload API can't drive
     transfers. Enqueue file-backed tasks on the background session instead;
     their completions are reconciled by `MediaUploadSession`'s delegate →
     `handleTaskComplete`.
     */
    private func enqueueBackgroundBatch(_ snapshots: [MediaLibraryWrapper.AssetSnapshot]) async {
        for snapshot in snapshots where uploaded[snapshot.id] == nil {
            do {
                let (fileURL, _) = try await library.exportFile(for: snapshot.id)
                let descriptor = MediaClient.UploadDescriptor(
                    assetLocalId: snapshot.id,
                    kind: snapshot.kind.rawValue,
                    filename: filename(for: snapshot),
                    mimeType: mimeType(for: snapshot),
                    width: snapshot.pixelWidth,
                    height: snapshot.pixelHeight,
                    durationMs: snapshot.durationMs,
                    recordedAt: snapshot.creationDate
                )
                let (request, bodyFile) = try client.makeUploadRequest(fileURL: fileURL, descriptor: descriptor)
                try? FileManager.default.removeItem(at: fileURL)
                let task = MediaUploadSession.shared.urlSession.uploadTask(with: request, fromFile: bodyFile)
                MediaUploadSession.shared.register(task: task, assetLocalId: snapshot.id)
                task.resume()
            } catch {
                // Best-effort in the background; next foreground run retries.
            }
        }
    }

    // MARK: - Completion (called from MediaUploadSession delegate on the main actor)

    func handleTaskComplete(assetLocalId: String?, task: URLSessionTask, error: Error?) {
        if let assetLocalId, error == nil,
           let response = task.response as? HTTPURLResponse,
           (200..<300).contains(response.statusCode) {
            markUploaded(assetLocalId: assetLocalId)
            uploadedCount += 1
        } else if error != nil {
            failedCount += 1
            lastError = error?.localizedDescription
        }
    }

    // MARK: - State persistence

    /**
     Seeds the uploaded registry from the backend when the local file is
     missing or empty (i.e. a fresh install). Best-effort: on network failure
     we leave the registry as-is so a normal sync still works (the backend's
     own `assetLocalId` dedup prevents real duplicates regardless).
     */
    private func reconcileIfNeeded() async {
        guard !reconciled else { return }
        reconciled = true
        guard uploaded.isEmpty else { return }
        guard let ids = try? await client.uploadedAssetIds() else { return }
        for id in ids {
            uploaded[id] = "uploaded"
        }
        uploadedRevision &+= 1
        saveState()
    }

    private func markUploaded(assetLocalId: String, serverId: String? = nil) {
        guard uploaded[assetLocalId] == nil else { return }
        // Store the server id when known (foreground path); fall back to a
        // sentinel for the background path where we don't parse the response.
        uploaded[assetLocalId] = serverId ?? "uploaded"
        uploadedRevision &+= 1
        saveState()
    }

    func isUploaded(_ localId: String) -> Bool {
        uploaded[localId] != nil
    }

    private func loadState() {
        guard let data = try? Data(contentsOf: stateURL),
              let dict = try? JSONDecoder().decode([String: String].self, from: data) else {
            return
        }
        uploaded = dict
    }

    private func saveState() {
        guard let data = try? JSONEncoder().encode(uploaded) else { return }
        try? data.write(to: stateURL, options: .atomic)
    }

    private func filename(for snapshot: MediaLibraryWrapper.AssetSnapshot) -> String {
        switch snapshot.kind {
        case .photo: return "\(snapshot.id).jpg"
        case .video: return "\(snapshot.id).mov"
        }
    }

    private func mimeType(for snapshot: MediaLibraryWrapper.AssetSnapshot) -> String {
        switch snapshot.kind {
        case .photo: return "image/jpeg"
        case .video: return "video/quicktime"
        }
    }
}
