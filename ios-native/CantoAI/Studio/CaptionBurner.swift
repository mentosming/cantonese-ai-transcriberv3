import AVFoundation
import UIKit

/// Burns subtitles into a video using AVFoundation + Core Animation.
/// Supports per-cue show/hide with fade/pop/slide, social reframe (cover crop),
/// and optional background-music mixing. (Native counterpart of the web
/// renderTimeline/localRender path.)
enum CaptionBurner {

    /// Burn captions over the main video, optionally followed by extra video/
    /// image clips on the timeline. Captions cover the main-video portion.
    static func burn(
        videoURL: URL,
        extraClips: [TimelineClip] = [],
        overlays: [StudioOverlay] = [],
        cues: [Cue],
        style: CaptionStyle,
        aspect: OutputAspect,
        bilingual: Bool,
        bgmURL: URL?,
        bgmVolume: Float,
        voiceoverURL: URL? = nil,
        muteOriginal: Bool = false,
        trimStart: Double = 0,
        trimEnd: Double = 0,   // 0 = to the end
        progress: @escaping (Double) -> Void
    ) async throws -> URL {
        // Main video display size decides the base render size.
        let mainAsset = AVURLAsset(url: videoURL)
        guard let mainTrack = try await mainAsset.loadTracks(withMediaType: .video).first else {
            throw NSError(domain: "burn", code: 0, userInfo: [NSLocalizedDescriptionKey: "影片冇視訊軌"])
        }
        let mainNatural = try await mainTrack.load(.naturalSize)
        let mainPreferred = try await mainTrack.load(.preferredTransform)
        let mainDisp = mainNatural.applying(mainPreferred)
        let srcSize = CGSize(width: abs(mainDisp.width), height: abs(mainDisp.height))
        let renderSize = aspect.isReframe ? aspect.size(for: srcSize) : srcSize

        let comp = AVMutableComposition()
        let cVideo = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
        let cAudio = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!

        // Insert main video first, then each extra clip; collect per-clip
        // transforms so each segment cover-fits the render size.
        var cursor: CMTime = .zero
        var transforms: [(CMTime, CGAffineTransform)] = []

        func appendVideo(_ url: URL) async throws {
            let asset = AVURLAsset(url: url)
            guard let vt = try await asset.loadTracks(withMediaType: .video).first else { return }
            let dur = try await asset.load(.duration)
            let natural = try await vt.load(.naturalSize)
            let preferred = try await vt.load(.preferredTransform)
            try cVideo.insertTimeRange(CMTimeRange(start: .zero, duration: dur), of: vt, at: cursor)
            if let at = try await asset.loadTracks(withMediaType: .audio).first {
                try? cAudio.insertTimeRange(CMTimeRange(start: .zero, duration: dur), of: at, at: cursor)
            } else {
                cAudio.insertEmptyTimeRange(CMTimeRange(start: cursor, duration: dur))
            }
            transforms.append((cursor, coverTransform(natural: natural, preferred: preferred, render: renderSize)))
            cursor = cursor + dur
        }

        // Main video, with optional trim [trimStart, trimEnd].
        let mainDur = try await mainAsset.load(.duration)
        let tStart = CMTime(seconds: max(0, trimStart), preferredTimescale: 600)
        let tEnd = trimEnd > 0 ? CMTime(seconds: trimEnd, preferredTimescale: 600) : mainDur
        let mainRange = CMTimeRange(start: tStart, duration: max(.zero, min(mainDur, tEnd) - tStart))
        try cVideo.insertTimeRange(mainRange, of: mainTrack, at: cursor)
        if let at = try await mainAsset.loadTracks(withMediaType: .audio).first {
            try? cAudio.insertTimeRange(mainRange, of: at, at: cursor)
        } else {
            cAudio.insertEmptyTimeRange(CMTimeRange(start: cursor, duration: mainRange.duration))
        }
        transforms.append((cursor, coverTransform(natural: mainNatural, preferred: mainPreferred, render: renderSize)))
        cursor = cursor + mainRange.duration

        for clip in extraClips {
            switch clip.kind {
            case .video:
                try await appendVideo(clip.url)
            case .image:
                if let img = UIImage(contentsOfFile: clip.url.path) {
                    let segURL = try await ImageVideoMaker.make(image: img, size: renderSize, seconds: clip.duration)
                    try await appendVideo(segURL)  // already render-sized → identity-ish cover
                }
            }
        }
        let totalDuration = cursor
        var mixParams: [AVMutableAudioMixInputParameters] = []

        // Mute the original audio when a voiceover replaces it.
        if muteOriginal {
            let p = AVMutableAudioMixInputParameters(track: cAudio)
            p.setVolume(0, at: .zero)
            mixParams.append(p)
        }

        // Voiceover/narration: full-volume main voice from the start.
        if let voiceoverURL {
            let vAsset = AVURLAsset(url: voiceoverURL)
            if let vTrack = try await vAsset.loadTracks(withMediaType: .audio).first {
                let cVoice = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
                let vDur = try await vAsset.load(.duration)
                try? cVoice.insertTimeRange(CMTimeRange(start: .zero, duration: min(vDur, totalDuration)), of: vTrack, at: .zero)
            }
        }

        // Optional background music (looped), lower volume.
        if let bgmURL {
            let bgmAsset = AVURLAsset(url: bgmURL)
            if let bgmTrack = try await bgmAsset.loadTracks(withMediaType: .audio).first {
                let cBgm = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
                let bgmDur = try await bgmAsset.load(.duration)
                var at: CMTime = .zero
                while at < totalDuration {
                    let chunk = min(bgmDur, totalDuration - at)
                    try? cBgm.insertTimeRange(CMTimeRange(start: .zero, duration: chunk), of: bgmTrack, at: at)
                    at = at + chunk
                }
                let p = AVMutableAudioMixInputParameters(track: cBgm)
                p.setVolume(max(0, min(1, bgmVolume)), at: .zero)
                mixParams.append(p)
            }
        }
        var audioMix: AVMutableAudioMix?
        if !mixParams.isEmpty { let m = AVMutableAudioMix(); m.inputParameters = mixParams; audioMix = m }

        let videoComposition = AVMutableVideoComposition()
        videoComposition.renderSize = renderSize
        videoComposition.frameDuration = CMTime(value: 1, timescale: 30)

        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: totalDuration)
        let layerInstr = AVMutableVideoCompositionLayerInstruction(assetTrack: cVideo)
        for (t, tf) in transforms { layerInstr.setTransform(tf, at: t) }
        var layerInstructions: [AVMutableVideoCompositionLayerInstruction] = [layerInstr]

        // VIDEO overlays → extra composition video tracks placed into the PiP rect
        // for their time window (the track only has content during the window).
        for o in overlays where o.kind == .video {
            let oa = AVURLAsset(url: o.url)
            guard let ot = try await oa.loadTracks(withMediaType: .video).first else { continue }
            let oDur = try await oa.load(.duration)
            let start = CMTime(seconds: o.start, preferredTimescale: 600)
            let winEnd = o.end > 0 ? CMTime(seconds: o.end, preferredTimescale: 600) : totalDuration
            let span = min(oDur, max(.zero, winEnd - start))
            if span <= .zero { continue }
            let oTrack = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
            try? oTrack.insertTimeRange(CMTimeRange(start: .zero, duration: span), of: ot, at: start)
            let oNat = try await ot.load(.naturalSize)
            let oPref = try await ot.load(.preferredTransform)
            let rect = overlayRectTL(o, renderSize.width, renderSize.height)
            let disp = oNat.applying(oPref)
            let scale = rect.width / max(1, abs(disp.width))
            let tf = oPref.concatenating(CGAffineTransform(scaleX: scale, y: scale))
                .concatenating(CGAffineTransform(translationX: rect.minX, y: rect.minY))
            let li = AVMutableVideoCompositionLayerInstruction(assetTrack: oTrack)
            li.setTransform(tf, at: start)
            layerInstructions.append(li)
        }

        instruction.layerInstructions = layerInstructions
        videoComposition.instructions = [instruction]

        let duration = totalDuration

        // Core Animation overlay with per-cue text layers.
        let parent = CALayer(); parent.frame = CGRect(origin: .zero, size: renderSize)
        let videoLayer = CALayer(); videoLayer.frame = parent.frame
        let overlay = CALayer(); overlay.frame = parent.frame
        parent.addSublayer(videoLayer); parent.addSublayer(overlay)

        let total = CMTimeGetSeconds(duration)

        // IMAGE overlays → CALayers (Core Animation uses a bottom-left origin, so
        // flip Y), shown during their time window via an opacity keyframe.
        for o in overlays where o.kind == .image {
            guard let img = UIImage(contentsOfFile: o.url.path)?.cgImage else { continue }
            let rect = overlayRectTL(o, renderSize.width, renderSize.height)
            let layer = CALayer()
            layer.frame = CGRect(x: rect.minX, y: renderSize.height - rect.minY - rect.height,
                                 width: rect.width, height: rect.height)
            layer.contents = img
            layer.contentsGravity = .resizeAspectFill
            layer.masksToBounds = true
            layer.cornerRadius = 4
            let start = max(0.0001, o.start)
            let end = o.end > 0 ? o.end : total
            let win = CAKeyframeAnimation(keyPath: "opacity")
            win.values = [0, 1, 1, 0]
            win.keyTimes = [0, NSNumber(value: start / total), NSNumber(value: min(0.999, end / total)), 1]
            win.beginTime = AVCoreAnimationBeginTimeAtZero
            win.duration = total
            win.isRemovedOnCompletion = false
            win.fillMode = .forwards
            layer.opacity = 0
            layer.add(win, forKey: "win")
            overlay.addSublayer(layer)
        }

        for cue in cues {
            overlay.addSublayer(makeCueLayer(cue: cue, style: style, bilingual: bilingual,
                                             render: renderSize, total: total))
        }
        videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(
            postProcessingAsVideoLayer: videoLayer, in: parent)

        // Export.
        guard let export = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetHighestQuality) else {
            throw NSError(domain: "burn", code: 1, userInfo: [NSLocalizedDescriptionKey: "無法建立輸出"])
        }
        let dest = FileManager.default.temporaryDirectory.appendingPathComponent("subtitled-\(UUID().uuidString).mp4")
        export.outputURL = dest
        export.outputFileType = .mp4
        export.videoComposition = videoComposition
        if let audioMix { export.audioMix = audioMix }

        let ticker = Task { while !Task.isCancelled { progress(Double(export.progress)); try? await Task.sleep(nanoseconds: 200_000_000) } }
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            export.exportAsynchronously { cont.resume() }
        }
        ticker.cancel()
        guard export.status == .completed else {
            throw export.error ?? NSError(domain: "burn", code: 2, userInfo: [NSLocalizedDescriptionKey: "輸出失敗"])
        }
        progress(1)
        return dest
    }

    // Scale video to COVER the render size (center-crop) for social reframe.
    private static func coverTransform(natural: CGSize, preferred: CGAffineTransform, render: CGSize) -> CGAffineTransform {
        let disp = natural.applying(preferred)
        let w = abs(disp.width), h = abs(disp.height)
        let scale = max(render.width / w, render.height / h)
        let scaledW = w * scale, scaledH = h * scale
        let tx = (render.width - scaledW) / 2
        let ty = (render.height - scaledH) / 2
        return preferred.concatenating(CGAffineTransform(scaleX: scale, y: scale))
            .concatenating(CGAffineTransform(translationX: tx, y: ty))
    }

    // One cue → a CATextLayer that appears during [start,end] with animation.
    private static func makeCueLayer(cue: Cue, style: CaptionStyle, bilingual: Bool,
                                     render: CGSize, total: Double) -> CALayer {
        let fontSize = render.height * style.fontFraction
        let container = CALayer()
        container.frame = CGRect(origin: .zero, size: render)
        container.opacity = 0

        let text = CATextLayer()
        text.string = attributed(cue, style: style, bilingual: bilingual, fontSize: fontSize, width: render.width)
        text.isWrapped = true
        text.alignmentMode = .center
        text.contentsScale = UIScreen.main.scale
        let boxW = render.width * 0.86
        let boxH = fontSize * (bilingual && cue.translation != nil ? 4.2 : 2.6)
        let y: CGFloat
        switch style.pos {
        case .top: y = render.height * 0.86
        case .middle: y = render.height * 0.5 - boxH / 2
        case .bottom: y = render.height * 0.08
        }
        text.frame = CGRect(x: (render.width - boxW) / 2, y: y, width: boxW, height: boxH)
        container.addSublayer(text)

        // Show/hide via opacity keyframes over the whole timeline.
        let begin = max(0.0001, cue.start)
        let dur = max(0.1, cue.end - cue.start)
        let appear = CAKeyframeAnimation(keyPath: "opacity")
        appear.values = [0, 1, 1, 0]
        let inT = min(0.12, dur * 0.25), outT = min(0.12, dur * 0.25)
        appear.keyTimes = [0, NSNumber(value: inT / dur), NSNumber(value: 1 - outT / dur), 1]
        appear.beginTime = AVCoreAnimationBeginTimeAtZero + begin
        appear.duration = dur
        appear.isRemovedOnCompletion = false
        appear.fillMode = .forwards
        container.add(appear, forKey: "show")

        // Entrance transform.
        if style.animation == .pop || cue.anim == "pop" {
            let pop = CAKeyframeAnimation(keyPath: "transform.scale")
            pop.values = [0.85, 1.0]; pop.keyTimes = [0, NSNumber(value: min(0.15, inT / dur))]
            pop.beginTime = AVCoreAnimationBeginTimeAtZero + begin; pop.duration = dur
            pop.isRemovedOnCompletion = false; pop.fillMode = .forwards
            text.add(pop, forKey: "pop")
        } else if style.animation == .slide || cue.anim == "slide" {
            let slide = CAKeyframeAnimation(keyPath: "transform.translation.y")
            slide.values = [render.height * 0.04, 0]; slide.keyTimes = [0, NSNumber(value: min(0.15, inT / dur))]
            slide.beginTime = AVCoreAnimationBeginTimeAtZero + begin; slide.duration = dur
            slide.isRemovedOnCompletion = false; slide.fillMode = .forwards
            text.add(slide, forKey: "slide")
        }
        return container
    }

    private static func attributed(_ cue: Cue, style: CaptionStyle, bilingual: Bool,
                                   fontSize: CGFloat, width: CGFloat) -> NSAttributedString {
        let para = NSMutableParagraphStyle(); para.alignment = .center
        let font = UIFont(name: style.fontName, size: fontSize) ?? .boldSystemFont(ofSize: fontSize)
        let base: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: UIColor(style.color),
            .strokeColor: UIColor(style.strokeColor),
            .strokeWidth: -fontSize * 0.14,   // negative = fill + stroke
            .paragraphStyle: para,
        ]
        let result = NSMutableAttributedString(string: cue.text, attributes: base)
        // Per-word emphasis: highlight key words (AI) in the highlight colour.
        if let words = cue.emphasis {
            let ns = cue.text as NSString
            for w in words where !w.isEmpty {
                var searchRange = NSRange(location: 0, length: ns.length)
                while searchRange.location < ns.length {
                    let found = ns.range(of: w, options: [], range: searchRange)
                    if found.location == NSNotFound { break }
                    result.addAttribute(.foregroundColor, value: UIColor(style.highlightColor), range: found)
                    searchRange = NSRange(location: found.location + found.length, length: ns.length - (found.location + found.length))
                }
            }
        }
        if bilingual, let t = cue.translation, !t.isEmpty {
            let sub: [NSAttributedString.Key: Any] = [
                .font: font.withSize(fontSize * 0.62),
                .foregroundColor: UIColor(style.color),
                .strokeColor: UIColor(style.strokeColor),
                .strokeWidth: -fontSize * 0.1,
                .paragraphStyle: para,
            ]
            result.append(NSAttributedString(string: "\n" + t, attributes: sub))
        }
        return result
    }
}
