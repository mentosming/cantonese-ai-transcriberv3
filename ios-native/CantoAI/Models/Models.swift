import Foundation

// MARK: - Transcription settings (mirrors web types.ts TranscriptionSettings)

struct TranscriptionSettings: Codable {
    var language: [String] = ["yue"]
    var enableDiarization: Bool = false
    var speakers: [Speaker] = []
    var enableTimestamps: Bool = true
    var startTime: String = "00:00"
    var customPrompt: String? = nil
    var model: String? = Engine.defaultModel
    var subtitleMode: Bool? = nil
}

struct Speaker: Codable, Identifiable, Hashable {
    var id: String
    var name: String
}

/// Vendor-neutral engines (mirrors constants.ts MODELS).
enum Engine {
    static let defaultModel = "gemini-3.5-flash"
    static let all: [(id: String, name: String)] = [
        ("gemini-3.5-flash", "高速引擎"),
        ("gemini-pro-latest", "高準確引擎"),
    ]
    static let proModel = "gemini-pro-latest"
}

struct Language: Identifiable, Hashable {
    let id: String
    let name: String
    static let all: [Language] = [
        .init(id: "yue", name: "廣東話 (Cantonese)"),
        .init(id: "zh-TW", name: "國語 (繁體中文)"),
        .init(id: "zh-CN", name: "普通話 (简体中文)"),
        .init(id: "en", name: "English"),
        .init(id: "ja", name: "日本語"),
        .init(id: "ko", name: "한국어"),
    ]
}

// MARK: - Subtitle cue (mirrors srtUtil.ts Cue)

struct Cue: Identifiable, Hashable, Codable {
    var id = UUID()
    var start: Double          // seconds
    var end: Double            // seconds
    var speaker: String? = nil
    var text: String
    var anim: String? = nil    // none|fade|pop|slide
    var emphasis: [String]? = nil
    var translation: String? = nil
}

// MARK: - Billing (mirrors types.ts UserProfile)

enum PlanId: String, Codable { case free, payg, monthly }
enum SubscriptionStatus: String, Codable { case none, active, past_due, canceled, expired }

struct UserProfile: Codable {
    var uid: String
    var email: String?
    var plan: PlanId = .free
    var creditMinutes: Int = 0
    var subscriptionStatus: SubscriptionStatus = .none
    var subscriptionRenewsAt: Double? = nil
    var isAdmin: Bool = false
}

struct EntitlementCheck {
    var allowed: Bool
    var remainingMinutes: Int
    var message: String?
}

// MARK: - Usage history (mirrors adminService.ts UsageLog)

struct UsageLog: Identifiable, Codable {
    var id: String
    var fileName: String
    var durationMinutes: Int
    var model: String?
    var charCount: Int
    var preview: String
    var createdAt: Double
}
