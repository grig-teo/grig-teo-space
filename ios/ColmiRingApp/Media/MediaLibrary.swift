import Foundation
import Photos
import UIKit
import AVFoundation

/**
 Thin wrapper around the Photos framework giving the rest of the app:
   - authorization status + request flow,
   - a snapshot of all image/video assets (most recent first),
   - thumbnail loading for the grid,
   - the original file URL + size for upload,
   - a local AVPlayerItem / UIImage for playback.

 Requires full Photo Library access (`readWrite`) because we enumerate the
 entire library to back it up — limited picker access can't do that.
 */

enum MediaLibraryAccess {
    case full
    case limited
    case denied
    case notDetermined

    static var current: MediaLibraryAccess {
        switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
        case .authorized: return .full
        case .limited: return .limited
        case .denied, .restricted: return .denied
        default: return .notDetermined
        }
    }
}

@MainActor
final class MediaLibraryWrapper: ObservableObject {
    static let shared = MediaLibraryWrapper()

    @Published var access: MediaLibraryAccess = MediaLibraryAccess.current

    private init() {}

    /// Requests full library access. Updates `access` and returns the result.
    @discardableResult
    func requestAccess() async -> MediaLibraryAccess {
        let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        access = {
            switch status {
            case .authorized: return .full
            case .limited: return .limited
            default: return .denied
            }
        }()
        return access
    }

    // MARK: - Enumeration

    /// A lightweight snapshot of a PHAsset — enough to render the grid and
    /// enqueue uploads without holding onto PHAsset objects across tasks.
    struct AssetSnapshot: Identifiable, Hashable {
        let id: String              // PHAsset.localIdentifier
        let kind: Kind
        let creationDate: Date?
        let duration: TimeInterval?
        let pixelWidth: Int
        let pixelHeight: Int

        enum Kind: String { case photo, video }

        var durationMs: Int? {
            guard let duration, duration > 0 else { return nil }
            return Int(duration * 1000)
        }
    }

    /// Returns all image+video assets, newest first.
    func allSnapshots() -> [AssetSnapshot] {
        var out: [AssetSnapshot] = []
        let fetchOptions = PHFetchOptions()
        fetchOptions.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        fetchOptions.predicate = NSPredicate(
            format: "(mediaType == %d) OR (mediaType == %d)",
            PHAssetMediaType.image.rawValue,
            PHAssetMediaType.video.rawValue
        )

        let result = PHAsset.fetchAssets(with: fetchOptions)
        result.enumerateObjects { asset, _, _ in
            let kind: AssetSnapshot.Kind = asset.mediaType == .video ? .video : .photo
            out.append(
                AssetSnapshot(
                    id: asset.localIdentifier,
                    kind: kind,
                    creationDate: asset.creationDate,
                    duration: asset.mediaType == .video ? asset.duration : nil,
                    pixelWidth: asset.pixelWidth,
                    pixelHeight: asset.pixelHeight
                )
            )
        }
        return out
    }

    // MARK: - Thumbnail

    /// Loads a square-ish thumbnail for the grid. Calls back on the main actor.
    func requestThumbnail(for localIdentifier: String, targetSize: CGSize, completion: @escaping @MainActor (UIImage?) -> Void) {
        guard let asset = fetchAsset(localIdentifier) else { completion(nil); return }
        let options = PHImageRequestOptions()
        options.deliveryMode = .opportunistic
        options.resizeMode = .fast
        options.isNetworkAccessAllowed = true
        PHImageManager.default().requestImage(
            for: asset,
            targetSize: targetSize,
            contentMode: .aspectFill,
            options: options
        ) { image, _ in
            Task { @MainActor in completion(image) }
        }
    }

    // MARK: - Full image (viewer)

    func requestFullImage(for localIdentifier: String, completion: @escaping @MainActor (UIImage?) -> Void) {
        guard let asset = fetchAsset(localIdentifier) else { completion(nil); return }
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.isNetworkAccessAllowed = true
        PHImageManager.default().requestImage(
            for: asset,
            targetSize: PHImageManagerMaximumSize,
            contentMode: .aspectFit,
            options: options
        ) { image, _ in
            Task { @MainActor in completion(image) }
        }
    }

    // MARK: - Video playback

    /// Loads an AVPlayerItem that plays the asset locally (no network). Bridges
    /// PHAsset → AVAsset via PHImageManager's callback API.
    func playerItem(for localIdentifier: String) async -> AVPlayerItem? {
        guard let asset = fetchAsset(localIdentifier) else { return nil }
        return await withCheckedContinuation { (cont: CheckedContinuation<AVPlayerItem?, Never>) in
            let options = PHVideoRequestOptions()
            options.isNetworkAccessAllowed = true
            options.deliveryMode = .highQualityFormat
            PHImageManager.default().requestAVAsset(forVideo: asset, options: options) { avAsset, _, _ in
                if let avAsset {
                    cont.resume(returning: AVPlayerItem(asset: avAsset))
                } else {
                    cont.resume(returning: nil)
                }
            }
        }
    }

    // MARK: - Upload source

    /**
     Writes the asset's original bytes to a temp file and returns it, so the
     uploader can stream the file to the backend. The resource manager pulls
     from iCloud automatically when `isNetworkAccessAllowed = true`, so there's
     no separate prefetch needed. Throws on read/export errors.
     */
    func exportFile(for localIdentifier: String) async throws -> (url: URL, size: Int64) {
        guard let asset = fetchAsset(localIdentifier) else {
            throw NSError(domain: "MediaLibrary", code: 1, userInfo: [NSLocalizedDescriptionKey: "Asset not found"])
        }

        let resources = PHAssetResource.assetResources(for: asset)
        guard let resource = resources.first else {
            throw NSError(domain: "MediaLibrary", code: 2, userInfo: [NSLocalizedDescriptionKey: "No resource for asset"])
        }

        let ext = (resource.originalFilename as NSString).pathExtension.nilIfEmpty ?? defaultExtension(for: asset)
        let dest = FileManager.default.temporaryDirectory
            .appendingPathComponent("media-src-\(UUID().uuidString).\(ext)", isDirectory: false)

        let options = PHAssetResourceRequestOptions()
        options.isNetworkAccessAllowed = true
        try await writeResource(resource, to: dest, options: options)

        let writtenSize = (try? FileManager.default.attributesOfItem(atPath: dest.path)[.size] as? Int64) ?? 0
        return (dest, writtenSize)
    }

    // MARK: - Delete

    /**
     Deletes the asset from the device photo library (moves it to Recently
     Deleted). iOS always shows its own system confirmation for this, and the
     user can cancel there — so this returns true only when the deletion
     actually happened. Returns true immediately if the asset is already gone.
     */
    @discardableResult
    func deleteAsset(localId: String) async -> Bool {
        let fetch = PHAsset.fetchAssets(withLocalIdentifiers: [localId], options: nil)
        guard fetch.count > 0 else { return true }
        do {
            try await PHPhotoLibrary.shared().performChanges {
                PHAssetChangeRequest.deleteAssets(fetch)
            }
            return true
        } catch {
            // Most commonly: the user cancelled the system confirmation.
            return false
        }
    }

    // MARK: - Helpers

    private func fetchAsset(_ localIdentifier: String) -> PHAsset? {
        let fetch = PHAsset.fetchAssets(withLocalIdentifiers: [localIdentifier], options: nil)
        return fetch.firstObject
    }

    private func defaultExtension(for asset: PHAsset) -> String {
        switch asset.mediaType {
        case .video: return "mov"
        case .image: return "jpg"
        default: return "dat"
        }
    }

    private func writeResource(_ resource: PHAssetResource, to dest: URL, options: PHAssetResourceRequestOptions) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            PHAssetResourceManager.default().writeData(for: resource, toFile: dest, options: options) { error in
                if let error { cont.resume(throwing: error) }
                else { cont.resume() }
            }
        }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
