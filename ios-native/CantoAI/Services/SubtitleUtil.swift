import Foundation

/// Subtitle helpers ported from the web app's srtUtil.ts.
enum SubtitleUtil {

    static func parseTime(_ t: String) -> Double {
        let p = t.split(separator: ":").map { Double($0) ?? 0 }
        switch p.count {
        case 3: return p[0] * 3600 + p[1] * 60 + p[2]
        case 2: return p[0] * 60 + p[1]
        default: return 0
        }
    }

    static func clock(_ sec: Double) -> String {
        let s = max(0, Int(sec.rounded()))
        let h = s / 3600, m = (s % 3600) / 60, ss = s % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, ss) : String(format: "%02d:%02d", m, ss)
    }

    static func srtTime(_ sec: Double) -> String {
        let h = Int(sec) / 3600, m = (Int(sec) % 3600) / 60, s = Int(sec) % 60
        let ms = Int((sec.truncatingRemainder(dividingBy: 1)) * 1000)
        return String(format: "%02d:%02d:%02d,%03d", h, m, s, ms)
    }

    /// Parse "[MM:SS - MM:SS] Speaker: text" transcript lines into cues.
    static func transcriptToCues(_ text: String) -> [Cue] {
        let pattern = #"^\[(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?))?\]\s*(?:(.*?):)?\s*(.*)"#
        let re = try! NSRegularExpression(pattern: pattern)
        var cues: [Cue] = []
        for line in text.components(separatedBy: "\n") {
            let range = NSRange(line.startIndex..., in: line)
            guard let m = re.firstMatch(in: line, range: range) else { continue }
            func grp(_ i: Int) -> String? {
                guard m.range(at: i).location != NSNotFound,
                      let r = Range(m.range(at: i), in: line) else { return nil }
                return String(line[r])
            }
            let start = parseTime(grp(1) ?? "0")
            let end = grp(2).map(parseTime) ?? (start + 3)
            let content = (grp(4) ?? "").trimmingCharacters(in: .whitespaces)
            if content.isEmpty { continue }
            cues.append(Cue(start: start, end: end > start ? end : start + 3,
                            speaker: grp(3)?.trimmingCharacters(in: .whitespaces), text: content))
        }
        // Clamp overlaps.
        for i in 0..<max(0, cues.count - 1) where cues[i].end > cues[i + 1].start {
            cues[i].end = cues[i + 1].start
        }
        return cues
    }

    static func cuesToTranscript(_ cues: [Cue]) -> String {
        cues.map { c in
            let sp = c.speaker.map { " \($0):" } ?? ""
            return "[\(clock(c.start)) - \(clock(max(c.end, c.start + 1)))]\(sp) \(c.text)"
        }.joined(separator: "\n")
    }

    static func cuesToSRT(_ cues: [Cue], bilingual: Bool = false) -> String {
        cues.sorted { $0.start < $1.start }.enumerated().map { i, c in
            var text = c.text
            if bilingual, let t = c.translation { text += "\n" + t }
            return "\(i + 1)\n\(srtTime(c.start)) --> \(srtTime(max(c.end, c.start + 1)))\n\(text)\n"
        }.joined(separator: "\n")
    }

    static func cuesToVTT(_ cues: [Cue], bilingual: Bool = false) -> String {
        let body = cues.sorted { $0.start < $1.start }.enumerated().map { i, c -> String in
            var text = c.text
            if bilingual, let t = c.translation { text += "\n" + t }
            let a = srtTime(c.start).replacingOccurrences(of: ",", with: ".")
            let b = srtTime(max(c.end, c.start + 1)).replacingOccurrences(of: ",", with: ".")
            return "\(i + 1)\n\(a) --> \(b)\n\(text)\n"
        }.joined(separator: "\n")
        return "WEBVTT\n\n" + body
    }

    static func cuesToText(_ cues: [Cue], bilingual: Bool = false) -> String {
        cues.sorted { $0.start < $1.start }.map { c in
            (bilingual && c.translation != nil) ? "\(c.text)\n\(c.translation!)" : c.text
        }.joined(separator: "\n")
    }

    /// Split long cues into short one-line subtitle cues (≈ splitForSubtitles).
    static func splitForSubtitles(_ cues: [Cue], maxChars: Int = 16) -> [Cue] {
        var out: [Cue] = []
        let breaks = CharacterSet(charactersIn: "。！？!?，,；;、…")
        for c in cues {
            let text = c.text.trimmingCharacters(in: .whitespaces)
            if text.isEmpty || (text.first == "[" && text.last == "]") { continue }
            let dur = max(0.3, c.end - c.start)
            // Split after punctuation.
            var pieces: [String] = []
            var current = ""
            for ch in text {
                current.append(ch)
                if String(ch).rangeOfCharacter(from: breaks) != nil { pieces.append(current); current = "" }
            }
            if !current.isEmpty { pieces.append(current) }
            // Hard-wrap long pieces.
            var wrapped: [String] = []
            for p in pieces {
                let t = p.trimmingCharacters(in: .whitespaces)
                if t.isEmpty { continue }
                if t.count <= maxChars { wrapped.append(t); continue }
                var idx = t.startIndex
                while idx < t.endIndex {
                    let end = t.index(idx, offsetBy: maxChars, limitedBy: t.endIndex) ?? t.endIndex
                    wrapped.append(String(t[idx..<end]).trimmingCharacters(in: .whitespaces))
                    idx = end
                }
            }
            if wrapped.isEmpty { wrapped = [text] }
            let totalLen = max(1, wrapped.reduce(0) { $0 + $1.count })
            var t = c.start
            for (i, p) in wrapped.enumerated() {
                let d = i == wrapped.count - 1 ? c.end - t : dur * Double(p.count) / Double(totalLen)
                out.append(Cue(start: t, end: t + d, speaker: c.speaker, text: p))
                t += d
            }
        }
        return out
    }
}
