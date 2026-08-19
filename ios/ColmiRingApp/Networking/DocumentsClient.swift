import Foundation

/**
 Talks to the backend's scanned-documents endpoints (/api/health-docs).
 Auth is the shared device key (X-Device-Key), same as ring readings.
 */

struct DocumentItem: Codable, Identifiable {
    let id: String
    let title: String
    let snippet: String
    let imageUrl: String
    let thumbUrl: String?
    let pageCount: Int
    let language: String?
    let source: String
    let recordedAt: String
}

struct DocumentList: Codable {
    let items: [DocumentItem]
    let page: Int
    let pageSize: Int
    let total: Int
    let hasMore: Bool
}

/** A single page within a document detail. `imageUrl` is a full public URL. */
struct DocumentPage: Codable, Identifiable {
    let id: String
    let pageNumber: Int
    let ocrText: String
    let imageUrl: String
}

/** Full document detail: the list-item fields plus all pages. */
struct DocumentDetail: Codable {
    let id: String
    let title: String
    let snippet: String
    let imageUrl: String
    let thumbUrl: String?
    let pageCount: Int
    let language: String?
    let source: String
    let recordedAt: String
    let pages: [DocumentPage]
}

struct ChatMessage: Codable, Identifiable {
    var id = UUID()
    let role: String        // "user" | "assistant"
    let content: String
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case role, content, createdAt
    }

    /// Parsed server timestamp (nil for locally appended, not yet stored).
    var date: Date? {
        guard let createdAt else { return nil }
        return ISO8601DateFormatter.shared.date(from: createdAt)
    }
}

struct ChatHistory: Codable {
    let messages: [ChatMessage]
}

struct ChatResponse: Codable {
    let answer: String?
    let error: String?
}

@MainActor
final class DocumentsClient: ObservableObject {
    static let shared = DocumentsClient()

    /// Shared chat session id (RecordsChatView + the unread badge).
    static let chatSessionId = "ios-records-chat"

    /// Unread AI-doctor answers, shown as the FAB badge on the Health hub.
    @Published private(set) var unreadCount = 0

    private let settings = AppSettings.shared

    private var lastReadKey: String { "chat.lastReadAt.\(Self.chatSessionId)" }

    /** When the user last had the chat open (drives the unread badge). */
    var chatLastReadAt: Date {
        UserDefaults.standard.object(forKey: lastReadKey) as? Date ?? .distantPast
    }

    /** Marks every message as read and clears the badge. */
    func markChatRead() {
        UserDefaults.standard.set(Date(), forKey: lastReadKey)
        unreadCount = 0
    }

    /** Recounts assistant answers newer than the last chat visit. */
    func refreshUnread() async {
        guard let messages = try? await history(sessionId: Self.chatSessionId) else { return }
        let lastRead = chatLastReadAt
        unreadCount = messages.filter {
            $0.role == "assistant" && ($0.date ?? .distantPast) > lastRead
        }.count
    }

    private func authHeaders() -> [String: String] {
        ["X-Device-Key": settings.deviceKey]
    }

    private var base: String {
        settings.backendURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    // MARK: - List (paginated + searchable)

    func list(query: String?, page: Int, pageSize: Int = 20) async throws -> DocumentList {
        var path = "/api/health-docs?page=\(page)&pageSize=\(pageSize)"
        if let q = query?.trimmingCharacters(in: .whitespaces), !q.isEmpty {
            path += "&query=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
        }
        guard let url = URL(string: "\(base)\(path)") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        for (k, v) in authHeaders() { request.setValue(v, forHTTPHeaderField: k) }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(DocumentList.self, from: data)
    }

    // MARK: - Detail (full document incl. all pages)

    func detail(documentId: String) async throws -> DocumentDetail {
        guard let url = URL(string: "\(base)/api/health-docs/\(documentId)") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        for (k, v) in authHeaders() { request.setValue(v, forHTTPHeaderField: k) }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(DocumentDetail.self, from: data)
    }

    // MARK: - Upload (multipart: image + ocrText + title + language)

    func upload(imageData: Data, ocrText: String, title: String?, language: String?) async throws {
        let boundary = UUID().uuidString
        guard let url = URL(string: "\(base)/api/health-docs") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        for (k, v) in authHeaders() { request.setValue(v, forHTTPHeaderField: k) }

        var body = Data()
        body.appendImagePart(boundary: boundary, name: "image", filename: "scan.jpg", contentType: "image/jpeg", data: imageData)
        body.appendFormField(boundary: boundary, name: "ocrText", value: ocrText)
        if let title { body.appendFormField(boundary: boundary, name: "title", value: title) }
        if let language { body.appendFormField(boundary: boundary, name: "language", value: language) }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw URLError(URLError.Code(rawValue: code))
        }
    }

    /** Creates a document with its first page; returns the new document id. */
    @discardableResult
    func createDocument(imageData: Data, ocrText: String, title: String?, language: String?) async throws -> String {
        let boundary = UUID().uuidString
        guard let url = URL(string: "\(base)/api/health-docs") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        for (k, v) in authHeaders() { request.setValue(v, forHTTPHeaderField: k) }

        var body = Data()
        body.appendImagePart(boundary: boundary, name: "image", filename: "scan.jpg", contentType: "image/jpeg", data: imageData)
        body.appendFormField(boundary: boundary, name: "ocrText", value: ocrText)
        if let title { body.appendFormField(boundary: boundary, name: "title", value: title) }
        if let language { body.appendFormField(boundary: boundary, name: "language", value: language) }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        let (responseData, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw URLError(URLError.Code(rawValue: code))
        }
        if let dict = try? JSONSerialization.jsonObject(with: responseData) as? [String: Any],
           let id = dict["id"] as? String {
            return id
        }
        throw URLError(.cannotParseResponse)
    }

    /** Appends a page to an existing document; returns the new page's document id. */
    @discardableResult
    func addPage(to documentId: String, imageData: Data, ocrText: String) async throws -> String {
        let boundary = UUID().uuidString
        guard let url = URL(string: "\(base)/api/health-docs/\(documentId)/pages") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        for (k, v) in authHeaders() { request.setValue(v, forHTTPHeaderField: k) }

        var body = Data()
        body.appendImagePart(boundary: boundary, name: "image", filename: "scan.jpg", contentType: "image/jpeg", data: imageData)
        body.appendFormField(boundary: boundary, name: "ocrText", value: ocrText)
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        let (responseData, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw URLError(URLError.Code(rawValue: code))
        }
        // Return the parent document id so the caller can refresh detail.
        if let dict = try? JSONSerialization.jsonObject(with: responseData) as? [String: Any],
           let id = dict["documentId"] as? String {
            return id
        }
        return documentId
    }

    /** Permanently deletes a document and all its pages. */
    func delete(documentId: String) async throws {
        guard let url = URL(string: "\(base)/api/health-docs/\(documentId)") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        for (k, v) in authHeaders() { request.setValue(v, forHTTPHeaderField: k) }

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw URLError(URLError.Code(rawValue: code))
        }
    }

    // MARK: - AI doctor chat

    func chat(message: String, sessionId: String) async throws -> String {
        guard let url = URL(string: "\(base)/api/health-docs/chat") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        for (k, v) in authHeaders() { request.setValue(v, forHTTPHeaderField: k) }
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "message": message,
            "sessionId": sessionId,
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            // Surface server error message (e.g. LLM balance) to the UI.
            if let err = try? JSONDecoder().decode(ChatResponse.self, from: data), let msg = err.error {
                throw NSError(domain: "DocumentsClient", code: (response as? HTTPURLResponse)?.statusCode ?? 0, userInfo: [NSLocalizedDescriptionKey: msg])
            }
            throw URLError(.badServerResponse)
        }
        let decoded = try JSONDecoder().decode(ChatResponse.self, from: data)
        return decoded.answer ?? "(no answer)"
    }

    func history(sessionId: String) async throws -> [ChatMessage] {
        guard let url = URL(string: "\(base)/api/health-docs/chat/history?sessionId=\(sessionId)") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        for (k, v) in authHeaders() { request.setValue(v, forHTTPHeaderField: k) }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(ChatHistory.self, from: data).messages
    }
}

private extension Data {
    mutating func appendFormField(boundary: String, name: String, value: String) {
        append("--\(boundary)\r\n".data(using: .utf8)!)
        append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
        append("\(value)\r\n".data(using: .utf8)!)
    }

    mutating func appendImagePart(boundary: String, name: String, filename: String, contentType: String, data: Data) {
        append("--\(boundary)\r\n".data(using: .utf8)!)
        append("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        append("Content-Type: \(contentType)\r\n\r\n".data(using: .utf8)!)
        append(data)
        append("\r\n".data(using: .utf8)!)
    }
}
