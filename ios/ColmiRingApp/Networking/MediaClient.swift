import Foundation
import UIKit

/**
 Talks to the backend's media backup endpoints (/api/media). Auth is the shared
 device key (X-Device-Key), same as ring readings and health documents.

 Uploads build a multipart body written to a temp file, then handed to either
 `URLSession.shared` (foreground) or the background media upload session. Using
 a file-backed body is what lets large video uploads survive app termination —
 a background `URLSessionUploadTask` keeps the file reference and resumes after
 relaunch.
 */

@MainActor
final class MediaClient: ObservableObject {
    static let shared = MediaClient()

    private let settings = AppSettings.shared

    private func authHeaders() -> [String: String] {
        ["X-Device-Key": settings.deviceKey]
    }

    private var base: String {
        settings.backendURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    // MARK: - List

    func list(page: Int, pageSize: Int = 50, kind: String? = nil) async throws -> MediaPage {
        var path = "/api/media?page=\(page)&pageSize=\(pageSize)"
        if let kind {
            path += "&kind=\(kind)"
        }
        guard let url = URL(string: "\(base)\(path)") else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        for (k, v) in authHeaders() { request.setValue(v, forHTTPHeaderField: k) }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(MediaPage.self, from: data)
    }

    // MARK: - Reconcile

  /**
   Fetches the asset-local ids of every item already on the backend. Used
   after a reinstall (when the local uploaded registry is gone) to rebuild it,
   so the app doesn't re-upload the whole library.
   */
  func uploadedAssetIds() async throws -> Set<String> {
    guard let url = URL(string: "\(base)/api/media/ids") else { throw URLError(.badURL) }
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    for (k, v) in authHeaders() { request.setValue(v, forHTTPHeaderField: k) }

    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
    }
    let payload = try JSONDecoder().decode(AssetIdsResponse.self, from: data)
    return Set(payload.assetLocalIds)
  }

  private struct AssetIdsResponse: Decodable {
    let assetLocalIds: [String]
  }

  // MARK: - Upload

    /// Metadata carried alongside the binary in the multipart form fields.
    struct UploadDescriptor {
        let assetLocalId: String
        let kind: String          // "photo" | "video"
        let filename: String
        let mimeType: String
        let width: Int
        let height: Int
        let durationMs: Int?
        let recordedAt: Date?
    }

    /**
     Uploads a media file. The multipart body is written to a temp file, then
     sent via the foreground session when the app is active, or the background
     media session when suspended. The temp file URL is returned so the caller
     (MediaUploadSession) can keep it alive until the background task completes.
     */
    func makeUploadRequest(
        fileURL: URL,
        descriptor: UploadDescriptor
    ) throws -> (URLRequest, URL) {
        let boundary = UUID().uuidString
        guard let url = URL(string: "\(base)/api/media") else { throw URLError(.badURL) }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        for (k, v) in authHeaders() { request.setValue(v, forHTTPHeaderField: k) }

        // Build the multipart body in a temp file (could be hundreds of MB for
        // video — never hold it all in memory).
        let tempBody = FileManager.default.temporaryDirectory
            .appendingPathComponent("media-upload-\(UUID().uuidString)", isDirectory: false)
        try writeMultipartBody(
            to: tempBody,
            fileURL: fileURL,
            descriptor: descriptor,
            boundary: boundary
        )
        return (request, tempBody)
    }

    private func writeMultipartBody(
        to bodyURL: URL,
        fileURL: URL,
        descriptor: UploadDescriptor,
        boundary: String
    ) throws {
        FileManager.default.createFile(atPath: bodyURL.path, contents: nil)
        let handle = try FileHandle(forWritingTo: bodyURL)
        defer { try? handle.close() }

        func write(_ string: String) {
            if let data = string.data(using: .utf8) { try? handle.write(contentsOf: data) }
        }

        write("--\(boundary)\r\n")
        write("Content-Disposition: form-data; name=\"file\"; filename=\"\(descriptor.filename)\"\r\n")
        write("Content-Type: \(descriptor.mimeType)\r\n\r\n")
        // Stream the binary straight from its source file into the body.
        let inHandle = try FileHandle(forReadingFrom: fileURL)
        defer { try? inHandle.close() }
        while true {
            let chunk = try inHandle.read(upToCount: 1 << 20) // 1 MB
            if chunk == nil || chunk?.isEmpty == true { break }
            if let chunk { try handle.write(contentsOf: chunk) }
        }
        write("\r\n")

        writeFormField(handle: handle, boundary: boundary, name: "assetLocalId", value: descriptor.assetLocalId)
        writeFormField(handle: handle, boundary: boundary, name: "kind", value: descriptor.kind)
        writeFormField(handle: handle, boundary: boundary, name: "width", value: "\(descriptor.width)")
        writeFormField(handle: handle, boundary: boundary, name: "height", value: "\(descriptor.height)")
        if let duration = descriptor.durationMs {
            writeFormField(handle: handle, boundary: boundary, name: "durationMs", value: "\(duration)")
        }
        if let recordedAt = descriptor.recordedAt {
            writeFormField(handle: handle, boundary: boundary, name: "recordedAt", value: ISO8601DateFormatter.shared.string(from: recordedAt))
        }
        write("--\(boundary)--\r\n")
    }

    private func writeFormField(handle: FileHandle, boundary: String, name: String, value: String) {
        let part = "--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n"
        if let data = part.data(using: .utf8) { try? handle.write(contentsOf: data) }
    }

    // MARK: - Delete

    /**
     Deletes a backed-up item by the device's asset-local id (query param —
     PHAsset local identifiers contain slashes, so they can't be a path
     segment). Preferred over the server id because the on-device registry
     doesn't always know it (background uploads, post-reinstall reconcile).
     */
    func deleteByLocalId(assetLocalId: String) async throws {
        guard var components = URLComponents(string: "\(base)/api/media") else {
            throw URLError(.badURL)
        }
        components.queryItems = [URLQueryItem(name: "assetLocalId", value: assetLocalId)]
        guard let url = components.url else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        for (k, v) in authHeaders() { request.setValue(v, forHTTPHeaderField: k) }
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }
}
