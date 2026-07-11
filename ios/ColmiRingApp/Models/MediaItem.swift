import Foundation

/**
 Backend representation of a backed-up photo/video. Mirrors the `MediaListItem`
 DTO returned by `GET /api/media`. The `url` is a relative path to the
 device-key-guarded file proxy (`/api/media/<id>/file`).
 */

struct MediaItem: Codable, Identifiable {
    let id: String
    let kind: String            // "photo" | "video"
    let filename: String
    let mimeType: String
    let byteSize: Int
    let width: Int
    let height: Int
    let durationMs: Int?
    let url: String             // relative, e.g. /api/media/<id>/file
    let recordedAt: String?
    let createdAt: String
}

struct MediaPage: Codable {
    let items: [MediaItem]
    let page: Int
    let pageSize: Int
    let total: Int
    let hasMore: Bool
}

/// What `POST /api/media` returns (the stored row, same shape as a list item).
typealias MediaUploadResponse = MediaItem
