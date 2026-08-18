import SwiftUI
import Photos

/**
 Media tab: a grid of the device's photo/video library with a sync FAB.

   - Grid cells render a thumbnail from the local PHAsset, with an "uploaded ✓"
     badge when the asset is already backed up and a ▶ + duration overlay on
     videos.
   - The bottom-right FAB starts/stops a backup run. While syncing, the top bar
     shows progress (uploaded/total).
   - Tap a cell → MediaViewerView (full-screen local playback, no network).
   - Select (nav bar, trailing) enters selection mode: tap cells to
     multi-select, then use the bottom bar — share (left) or batch delete
     (right, trash). The batch delete asks iOS once for the whole selection.

 The syncer is shared (`MediaSyncer.shared`); a run is also kicked off on view
 appear via `.task` (the periodic BG task and the FAB are the other triggers).
 */
struct MediaView: View {
    @ObservedObject var library = MediaLibraryWrapper.shared
    @ObservedObject var syncer = MediaSyncer.shared

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 3), count: 3)

    @State private var snapshots: [MediaLibraryWrapper.AssetSnapshot] = []
    /// Drives the FAB's spinning icon while a sync is in progress.
    @State private var fabRotation: Double = 0
    /// Selection mode: tapping a cell toggles membership instead of navigating.
    @State private var isSelecting = false
    @State private var selected: Set<String> = []
    /// Exported temp files to share (non-nil → the share sheet is presented).
    @State private var shareItems: [URL]?
    @State private var isPreparingShare = false
    @State private var isDeleting = false

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("")
                .toolbar { selectButton }
                .overlay(alignment: .bottomTrailing) { if !isSelecting { fab } }
                .overlay(alignment: .bottom) { selectionBar }
                .sheet(item: Binding(
                    get: { shareItems.map { ShareItems(items: $0) } },
                    set: { _ in shareItems = nil }
                )) { wrapper in
                    ShareSheet(items: wrapper.items)
                }
                .task { await refresh() }
                .onChange(of: library.access) { _ in
                    Task { await refresh() }
                }
                .onChange(of: syncer.isBusy) { busy in
                    // Keep the FAB icon spinning for the whole sync run.
                    withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) {
                        fabRotation = busy ? 360 : 0
                    }
                }
        }
    }

    /// Nav-bar Select/Cancel toggle, on the same line as the "Media" title.
    @ToolbarContentBuilder
    private var selectButton: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            if !snapshots.isEmpty {
                Button {
                    withAnimation { isSelecting.toggle() }
                    if !isSelecting { selected.removeAll() }
                } label: {
                    Label(isSelecting ? "Cancel" : "Select",
                          systemImage: isSelecting ? "xmark.circle" : "checkmark.circle")
                }
            }
        }
    }

    /// Identifiable box so `.sheet(item:)` re-presents for each share action.
    private struct ShareItems: Identifiable {
        let id = UUID()
        let items: [Any]
    }

    @ViewBuilder
    private var content: some View {
        switch library.access {
        case .full, .limited:
            if snapshots.isEmpty {
                emptyState
            } else {
                    ScrollView {
                    LazyVGrid(columns: columns, spacing: 3) {
                        ForEach(snapshots) { snapshot in
                            if isSelecting {
                                MediaThumbnailCell(snapshot: snapshot, uploaded: syncer.isUploaded(snapshot.id))
                                    .overlay(alignment: .topTrailing) { selectionBadge(for: snapshot.id) }
                                    .onTapGesture { toggleSelection(snapshot.id) }
                            } else {
                                NavigationLink {
                                    MediaViewerView(snapshot: snapshot)
                                } label: {
                                    MediaThumbnailCell(snapshot: snapshot, uploaded: syncer.isUploaded(snapshot.id))
                                }
                                .buttonStyle(.plain)
                                .contextMenu {
                                    Button(role: .destructive) {
                                        Task { await delete(snapshot) }
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                            }
                        }
                    }
                    .padding(.bottom, 96) // clearance for the FAB / selection bar
                }
            }
        case .denied:
            deniedState
        case .notDetermined:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "photo.on.rectangle.angled")
                .font(.system(size: 48))
                .foregroundColor(.secondary)
            Text("No photos or videos found")
                .font(.headline)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var deniedState: some View {
        VStack(spacing: 16) {
            Image(systemName: "lock.shield")
                .font(.system(size: 48))
                .foregroundColor(.secondary)
            Text("Photo library access is required to back up your media.")
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
                .padding(.horizontal)
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - FAB

    private var fab: some View {
        VStack(alignment: .trailing, spacing: 12) {
            if syncer.isBusy {
                progressPill
            } else if let error = statusMessage {
                statusBanner(error)
            }
            Button {
                Task {
                    if syncer.isBusy { syncer.stop() }
                    else { await syncer.startSync() }
                }
            } label: {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 26, weight: .semibold))
                    .frame(width: 60, height: 60)
                    .foregroundColor(.white)
                    .background(Circle().fill(Color.blue))
                    .shadow(radius: 4, y: 2)
                    .rotationEffect(.degrees(fabRotation))
            }
            .padding(.trailing, 20)
            .padding(.bottom, 24)
        }
    }

    /// Human-readable status text: failure reasons take priority so they're
    /// impossible to miss (e.g. wrong backend URL, network/auth errors).
    private var statusMessage: String? {
        switch syncer.status {
        case .failed(let msg): return "Sync failed: \(msg)"
        default:
            if syncer.failedCount > 0 {
                return "\(syncer.failedCount) item(s) failed — last: \(syncer.lastError ?? "unknown")"
            }
            return nil
        }
    }

    private func statusBanner(_ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.orange)
            Text(text)
                .font(.footnote.bold())
                .lineLimit(2)
                .multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Capsule().fill(Color(.systemBackground)).shadow(radius: 3, y: 1))
        .frame(maxWidth: 260, alignment: .trailing)
        .padding(.trailing, 20)
    }

    private var progressPill: some View {
        HStack(spacing: 8) {
            ProgressView()
                .scaleEffect(0.8)
            Text("\(syncer.uploadedCount) / \(syncer.totalCount)")
                .font(.footnote.bold())
            if syncer.failedCount > 0 {
                Text("· \(syncer.failedCount) failed")
                    .font(.caption2)
                    .foregroundColor(.orange)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Capsule().fill(Color(.systemBackground)).shadow(radius: 3, y: 1))
        .padding(.trailing, 20)
    }

    private func refresh() async {
        let access = await library.requestAccess()
        guard access == .full || access == .limited else { return }
        snapshots = library.allSnapshots()
        await syncer.syncIfNeeded()
    }

    /// Long-press → Delete. iOS shows its own mandatory system confirmation,
    /// so the app asks nothing itself; the server backup is removed only
    /// after the local delete succeeds (a cancel there keeps the backup).
    private func delete(_ item: MediaLibraryWrapper.AssetSnapshot) async {
        guard await library.deleteAsset(localId: item.id) else { return }
        if syncer.isUploaded(item.id) {
            await syncer.delete(localId: item.id)
        }
        snapshots.removeAll { $0.id == item.id }
    }

    // MARK: - Selection mode

    /// Badge on every cell in selection mode: filled blue check when the item
    /// is selected, hollow circle otherwise.
    private func selectionBadge(for id: String) -> some View {
        let isOn = selected.contains(id)
        return Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
            .font(.system(size: 22, weight: .semibold))
            .foregroundColor(isOn ? .blue : .white)
            .background(Circle().fill(isOn ? Color.white : Color.black.opacity(0.15)))
            .shadow(radius: 1, y: 0.5)
            .padding(6)
    }

    private func toggleSelection(_ id: String) {
        if selected.contains(id) {
            selected.remove(id)
        } else {
            selected.insert(id)
        }
    }

    /// Bottom bar in selection mode: share on the left, batch delete (trash)
    /// on the right, selected count in the middle. Appears once ≥1 item is
    /// selected; the sync FAB is hidden while selecting so they never overlap.
    @ViewBuilder
    private var selectionBar: some View {
        if isSelecting && !selected.isEmpty {
            HStack {
                Button { Task { await shareSelected() } } label: {
                    ZStack {
                        if isPreparingShare {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: "square.and.arrow.up")
                        }
                    }
                    .font(.system(size: 24, weight: .semibold))
                    .frame(width: 56, height: 56)
                    .foregroundColor(.white)
                    .background(Circle().fill(Color.blue))
                    .shadow(radius: 4, y: 2)
                }
                .disabled(isPreparingShare || isDeleting)
                Spacer()
                Text("\(selected.count) selected")
                    .font(.footnote.bold())
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(Color(.systemBackground)).shadow(radius: 3, y: 1))
                Spacer()
                Button { Task { await deleteSelected() } } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 24, weight: .semibold))
                        .frame(width: 56, height: 56)
                        .foregroundColor(.white)
                        .background(Circle().fill(Color.red))
                        .shadow(radius: 4, y: 2)
                }
                .disabled(isPreparingShare || isDeleting)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    /// Trash with ≥1 selected: PhotoKit deletes the batch in one transaction,
    /// so iOS shows a single system confirmation. Server backups are removed
    /// per item only after the local delete succeeds (a cancel keeps them).
    private func deleteSelected() async {
        let ids = snapshots.filter { selected.contains($0.id) }.map(\.id)
        guard !ids.isEmpty else { return }
        isDeleting = true
        defer { isDeleting = false }
        guard await library.deleteAssets(localIds: ids) else { return }
        for id in ids where syncer.isUploaded(id) {
            await syncer.delete(localId: id)
        }
        snapshots.removeAll { selected.contains($0.id) }
        selected.removeAll()
        isSelecting = false
    }

    /// Exports each selected asset to a temp file (original bytes, same path
    /// the uploader uses — handles iCloud) and opens the share sheet.
    private func shareSelected() async {
        isPreparingShare = true
        defer { isPreparingShare = false }
        var urls: [URL] = []
        for snapshot in snapshots where selected.contains(snapshot.id) {
            if let exported = try? await library.exportFile(for: snapshot.id) {
                urls.append(exported.url)
            }
        }
        guard !urls.isEmpty else { return }
        shareItems = urls
    }
}

// MARK: - Thumbnail cell

struct MediaThumbnailCell: View {
    let snapshot: MediaLibraryWrapper.AssetSnapshot
    let uploaded: Bool

    @State private var thumbnail: UIImage?

    private let thumbSize = CGSize(width: 300, height: 300) // @2x for ~100pt cells

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            if let thumbnail {
                Image(uiImage: thumbnail)
                    .resizable()
                    .scaledToFill()
                    .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0)
                    .aspectRatio(1, contentMode: .fill)
                    .clipped()
            } else {
                Rectangle()
                    .fill(Color(.secondarySystemBackground))
                    .aspectRatio(1, contentMode: .fill)
                    .overlay(ProgressView().scaleEffect(0.6))
            }

            // Video badge
            if snapshot.kind == .video {
                HStack(spacing: 4) {
                    Image(systemName: "play.fill")
                        .font(.caption2)
                    if let duration = snapshot.duration {
                        Text(formatDuration(duration))
                            .font(.caption2.bold())
                    }
                }
                .foregroundColor(.white)
                .shadow(radius: 2)
                .padding(6)
            }

            // Uploaded badge — small green check, top-right, always visible.
            if uploaded {
                Image(systemName: "checkmark.fill")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
                    .padding(4)
                    .background(Circle().fill(Color.green))
                    .overlay(Circle().stroke(Color.white, lineWidth: 1))
                    .shadow(radius: 1, y: 0.5)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(5)
                    .transition(.opacity)
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .clipped()
        // Constrain hit-testing to the cell's bounds: scaledToFill thumbnails
        // overflow the frame before clipping, and .clipped() only clips
        // drawing — not touches. Without this a tap can land on a neighboring
        // cell's NavigationLink (opens the item below the tapped one).
        .contentShape(Rectangle())
        .onAppear { loadThumbnail() }
        .animation(.easeInOut(duration: 0.2), value: uploaded)
    }

    private func loadThumbnail() {
        guard thumbnail == nil else { return }
        MediaLibraryWrapper.shared.requestThumbnail(for: snapshot.id, targetSize: thumbSize) { image in
            self.thumbnail = image
        }
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let s = Int(seconds)
        return s >= 60 ? "\(s / 60):\(String(format: "%02d", s % 60))" : "\(s)s"
    }
}
