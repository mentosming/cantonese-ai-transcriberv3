import Foundation

enum APIError: LocalizedError {
    case badStatus(Int, String)
    case invalidResponse
    case transcriptionStopped
    var errorDescription: String? {
        switch self {
        case .badStatus(_, let msg): return msg
        case .invalidResponse: return "伺服器回應無效"
        case .transcriptionStopped: return "已停止轉錄"
        }
    }
}

/// Thin client over the Express backend (same `/api/*` the web app uses).
struct APIClient {
    static let shared = APIClient()
    private let base = Config.apiBase

    // MARK: Streaming file transcription → /api/transcribe-file
    // Yields text chunks as they arrive. Resilient: a stream reset *after*
    // content has arrived is treated as success (mirrors the web client).
    func transcribeFile(
        fileURL: URL,
        settings: TranscriptionSettings,
        onChunk: @escaping (String) -> Void
    ) async throws {
        let boundary = "Boundary-\(UUID().uuidString)"
        var req = URLRequest(url: base.appendingPathComponent("/api/transcribe-file"))
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 600

        let settingsJSON = String(data: try JSONEncoder().encode(settings), encoding: .utf8) ?? "{}"
        let fileData = try Data(contentsOf: fileURL)
        let filename = fileURL.lastPathComponent
        let mime = Self.mimeType(for: fileURL)

        var body = Data()
        func append(_ s: String) { body.append(s.data(using: .utf8)!) }
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"settings\"\r\n\r\n\(settingsJSON)\r\n")
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n")
        append("Content-Type: \(mime)\r\n\r\n")
        body.append(fileData)
        append("\r\n--\(boundary)--\r\n")
        req.httpBody = body
        try await streamText(req, onChunk: onChunk)
    }

    // MARK: YouTube / remote URL transcription → /api/transcribe-url
    // Passes the URL straight to Gemini (Google processes the video) — no download.
    func transcribeURL(_ url: String, settings: TranscriptionSettings, onChunk: @escaping (String) -> Void) async throws {
        struct Body: Encodable { let url: String; let settings: TranscriptionSettings }
        var req = URLRequest(url: base.appendingPathComponent("/api/transcribe-url"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 600
        req.httpBody = try JSONEncoder().encode(Body(url: url, settings: settings))
        try await streamText(req, onChunk: onChunk)
    }

    // Shared streaming reader: text/plain chunks, resilient to a reset that
    // happens *after* content arrived (treated as success).
    private func streamText(_ req: URLRequest, onChunk: @escaping (String) -> Void) async throws {
        let (bytes, response) = try await URLSession.shared.bytes(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode != 200 {
            var msg = "轉錄失敗 (\(http.statusCode))"
            var raw = Data()
            for try await b in bytes { raw.append(b) }
            if let j = try? JSONSerialization.jsonObject(with: raw) as? [String: Any],
               let e = j["error"] as? String { msg = e }
            throw APIError.badStatus(http.statusCode, msg)
        }
        var receivedAny = false
        do {
            for try await line in bytes.lines {
                receivedAny = true
                onChunk(line + "\n")
            }
        } catch {
            if !receivedAny { throw error }
        }
    }

    // MARK: Text analysis → /api/analyze-text  (summary / translate / design / music)
    func analyze(prompt: String, system: String? = nil) async throws -> String {
        var req = URLRequest(url: base.appendingPathComponent("/api/analyze-text"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 120
        var payload: [String: Any] = ["prompt": prompt]
        if let system { payload["systemInstruction"] = system }
        req.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.badStatus((response as? HTTPURLResponse)?.statusCode ?? -1, "分析失敗")
        }
        let j = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return (j?["text"] as? String) ?? ""
    }

    // MARK: Music library → /api/music
    func musicLibrary() async throws -> [MusicTrack] {
        let url = base.appendingPathComponent("/api/music")
        let (data, _) = try await URLSession.shared.data(from: url)
        return try JSONDecoder().decode([MusicTrack].self, from: data)
    }
    func musicURL(id: String) -> URL { base.appendingPathComponent("/api/music/\(id)") }

    static func mimeType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "mp4", "m4v": return "video/mp4"
        case "mov": return "video/quicktime"
        case "wav": return "audio/wav"
        case "mp3": return "audio/mpeg"
        case "m4a": return "audio/mp4"
        case "aac": return "audio/aac"
        default: return "application/octet-stream"
        }
    }
}

struct MusicTrack: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let moods: [String]
}
