import BackgroundTasks
import UIKit

/**
 Schedules and dispatches the app's two `BGTaskScheduler` task types, used to
 wake the app after it has been suspended or killed.

   - `flush`: a `BGAppRefreshTask` (~15 min cadence, OS-decided) that drains
     any pending readings to the backend.
   - `poll`: a `BGProcessingTask` (~1h, requires network) that reconnects the
     ring and collects + uploads data.

 Both must be registered via `register()` before the app finishes launching,
 and their identifiers must be listed in Info.plist under
 `BGTaskSchedulerPermittedIdentifiers`.

 IMPORTANT: BG execution is entirely at iOS's discretion — the system decides
 when (and whether) to run these, based on battery, usage patterns, and budget.
 They are a best-effort supplement to the `bluetooth-central` background mode,
 not a reliable timer.
 */
@MainActor
final class BackgroundTaskScheduler {
    static let shared = BackgroundTaskScheduler()

    static let flushIdentifier = "space.grig-teo.colmi-ring.flush"
    static let pollIdentifier = "space.grig-teo.colmi-ring.poll"
    static let mediaSyncIdentifier = "space.grig-teo.colmi-ring.media-sync"

    private init() {}

    /// Must be called from `App.init()` BEFORE the app finishes launching.
    /// Registers the handlers with the system; subsequent schedule requests
    /// are matched back to these closures.
    func register() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.flushIdentifier,
            using: nil,
        ) { [weak self] task in
            guard let self,
                  let task = task as? BGAppRefreshTask
            else { task.setTaskCompleted(success: false); return }
            self.handleFlush(task)
        }

        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.pollIdentifier,
            using: nil,
        ) { [weak self] task in
            guard let self,
                  let task = task as? BGProcessingTask
            else { task.setTaskCompleted(success: false); return }
            self.handlePoll(task)
        }

        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.mediaSyncIdentifier,
            using: nil,
        ) { [weak self] task in
            guard let self,
                  let task = task as? BGAppRefreshTask
            else { task.setTaskCompleted(success: false); return }
            self.handleMediaSync(task)
        }
    }

    /// Request the next wakeup for all tasks. Call this whenever the app
    /// backgrounds and after each task completes.
    func scheduleNext() {
        scheduleFlush()
        schedulePoll()
        scheduleMediaSync()
    }

    // MARK: - Flush (frequent, lightweight)

    private func scheduleFlush() {
        let request = BGAppRefreshTaskRequest(identifier: Self.flushIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60) // ~15 min
        do { try BGTaskScheduler.shared.submit(request) } catch { /* will retry later */ }
    }

    private func handleFlush(_ task: BGAppRefreshTask) {
        // Always schedule the next one before doing work.
        scheduleFlush()

        // If iOS reclaims time, stop cleanly.
        task.expirationHandler = { task.setTaskCompleted(success: false) }

        // Drain the queue. `flushAll` runs on the main actor; give it a few
        // seconds, then complete the task.
        let lifecycle = AppState.shared.lifecycle
        lifecycle.api.flushAll()

        // Mark success once the flush has a chance to run. We don't await the
        // full network round-trip here — the next flush will retry leftovers.
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
            task.setTaskCompleted(success: true)
        }
    }

    // MARK: - Poll (less frequent, heavier)

    private func schedulePoll() {
        let request = BGProcessingTaskRequest(identifier: Self.pollIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60) // ~1h
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        do { try BGTaskScheduler.shared.submit(request) } catch { /* will retry later */ }
    }

    private func handlePoll(_ task: BGProcessingTask) {
        schedulePoll()

        let lifecycle = AppState.shared.lifecycle
        task.expirationHandler = {
            lifecycle.stopPolling()
            task.setTaskCompleted(success: false)
        }

        // Reconnect the ring, collect a cycle, then flush.
        lifecycle.api.flushAll()
        lifecycle.startPolling()

        DispatchQueue.main.asyncAfter(deadline: .now() + 25) {
            lifecycle.stopPolling()
            task.setTaskCompleted(success: true)
        }
    }

    // MARK: - Media sync (periodic backup of the photo library)

    private func scheduleMediaSync() {
        let request = BGAppRefreshTaskRequest(identifier: Self.mediaSyncIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 2 * 60 * 60) // ~2h
        do { try BGTaskScheduler.shared.submit(request) } catch { /* will retry later */ }
    }

    private func handleMediaSync(_ task: BGAppRefreshTask) {
        scheduleMediaSync()
        task.expirationHandler = { task.setTaskCompleted(success: false) }

        Task { @MainActor in
            await MediaSyncer.shared.syncIfNeeded()
            // Give the (foreground) uploads a moment to kick off; the background
            // URLSession continues transferring after the task completes.
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            task.setTaskCompleted(success: true)
        }
    }
}
