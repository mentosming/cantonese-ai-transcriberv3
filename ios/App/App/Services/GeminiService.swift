import Foundation

enum NetworkError: Error {
    case invalidURL
    case badResponse
    case serializationError
}

struct TranscribeSettings: Codable {
    var language: [String] = ["Cantonese", "English"]
    var enableTimestamps: Bool = true
    var numSpeakers: Int = 1
    var speakerNames: [String] = ["Speaker 1"]
    var summaryPercentage: Int = 80
    var customGoal: String = ""
}

class GeminiService {
    // Official Production API Endpoint (Vercel)
    private let baseURL = "https://cantonese-ai-transcriber-api.vercel.app"
    
    /// Transcribe local audio file with Real-time Streaming
    func transcribeAudioStream(fileURL: URL, fileName: String, settings: TranscribeSettings) -> AsyncStream<String> {
        AsyncStream { continuation in
            Task {
                let url = URL(string: "\(baseURL)/api/transcribe/transcribe-file")!
                var request = URLRequest(url: url)
                request.httpMethod = "POST"
                
                let boundary = "Boundary-\(UUID().uuidString)"
                request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
                
                do {
                    let fileData = try Data(contentsOf: fileURL)
                    var body = Data()
                    
                    // Add settings with custom goal & diarization info
                    if let settingsData = try? JSONEncoder().encode(settings),
                       let settingsString = String(data: settingsData, encoding: .utf8) {
                        body.append("--\(boundary)\r\n".data(using: .utf8)!)
                        body.append("Content-Disposition: form-data; name=\"settings\"\r\n\r\n".data(using: .utf8)!)
                        body.append("\(settingsString)\r\n".data(using: .utf8)!)
                    }
                    
                    // Add file
                    body.append("--\(boundary)\r\n".data(using: .utf8)!)
                    body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
                    body.append("Content-Type: audio/m4a\r\n\r\n".data(using: .utf8)!)
                    body.append(fileData)
                    body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
                    
                    request.httpBody = body
                    
                    let (bytes, response) = try await URLSession.shared.bytes(for: request)
                    
                    guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                        continuation.finish()
                        return
                    }
                    
                    // Decode stream chunks correctly for multi-byte UTF-8 Cantonese characters
                    var byteBuffer = Data()
                    for try await byte in bytes {
                        byteBuffer.append(byte)
                        if let validString = String(data: byteBuffer, encoding: .utf8) {
                            continuation.yield(validString)
                            byteBuffer.removeAll()
                        }
                    }
                    continuation.finish()
                    
                } catch {
                    print("Streaming error: \(error)")
                    continuation.finish()
                }
            }
        }
    }
    
    /// Transcribe YouTube URL with Real-time Streaming
    func transcribeYouTubeStream(url: String, settings: TranscribeSettings) -> AsyncStream<String> {
        AsyncStream { continuation in
            Task {
                let apiUrl = URL(string: "\(baseURL)/api/transcribe/transcribe-url")!
                var request = URLRequest(url: apiUrl)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                
                let payload: [String: Any] = [
                    "url": url,
                    "settings": [
                        "language": settings.language,
                        "enableTimestamps": settings.enableTimestamps,
                        "numSpeakers": settings.numSpeakers,
                        "speakerNames": settings.speakerNames,
                        "summaryPercentage": settings.summaryPercentage,
                        "customGoal": settings.customGoal
                    ]
                ]
                
                do {
                    request.httpBody = try JSONSerialization.data(withJSONObject: payload)
                    
                    let (bytes, response) = try await URLSession.shared.bytes(for: request)
                    
                    guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                        continuation.finish()
                        return
                    }
                    
                    var byteBuffer = Data()
                    for try await byte in bytes {
                        byteBuffer.append(byte)
                        if let validString = String(data: byteBuffer, encoding: .utf8) {
                            continuation.yield(validString)
                            byteBuffer.removeAll()
                        }
                    }
                    continuation.finish()
                    
                } catch {
                    print("YouTube Streaming error: \(error)")
                    continuation.finish()
                }
            }
        }
    }
    /// Analyze transcribed text with Real-time Streaming
    func analyzeTextStream(text: String, settings: TranscribeSettings) -> AsyncStream<String> {
        AsyncStream { continuation in
            Task {
                let url = URL(string: "\(baseURL)/api/transcribe/analyze-text")!
                var request = URLRequest(url: url)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                
                print("📡 [DEBUG] ANALYSIS REQ: \(url.absoluteString)")
                
                let payload: [String: Any] = [
                    "text": text,
                    "settings": [
                        "summaryPercentage": settings.summaryPercentage,
                        "customGoal": settings.customGoal
                    ]
                ]
                
                do {
                    request.httpBody = try JSONSerialization.data(withJSONObject: payload)
                    let (bytes, response) = try await URLSession.shared.bytes(for: request)
                    
                    guard let httpResponse = response as? HTTPURLResponse else {
                        print("❌ [DEBUG] Analysis: Invalid Response")
                        continuation.finish()
                        return
                    }
                    
                    print("📊 [DEBUG] Analysis Status: \(httpResponse.statusCode)")
                    
                    var byteBuffer = Data()
                    for try await byte in bytes {
                        byteBuffer.append(byte)
                        if let validString = String(data: byteBuffer, encoding: .utf8) {
                            continuation.yield(validString)
                            byteBuffer.removeAll()
                        }
                    }
                    print("✅ [DEBUG] Analysis Stream Finished")
                    continuation.finish()
                    
                } catch {
                    print("❌ [DEBUG] Analysis Error: \(error)")
                    continuation.finish()
                }
            }
        }
    }
}
