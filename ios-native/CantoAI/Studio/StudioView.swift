import SwiftUI
import AVKit
import PhotosUI

struct StudioView: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    @StateObject private var vm = StudioViewModel()
    @StateObject private var player = PreviewPlayer()

    @State private var model = Engine.proModel
    @State private var language = "yue"
    @State private var pickerItem: PhotosPickerItem?
    @State private var clipVideoItem: PhotosPickerItem?
    @State private var clipImageItem: PhotosPickerItem?
    @State private var overlayVideoItem: PhotosPickerItem?
    @State private var overlayImageItem: PhotosPickerItem?
    @State private var showAudioImporter = false
    @State private var showVoiceImporter = false
    @State private var showShare = false
    @State private var shareURL: URL?
    @State private var showMusic = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    preview
                    if vm.videoURL == nil { picker } else { controls }
                    if let e = vm.error { Text(e).font(.caption).foregroundStyle(.red) }
                    if let n = vm.note { Label(n, systemImage: "sparkles").font(.caption).foregroundStyle(Theme.teal) }
                }
                .padding(16)
            }
            .background(Theme.studioBg.ignoresSafeArea())
            .preferredColorScheme(.dark)
            .navigationTitle("影片工作室").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("關閉") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { Task { await exportVideo() } } label: {
                        if vm.busy && !vm.status.isEmpty { Text(vm.status) } else { Label("匯出 MP4", systemImage: "square.and.arrow.down") }
                    }.disabled(vm.cues.isEmpty || vm.busy)
                }
            }
            .sheet(isPresented: $showShare) { if let u = shareURL { ShareSheet(items: [u]) } }
            .onChange(of: pickerItem) { _ in Task { await loadVideo() } }
            .onChange(of: clipVideoItem) { _ in Task { await loadClip(clipVideoItem, image: false) } }
            .onChange(of: clipImageItem) { _ in Task { await loadClip(clipImageItem, image: true) } }
            .onChange(of: overlayVideoItem) { _ in Task { await loadOverlay(overlayVideoItem, image: false) } }
            .onChange(of: overlayImageItem) { _ in Task { await loadOverlay(overlayImageItem, image: true) } }
            .fileImporter(isPresented: $showAudioImporter, allowedContentTypes: [.audio, .mp3, .wav, .mpeg4Audio]) { result in
                if case .success(let url) = result { vm.bgmURL = HomeView.stableCopy(url) }
            }
            .fileImporter(isPresented: $showVoiceImporter, allowedContentTypes: [.audio, .mp3, .wav, .mpeg4Audio]) { result in
                if case .success(let url) = result { vm.voiceover = HomeView.stableCopy(url) }
            }
        }
    }

    // MARK: Preview with live caption overlay
    private var preview: some View {
        ZStack {
            if let url = vm.videoURL {
                PlayerLayerView(player: player.avPlayer)
                    .aspectRatio(aspectRatio, contentMode: .fit)
                    .onAppear { player.load(url) }
                    .overlay { GeometryReader { geo in overlayPreview(in: geo.size) } }
                if let cue = activeCue {
                    CaptionOverlay(cue: cue, style: vm.style, bilingual: vm.bilingual)
                }
            } else {
                RoundedRectangle(cornerRadius: 12).fill(.black.opacity(0.4))
                    .aspectRatio(16/9, contentMode: .fit)
                    .overlay(Image(systemName: "film").font(.largeTitle).foregroundStyle(.white.opacity(0.3)))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(alignment: .bottom) {
            if vm.videoURL != nil {
                Button { player.toggle() } label: {
                    Image(systemName: player.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.largeTitle).foregroundStyle(.white).shadow(radius: 4)
                }.padding(8)
            }
        }
    }

    private var picker: some View {
        PhotosPicker(selection: $pickerItem, matching: .videos) {
            VStack(spacing: 10) {
                Image(systemName: "square.and.arrow.up").font(.largeTitle)
                Text("揀影片開始")
            }.foregroundStyle(.white.opacity(0.6)).frame(maxWidth: .infinity).frame(height: 120)
            .background(.white.opacity(0.05)).clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: Controls
    private var controls: some View {
        VStack(spacing: 16) {
            // Generate
            DarkCard {
                HStack {
                    Picker("引擎", selection: $model) { ForEach(Engine.all, id: \.id) { Text($0.name).tag($0.id) } }
                    Picker("語言", selection: $language) { ForEach(Language.all) { Text($0.name).tag($0.id) } }
                }.tint(Theme.teal).font(.caption)
                Button { Task { await vm.generate(model: model, language: language) } } label: {
                    HStack { if vm.busy { ProgressView().tint(.white) } else { Image(systemName: "sparkles") }
                        Text(vm.busy ? (vm.status.isEmpty ? "生成中…" : vm.status) : (vm.cues.isEmpty ? "自動生成字幕" : "重新生成")) }
                        .frame(maxWidth: .infinity).frame(height: 40)
                        .background(Theme.teal).foregroundStyle(.white).clipShape(RoundedRectangle(cornerRadius: 10))
                }.disabled(vm.busy)
            }

            if !vm.cues.isEmpty {
                aiPanel
                stylePanel
                aspectPanel
                trimPanel
                overlayPanel
                voiceoverPanel
                mediaLibraryPanel
                musicPanel
                subtitleExportPanel
            }
        }
    }

    private var trimPanel: some View {
        DarkCard {
            label("主影片裁剪 · \(tfmt(vm.trimStart)) → \(vm.trimEnd > 0 ? tfmt(vm.trimEnd) : tfmt(vm.duration))")
            if vm.duration > 0 {
                HStack { Text("起").font(.caption2).frame(width: 18)
                    Slider(value: $vm.trimStart, in: 0...max(0.1, vm.duration)).tint(Theme.teal) }
                HStack { Text("終").font(.caption2).frame(width: 18)
                    Slider(value: Binding(get: { vm.trimEnd > 0 ? vm.trimEnd : vm.duration },
                                          set: { vm.trimEnd = $0 >= vm.duration - 0.05 ? 0 : $0 }),
                           in: 0...max(0.1, vm.duration)).tint(Theme.teal) }
                Text("匯出只含裁剪範圍，字幕自動對齊。").font(.caption2).foregroundStyle(.white.opacity(0.4))
            } else {
                Text("載入影片後可裁剪。").font(.caption2).foregroundStyle(.white.opacity(0.4))
            }
        }
    }
    private func tfmt(_ s: Double) -> String { String(format: "%d:%02d", Int(s) / 60, Int(s) % 60) }

    private var overlayPanel: some View {
        DarkCard {
            label("疊加圖層（畫中畫）· \(vm.overlays.count)/2")
            ForEach(vm.overlays) { o in
                VStack(spacing: 6) {
                    HStack {
                        Image(systemName: o.kind == .video ? "film" : "photo")
                            .foregroundStyle(o.kind == .video ? Theme.teal : .orange)
                        Text(o.url.lastPathComponent).font(.caption2).lineLimit(1)
                        Spacer()
                        Button { vm.removeOverlay(o.id) } label: { Image(systemName: "trash") }.font(.caption2).tint(.red)
                    }
                    HStack(spacing: 4) {
                        ForEach([("tl", "↖"), ("tr", "↗"), ("c", "◎"), ("bl", "↙"), ("br", "↘")], id: \.0) { k, label in
                            Button(label) { vm.updateOverlay(o.id) { $0.pos = k } }
                                .font(.caption).frame(maxWidth: .infinity).padding(.vertical, 4)
                                .background(o.pos == k ? Theme.teal.opacity(0.3) : .white.opacity(0.06))
                                .foregroundStyle(o.pos == k ? Theme.teal : .white.opacity(0.6))
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                        }
                    }
                    HStack { Text("大小").font(.caption2)
                        Slider(value: Binding(get: { o.size }, set: { v in vm.updateOverlay(o.id) { $0.size = v } }), in: 0.15...0.6).tint(Theme.teal) }
                    HStack(spacing: 4) {
                        Text("顯示").font(.caption2)
                        TextField("0", value: Binding(get: { o.start }, set: { v in vm.updateOverlay(o.id) { $0.start = max(0, v) } }), format: .number)
                            .frame(width: 40).font(.caption2).multilineTextAlignment(.center)
                        Text("→").font(.caption2)
                        TextField("片尾", value: Binding(get: { o.end }, set: { v in vm.updateOverlay(o.id) { $0.end = max(0, v) } }), format: .number)
                            .frame(width: 40).font(.caption2).multilineTextAlignment(.center)
                        Text("秒\(o.end <= 0 ? "（到尾）" : "")").font(.caption2).foregroundStyle(.white.opacity(0.4))
                    }
                }
                .padding(8).background(.white.opacity(0.04)).clipShape(RoundedRectangle(cornerRadius: 8))
            }
            if vm.overlays.count < 2 {
                HStack {
                    PhotosPicker(selection: $overlayVideoItem, matching: .videos) {
                        Label("加影片層", systemImage: "film").font(.caption2).frame(maxWidth: .infinity).padding(.vertical, 6)
                            .background(.white.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    PhotosPicker(selection: $overlayImageItem, matching: .images) {
                        Label("加相片層", systemImage: "photo").font(.caption2).frame(maxWidth: .infinity).padding(.vertical, 6)
                            .background(.white.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        }
    }

    private var voiceoverPanel: some View {
        DarkCard {
            label("旁白配音")
            if let v = vm.voiceover {
                HStack { Image(systemName: "mic"); Text(v.lastPathComponent).font(.caption2).lineLimit(1)
                    Spacer(); Button { vm.voiceover = nil } label: { Image(systemName: "trash") }.tint(.red) }
                Toggle("靜音原片聲音（用旁白做主聲）", isOn: $vm.muteOriginal).font(.caption).tint(Theme.teal)
                Text("字幕會由旁白生成，撳上面「自動生成字幕」。").font(.caption2).foregroundStyle(.white.opacity(0.4))
            } else {
                Button { showVoiceImporter = true } label: {
                    Label("匯入旁白 / 配音音檔", systemImage: "square.and.arrow.down").font(.caption2)
                        .frame(maxWidth: .infinity).padding(.vertical, 6)
                        .background(.white.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
        }
    }

    private var mediaLibraryPanel: some View {
        DarkCard {
            label("時間線片段 · 主影片 + \(vm.extraClips.count)")
            ForEach(vm.extraClips) { clip in
                HStack(spacing: 8) {
                    Image(systemName: clip.kind == .video ? "film" : "photo")
                        .foregroundStyle(clip.kind == .video ? Theme.teal : .orange)
                    Text(clip.name).font(.caption2).lineLimit(1)
                    Spacer()
                    if clip.kind == .image {
                        Stepper("\(Int(clip.duration))s", value: Binding(
                            get: { clip.duration },
                            set: { vm.setImageDuration(clip.id, $0) }), in: 0.5...20, step: 0.5)
                            .labelsHidden().scaleEffect(0.8)
                        Text("\(Int(clip.duration))s").font(.caption2).foregroundStyle(.white.opacity(0.5))
                    }
                    Button { vm.moveClip(clip.id, by: -1) } label: { Image(systemName: "chevron.up") }.font(.caption2)
                    Button { vm.moveClip(clip.id, by: 1) } label: { Image(systemName: "chevron.down") }.font(.caption2)
                    Button { vm.removeClip(clip.id) } label: { Image(systemName: "trash") }.font(.caption2).tint(.red)
                }
            }
            HStack {
                PhotosPicker(selection: $clipVideoItem, matching: .videos) {
                    Label("加片段", systemImage: "plus").font(.caption2).frame(maxWidth: .infinity).padding(.vertical, 6)
                        .background(.white.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 8))
                }
                PhotosPicker(selection: $clipImageItem, matching: .images) {
                    Label("加相片", systemImage: "photo").font(.caption2).frame(maxWidth: .infinity).padding(.vertical, 6)
                        .background(.white.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            Text("附加片段接喺主影片之後，字幕疊喺主影片上，一次匯出。").font(.caption2).foregroundStyle(.white.opacity(0.3))
        }
    }

    private var aiPanel: some View {
        DarkCard {
            label("AI 字幕設計")
            Button { Task { await vm.aiDesign() } } label: { aiButton("AI 設計整體風格", filled: true) }
            Button { Task { await vm.aiCueAnimations() } } label: { aiButton("AI 逐句動畫 + 重點字", filled: false) }
            HStack {
                Menu("翻譯") {
                    ForEach(["English", "簡體中文", "日本語", "한국어"], id: \.self) { lang in
                        Button(lang) { Task { await vm.translate(to: lang) } }
                    }
                }.font(.caption).tint(Theme.teal)
                if vm.cues.contains(where: { $0.translation != nil }) {
                    Toggle("雙語", isOn: $vm.bilingual).tint(Theme.teal).font(.caption)
                }
            }
        }
    }

    private var stylePanel: some View {
        DarkCard {
            label("字幕外觀")
            chips("字體", CaptionStyle.fonts.map { ($0.font, $0.name) }, selected: vm.style.fontName) { vm.style.fontName = $0 }
            chips("大小", CaptionStyle.sizes.map { (String($0.f), $0.name) }, selected: String(vm.style.fontFraction)) { vm.style.fontFraction = Double($0) ?? 0.058 }
            chips("位置", CaptionStyle.Pos.allCases.map { ($0.rawValue, posLabel($0)) }, selected: vm.style.pos.rawValue) { vm.style.pos = .init(rawValue: $0) ?? .bottom }
            chips("動畫", CaptionStyle.Anim.allCases.map { ($0.rawValue, animLabel($0)) }, selected: vm.style.animation.rawValue) { vm.style.animation = .init(rawValue: $0) ?? .none }
            HStack(spacing: 16) {
                ColorPicker("文字", selection: $vm.style.color).font(.caption)
                ColorPicker("描邊", selection: $vm.style.strokeColor).font(.caption)
            }
        }
    }

    private var aspectPanel: some View {
        DarkCard {
            label("畫面比例")
            chips("", OutputAspect.allCases.map { ($0.rawValue, $0.rawValue) }, selected: vm.aspect.rawValue) {
                vm.aspect = .init(rawValue: $0) ?? .original
            }
        }
    }

    private var musicPanel: some View {
        DarkCard {
            label("背景音樂")
            if let bgm = vm.bgmURL {
                HStack { Image(systemName: "music.note"); Text(bgm.lastPathComponent).lineLimit(1).font(.caption)
                    Spacer(); Button { vm.bgmURL = nil } label: { Image(systemName: "trash") }.tint(.red) }
                HStack { Text("音量").font(.caption); Slider(value: $vm.bgmVolume, in: 0...1).tint(Theme.teal) }
            } else {
                HStack {
                    Button { Task { await vm.aiMusic() } } label: { aiButton("AI 配樂", filled: true) }
                    Button { showMusic.toggle(); if showMusic { Task { await vm.loadMusic() } } } label: { aiButton("音樂庫", filled: false) }
                }
                Button { showAudioImporter = true } label: {
                    Text("或上載自己嘅音樂").font(.caption).foregroundStyle(.white.opacity(0.6))
                }
                if showMusic {
                    ForEach(vm.musicLib) { t in
                        HStack { Text(t.title).font(.caption); Text(t.moods.prefix(2).joined(separator: " · ")).font(.caption2).foregroundStyle(.white.opacity(0.4))
                            Spacer(); Button("選用") { Task { try? await vm.useMusic(id: t.id) } }.font(.caption2) }
                    }
                }
            }
        }
    }

    private var subtitleExportPanel: some View {
        DarkCard {
            label("字幕檔匯出 · \(vm.cues.count) 句")
            HStack {
                ForEach(["srt", "vtt", "txt"], id: \.self) { f in
                    Button(f.uppercased()) { if let u = vm.exportSubtitleFile(f) { shareURL = u; showShare = true } }
                        .font(.caption).frame(maxWidth: .infinity).padding(.vertical, 8)
                        .background(.white.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
        }
    }

    // MARK: Helpers
    @ViewBuilder private func overlayPreview(in size: CGSize) -> some View {
        ForEach(vm.overlays.filter { $0.active(at: player.time) }) { o in
            let r = overlayRectTL(o, size.width, size.height)
            Group {
                if o.kind == .image, let ui = UIImage(contentsOfFile: o.url.path) {
                    Image(uiImage: ui).resizable().scaledToFill()
                } else {
                    LoopingVideoView(url: o.url)
                }
            }
            .frame(width: r.width, height: r.height)
            .clipped().cornerRadius(4)
            .position(x: r.midX, y: r.midY)
        }
    }

    private var activeCue: Cue? { vm.cues.first { player.time >= $0.start && player.time <= $0.end } }
    private var aspectRatio: CGFloat {
        switch vm.aspect { case .r9_16: return 9/16; case .r1_1: return 1; case .r16_9: return 16/9; case .original: return 16/9 }
    }
    private func loadVideo() async {
        guard let item = pickerItem,
              let data = try? await item.loadTransferable(type: Data.self) else { return }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("studio-\(UUID().uuidString).mov")
        try? data.write(to: url); vm.setVideo(url)
    }
    private func loadClip(_ item: PhotosPickerItem?, image: Bool) async {
        guard let item, let data = try? await item.loadTransferable(type: Data.self) else { return }
        let ext = image ? "jpg" : "mov"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("clip-\(UUID().uuidString).\(ext)")
        try? data.write(to: url)
        if image { vm.addImageClip(url) } else { vm.addVideoClip(url) }
    }
    private func loadOverlay(_ item: PhotosPickerItem?, image: Bool) async {
        guard let item, let data = try? await item.loadTransferable(type: Data.self) else { return }
        let ext = image ? "jpg" : "mov"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("ov-\(UUID().uuidString).\(ext)")
        try? data.write(to: url)
        await vm.addOverlay(url: url, kind: image ? .image : .video)
    }
    private func exportVideo() async {
        guard app.isPro || app.isAdmin else { return }
        await vm.export()
        if let u = vm.exportURL { shareURL = u; showShare = true
            let mins = TranscriptionViewModel.billableMinutes(for: vm.videoURL!)
            await app.consume(minutes: mins)
        }
    }

    private func posLabel(_ p: CaptionStyle.Pos) -> String { ["top": "上", "middle": "中", "bottom": "下"][p.rawValue] ?? p.rawValue }
    private func animLabel(_ a: CaptionStyle.Anim) -> String { ["none": "無", "fade": "淡入", "pop": "彈出", "slide": "上移"][a.rawValue] ?? a.rawValue }

    @ViewBuilder private func label(_ t: String) -> some View {
        Text(t).font(.caption).foregroundStyle(.white.opacity(0.5)).frame(maxWidth: .infinity, alignment: .leading)
    }
    @ViewBuilder private func aiButton(_ t: String, filled: Bool) -> some View {
        HStack { Image(systemName: "sparkles"); Text(t) }.font(.caption).fontWeight(.semibold)
            .frame(maxWidth: .infinity).frame(height: 34)
            .background(filled ? AnyShapeStyle(LinearGradient(colors: [Theme.fuchsia, Theme.teal], startPoint: .leading, endPoint: .trailing)) : AnyShapeStyle(Color.white.opacity(0.08)))
            .foregroundStyle(.white).clipShape(RoundedRectangle(cornerRadius: 8))
    }
    @ViewBuilder private func chips(_ title: String, _ items: [(String, String)], selected: String, _ pick: @escaping (String) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if !title.isEmpty { Text(title).font(.caption2).foregroundStyle(.white.opacity(0.4)) }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(items, id: \.0) { item in
                        Button { pick(item.0) } label: {
                            Text(item.1).font(.caption2).padding(.horizontal, 10).padding(.vertical, 6)
                                .background(selected == item.0 ? Theme.teal.opacity(0.3) : .white.opacity(0.06))
                                .foregroundStyle(selected == item.0 ? Theme.teal : .white.opacity(0.7))
                                .clipShape(Capsule())
                        }
                    }
                }
            }
        }
    }
}

private struct DarkCard<C: View>: View {
    @ViewBuilder var content: C
    var body: some View {
        VStack(alignment: .leading, spacing: 10) { content }
            .padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.05)).clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

/// Caption text drawn over the live preview (matches the burner roughly).
private struct CaptionOverlay: View {
    let cue: Cue; let style: CaptionStyle; let bilingual: Bool
    var body: some View {
        GeometryReader { geo in
            VStack(spacing: 2) {
                Text(highlighted).font(.system(size: geo.size.height * style.fontFraction, weight: .bold))
                if bilingual, let t = cue.translation {
                    Text(t).font(.system(size: geo.size.height * style.fontFraction * 0.62, weight: .semibold))
                }
            }
            .foregroundStyle(style.color)
            .shadow(color: style.strokeColor, radius: 1)
            .frame(maxWidth: geo.size.width * 0.86)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
            .padding(.vertical, geo.size.height * 0.08)
        }
    }
    private var alignment: Alignment { style.pos == .top ? .top : style.pos == .middle ? .center : .bottom }

    /// AttributedString with emphasis words tinted in the highlight colour.
    private var highlighted: AttributedString {
        var s = AttributedString(cue.text)
        s.foregroundColor = style.color
        for w in cue.emphasis ?? [] where !w.isEmpty {
            var search = s.startIndex..<s.endIndex
            while let r = s[search].range(of: w) {
                s[r].foregroundColor = style.highlightColor
                search = r.upperBound..<s.endIndex
            }
        }
        return s
    }
}
