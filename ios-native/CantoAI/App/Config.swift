import Foundation

/// App-wide configuration. Point `apiBase` at your deployed Express server
/// (the same one the web app uses). The iOS Simulator can reach your Mac's
/// localhost, but a real device cannot — use your LAN IP or deployed URL there.
enum Config {
    /// Base URL of the Gemini-proxy backend (server/ in the web repo).
    static let apiBase = URL(string: "https://cantonese-ai-transcriber-api.zeabur.app")!

    /// New signed-in users get this many free minutes (shared transcription + studio).
    static let freeStarterMinutes = 5

    /// Admin account (mirrors the web app).
    static let adminEmail = "km520daisy@gmail.com"

    /// RevenueCat public SDK key (iOS). Set yours here.
    static let revenueCatAPIKey = "appl_REPLACE_ME"

    /// Firestore named database id (matches the web app).
    static let firestoreDatabase = "cantonese-aitranscriber"
}
