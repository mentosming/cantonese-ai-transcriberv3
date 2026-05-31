import Foundation
import AVFoundation
import SwiftUI
import UIKit

@MainActor
final class StudioViewModel: ObservableObject {
    @Published var videoURL: URL?
    @Published var extraClips: [TimelineClip] = []
    @Published var overlays: [StudioOverlay] = []
    @Published var voiceover: URL?
    @Published var muteOriginal = true
    @Published var duration: Double = 0
    @Published var trimStart: Double = 0
    @Published var trimEnd: Double = 0   // 0 = to the end
    @Published var cues: [Cue] = []
    @Published var style = CaptionStyle()
    @Published var aspect: OutputAspect = .original
    @Published var bilingual = false
    @Published var bgmURL: URL?
    @Published var bgmVolume: Float = 0.25
    @Published var musicLib: [MusicTrack] = []

    @Published var status = ""
    @Published var busy = false
    @Published var error: String?
    @Published var note: String?
    @Published var exportURL: URL?

    private let ai = AIService.shared

    func setVideo(_ url: URL) {
        videoURL = url; cues = []; trimStart = 0; trimEnd = 0; duration = 0
        Task {
            if let d = try? await AVURLAsset(url: url).load(.duration) {
                let s = CMTimeGetSeconds(d); if s.isFinite { duration = s }
            }
        }
    }

    // MARK: Timeline clips
    func addVideoClip(_ url: URL) {
        let dur = TranscriptionViewModel.billableMinutes(for: url) // rough; replaced below
        let seconds = CMTimeGetSeconds(AVURLAsset(url: url).duration)
        extraClips.append(TimelineClip(kind: .video, url: url, name: url.lastPathComponent,
                                       duration: seconds.isFinite && seconds > 0 ? seconds : Double(dur * 60)))
    }
    func addImageClip(_ url: URL) {
        extraClips.append(TimelineClip(kind: .image, url: url, name: url.lastPathComponent, duration: 3))
    }
    func removeClip(_ id: UUID) { extraClips.removeAll { $0.id == id } }

    // MARK: Overlay (PiP) layers
    func addOverlay(url: URL, kind: StudioOverlay.Kind) async {
        guard overlays.count < 2 else { return }
        var nat = CGSize(width: 1280, height: 720)
        if kind == .video {
            if let t = try? await AVURLAsset(url: url).loadTracks(withMediaType: .video).first,
               let size = try? await t.load(.naturalSize) { nat = size }
        } else if let img = UIImage(contentsOfFile: url.path) {
            nat = img.size
        }
        overlays.append(StudioOverlay(kind: kind, url: url, natSize: nat, pos: "br", size: 0.3))
    }
    func removeOverlay(_ id: UUID) { overlays.removeAll { $0.id == id } }
    func updateOverlay(_ id: UUID, _ patch: (inout StudioOverlay) -> Void) {
        guard let i = overlays.firstIndex(where: { $0.id == id }) else { return }
        patch(&overlays[i])
    }
    func moveClip(_ id: UUID, by offset: Int) {
        guard let i = extraClips.firstIndex(where: { $0.id == id }) else { return }
        let j = i + offset
        guard j >= 0, j < extraClips.count else { return }
        extraClips.swapAt(i, j)
    }
    func setImageDuration(_ id: UUID, _ seconds: Double) {
        guard let i = extraClips.firstIndex(where: { $0.id == id }) else { return }
        extraClips[i].duration = max(0.5, seconds)
    }

    // MARK: Generate subtitles (extract audio → transcribe subtitleMode → split)
    func generate(model: String, language: String) async {
        guard let videoURL else { return }
        busy = true; error = nil; status = voiceover != nil ? "處理旁白音軌中…" : "抽取音軌中…"
        do {
            // Subtitles come from the voiceover when one is imported.
            let audio = try await AudioExtractor.extractM4A(from: voiceover ?? videoURL)
            status = "AI 轉錄中…"
            var settings = TranscriptionSettings()
            settings.language = [language]; settings.model = model
            settings.subtitleMode = true; settings.enableTimestamps = true; settings.enableDiarization = false
            var text = ""
            try await APIClient.shared.transcribeFile(fileURL: audio, settings: settings) { chunk in
                Task { @MainActor in text += chunk }
            }
            cues = SubtitleUtil.splitForSubtitles(SubtitleUtil.transcriptToCues(text))
        } catch { self.error = error.localizedDescription }
        busy = false; status = ""
    }

    // MARK: AI — whole-video design
    func aiDesign() async {
        guard !cues.isEmpty else { error = "未有字幕"; return }
        busy = true; error = nil
        do {
            let d = try await ai.designStyle(cues.prefix(80).map(\.text).joined(separator: " "))
            if let f = CaptionStyle.fonts.first(where: { $0.id == d.fontId }) { style.fontName = f.font }
            if let s = CaptionStyle.sizes.first(where: { $0.id == d.sizeId }) { style.fontFraction = s.f }
            style.color = Color(hexString: d.color) ?? .white
            style.strokeColor = Color(hexString: d.strokeColor) ?? .black
            style.pos = CaptionStyle.Pos(rawValue: d.pos) ?? .bottom
            style.animation = CaptionStyle.Anim(rawValue: d.animation) ?? .fade
            note = d.rationale
        } catch { self.error = error.localizedDescription }
        busy = false
    }

    // MARK: AI — per-cue animation + emphasis
    func aiCueAnimations() async {
        guard !cues.isEmpty else { error = "未有字幕"; return }
        busy = true; error = nil
        do {
            let arr = try await ai.designCueAnimations(cues.map(\.text))
            let map = Dictionary(uniqueKeysWithValues: arr.map { ($0.i, $0) })
            for i in cues.indices {
                cues[i].anim = map[i]?.anim
                cues[i].emphasis = map[i]?.emph
            }
            note = "已為 \(arr.count) 句加動畫 / 重點字"
        } catch { self.error = error.localizedDescription }
        busy = false
    }

    // MARK: AI — translate (bilingual)
    func translate(to label: String) async {
        guard !cues.isEmpty else { error = "未有字幕"; return }
        busy = true; error = nil; status = "翻譯中…"
        do {
            let arr = try await ai.translate(cues.map(\.text), to: label)
            for i in cues.indices where i < arr.count { cues[i].translation = arr[i] }
            bilingual = true
        } catch { self.error = error.localizedDescription }
        busy = false; status = ""
    }

    // MARK: Music
    func loadMusic() async { musicLib = (try? await APIClient.shared.musicLibrary()) ?? [] }
    func aiMusic() async {
        guard !cues.isEmpty else { error = "未有字幕"; return }
        busy = true; error = nil
        do {
            await loadMusic()
            let pick = try await ai.pickMusic(sample: cues.prefix(60).map(\.text).joined(separator: " "), tracks: musicLib)
            try await useMusic(id: pick.id)
            note = "配樂：\(musicLib.first { $0.id == pick.id }?.title ?? "") — \(pick.reason)"
        } catch { self.error = error.localizedDescription }
        busy = false
    }
    func useMusic(id: String) async throws {
        let (data, _) = try await URLSession.shared.data(from: APIClient.shared.musicURL(id: id))
        let dest = FileManager.default.temporaryDirectory.appendingPathComponent("bgm-\(id).mp3")
        try data.write(to: dest); bgmURL = dest
    }

    // MARK: Export (burn into MP4)
    func export() async {
        guard let videoURL, !cues.isEmpty else { error = "未有影片或字幕"; return }
        busy = true; error = nil; status = "輸出中…"
        do {
            // Shift/clip cues to the trimmed range when the main video is trimmed.
            let ts = trimStart
            let te = trimEnd > 0 ? trimEnd : .greatestFiniteMagnitude
            let outCues: [Cue] = (ts > 0 || trimEnd > 0)
                ? cues.compactMap { c in
                    if c.end <= ts || c.start >= te { return nil }
                    var nc = c
                    nc.start = max(0, c.start - ts)
                    nc.end = max(nc.start + 0.1, min(c.end, te) - ts)
                    return nc
                }
                : cues
            let url = try await CaptionBurner.burn(
                videoURL: videoURL, extraClips: extraClips, overlays: overlays, cues: outCues,
                style: style, aspect: aspect, bilingual: bilingual,
                bgmURL: bgmURL, bgmVolume: bgmVolume,
                voiceoverURL: voiceover, muteOriginal: voiceover != nil && muteOriginal,
                trimStart: trimStart, trimEnd: trimEnd
            ) { _ in }
            exportURL = url
        } catch { self.error = error.localizedDescription }
        busy = false; status = ""
    }

    func exportSubtitleFile(_ fmt: String) -> URL? {
        let body = fmt == "vtt" ? SubtitleUtil.cuesToVTT(cues, bilingual: bilingual)
                 : fmt == "txt" ? SubtitleUtil.cuesToText(cues, bilingual: bilingual)
                 : SubtitleUtil.cuesToSRT(cues, bilingual: bilingual)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("subtitles.\(fmt)")
        try? body.data(using: .utf8)?.write(to: url)
        return url
    }
}

extension Color {
    init?(hexString: String) {
        var s = hexString.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        self.init(hex: UInt(v))
    }
}
