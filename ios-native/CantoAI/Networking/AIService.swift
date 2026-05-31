import Foundation

/// AI features over /api/analyze-text (mirrors geminiService.ts). Token-light:
/// every call sends compact text and returns small JSON/text.
struct AIService {
    static let shared = AIService()
    private let api = APIClient.shared

    // MARK: Summary
    func summary(_ text: String) async throws -> String {
        try await api.analyze(prompt: "請根據轉錄文字生成一份詳盡的「問答式摘要」。繁體中文輸出。內容：\n" + String(text.prefix(30000)))
    }

    // MARK: Multi-conversation merge analysis (mirrors analyzeCombinedTranscripts)
    func analyzeCombined(_ items: [(label: String, content: String)], goal: String?) async throws -> String {
        let combined = items.enumerated()
            .map { "### 對話 \($0.offset + 1)：\($0.element.label)\n\($0.element.content)" }
            .joined(separator: "\n\n---\n\n")
        let clipped = String(combined.prefix(120_000))
        let goalLine = (goal?.isEmpty == false) ? "\n使用者額外分析目標：\(goal!)\n" : ""
        let prompt = """
        以下是 \(items.count) 段獨立對話／逐字稿。請進行「跨對話綜合分析」，用繁體中文（香港風格）輸出：
        1. **整體摘要**：橫跨所有對話的重點。
        2. **共同主題與分歧**：各段之間的關聯、重複主題、立場差異。
        3. **時間線／脈絡**：若有先後關係，整理事件發展。
        4. **重點問答 (Q&A)**：彙整關鍵問題與答案。
        5. **行動項目／待跟進**（如適用）。\(goalLine)
        內容如下：

        \(clipped)
        """
        return try await api.analyze(prompt: prompt)
    }

    // MARK: Translate cues (batched, order-preserving)
    func translate(_ texts: [String], to label: String) async throws -> [String] {
        var out = Array(repeating: "", count: texts.count)
        let chunk = 80
        var off = 0
        while off < texts.count {
            let part = Array(texts[off..<min(off + chunk, texts.count)])
            let list = part.enumerated().map { "\($0.offset)|\($0.element)" }.joined(separator: "\n")
            let prompt = "將以下每行字幕翻譯做\(label)。每行獨立、唔好合併。只回覆 JSON 字串陣列，數量同順序一致：[\"...\"]\n字幕：\n\(list)"
            if let raw = try? await api.analyze(prompt: prompt, system: "你只會輸出有效 JSON 陣列。"),
               let arr = Self.jsonArray(raw) as? [Any] {
                for (i, v) in arr.enumerated() where off + i < out.count { out[off + i] = "\(v)" }
            }
            off += chunk
        }
        return out
    }

    // MARK: Caption design (whole-video look)
    struct CaptionDesign { let template, fontId, sizeId, color, strokeColor, pos, animation, rationale: String }
    func designStyle(_ sample: String) async throws -> CaptionDesign {
        let prompt = """
        你係專業影片字幕設計師。根據字幕嘅題材語氣設計風格。只回覆 JSON：
        {"template":"classic|news|cinema|tiktok|karaoke","fontId":"sans|serif|round|hand","sizeId":"s|m|l|xl","color":"#RRGGBB","strokeColor":"#RRGGBB","pos":"top|middle|bottom","animation":"none|fade|pop|slide","rationale":"一句中文"}
        字幕內容：\n\(String(sample.prefix(4000)))
        """
        let raw = try await api.analyze(prompt: prompt, system: "你只會輸出有效 JSON。")
        let d = Self.jsonObject(raw)
        func s(_ k: String, _ def: String) -> String { (d?[k] as? String) ?? def }
        return CaptionDesign(template: s("template", "classic"), fontId: s("fontId", "sans"),
                             sizeId: s("sizeId", "m"), color: s("color", "#FFFFFF"),
                             strokeColor: s("strokeColor", "#000000"), pos: s("pos", "bottom"),
                             animation: s("animation", "fade"), rationale: s("rationale", "已根據內容調整"))
    }

    // MARK: Per-cue animation + emphasis
    struct CueAnim { let i: Int; let anim: String; let emph: [String] }
    func designCueAnimations(_ texts: [String]) async throws -> [CueAnim] {
        let list = texts.prefix(150).enumerated().map { "\($0.offset)|\($0.element)" }.joined(separator: "\n")
        let prompt = """
        你係短影片字幕動畫師。每行格式 索引|字幕。揀出值得加強嘅句子設計入場動畫，標出最多 2 個重點詞。
        只回覆 JSON 陣列：[{"i":number,"anim":"none|fade|pop|slide","emph":["詞"]}]
        字幕：\n\(list)
        """
        let raw = try await api.analyze(prompt: prompt, system: "你只會輸出有效 JSON 陣列。")
        guard let arr = Self.jsonArray(raw) as? [[String: Any]] else { return [] }
        return arr.compactMap { o in
            guard let i = o["i"] as? Int else { return nil }
            let anim = (o["anim"] as? String) ?? "pop"
            let emph = (o["emph"] as? [Any])?.prefix(2).map { "\($0)" } ?? []
            return CueAnim(i: i, anim: anim, emph: Array(emph))
        }
    }

    // MARK: AI music pick
    func pickMusic(sample: String, tracks: [MusicTrack]) async throws -> (id: String, reason: String) {
        let list = tracks.map { "\($0.id): \($0.title) [\($0.moods.joined(separator: "/"))]" }.joined(separator: "\n")
        let prompt = "根據影片字幕氛圍喺清單揀一首背景音樂。只回覆 JSON：{\"id\":\"...\",\"reason\":\"一句中文\"}\n清單：\n\(list)\n字幕：\n\(String(sample.prefix(1500)))"
        let raw = try await api.analyze(prompt: prompt, system: "你只會輸出有效 JSON。")
        let d = Self.jsonObject(raw)
        let id = (d?["id"] as? String).flatMap { id in tracks.contains { $0.id == id } ? id : nil } ?? tracks.first?.id ?? ""
        return (id, (d?["reason"] as? String) ?? "已根據內容氛圍配樂")
    }

    // MARK: JSON helpers (tolerant of surrounding prose)
    private static func jsonObject(_ raw: String) -> [String: Any]? {
        guard let s = raw.firstIndex(of: "{"), let e = raw.lastIndex(of: "}") else { return nil }
        let slice = String(raw[s...e])
        return (try? JSONSerialization.jsonObject(with: Data(slice.utf8))) as? [String: Any]
    }
    private static func jsonArray(_ raw: String) -> Any? {
        guard let s = raw.firstIndex(of: "["), let e = raw.lastIndex(of: "]") else { return nil }
        let slice = String(raw[s...e])
        return try? JSONSerialization.jsonObject(with: Data(slice.utf8))
    }
}
