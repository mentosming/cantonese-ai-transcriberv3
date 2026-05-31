import SwiftUI
import UniformTypeIdentifiers

struct HomeView: View {
    @EnvironmentObject var app: AppState
    @State private var settings = TranscriptionSettings()
    @State private var pickedFile: URL?
    @State private var showImporter = false
    @State private var showPaywall = false
    @State private var showHistory = false
    @State private var showStudio = false
    @State private var showAccount = false
    @State private var showMerge = false
    @State private var pendingSource: TranscriptionViewModel.Source?
    @State private var linkURL = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    studioCard
                    uploadSection
                    settingsSection
                    startButton
                }
                .padding(16)
            }
            .background(Theme.canvas.ignoresSafeArea())
            .navigationTitle("Canto AI")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { creditPill }
                ToolbarItem(placement: .topBarTrailing) { accountMenu }
            }
            .navigationDestination(isPresented: Binding(
                get: { pendingSource != nil },
                set: { if !$0 { pendingSource = nil } })) {
                if let s = pendingSource { TranscriptionView(source: s, settings: settings) }
            }
            .sheet(isPresented: $showPaywall) { PaywallView() }
            .sheet(isPresented: $showHistory) { HistoryView() }
            .sheet(isPresented: $showAccount) { AccountView() }
            .sheet(isPresented: $showMerge) { MergeAnalysisView() }
            .fullScreenCover(isPresented: $showStudio) { StudioView() }
            .fileImporter(isPresented: $showImporter,
                          allowedContentTypes: [.audio, .movie, .mpeg4Movie, .mp3, .wav],
                          allowsMultipleSelection: false) { result in
                if case .success(let urls) = result, let url = urls.first {
                    // Copy into a stable temp location we control.
                    pickedFile = Self.stableCopy(url)
                }
            }
        }
    }

    // MARK: Sections
    private var studioCard: some View {
        Button { gated { showStudio = true } } label: {
            HStack(spacing: 12) {
                Image(systemName: "film.stack")
                    .font(.title3).foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(LinearGradient(colors: [Theme.teal, Theme.fuchsia], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 2) {
                    Text("影片工作室").font(.headline).foregroundStyle(Theme.ink)
                    Text("字幕生成 + AI 逐句動畫 + 時間線剪輯，輸出 MP4")
                        .font(.caption).foregroundStyle(Theme.inkMuted).lineLimit(2)
                }
                Spacer(); Image(systemName: "chevron.right").foregroundStyle(Theme.teal)
            }
            .padding(16)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(LinearGradient(colors: [Theme.teal, Theme.fuchsia], startPoint: .leading, endPoint: .trailing), lineWidth: 1.5))
        }
    }

    private var uploadSection: some View {
        VStack(spacing: 12) {
            SectionHeader(index: "01", title: "上載 / 錄音")
            Card {
                VStack(spacing: 12) {
                    Button { showImporter = true } label: {
                        HStack {
                            Image(systemName: "square.and.arrow.up")
                            Text(pickedFile?.lastPathComponent ?? "揀影片 / 音訊檔").lineLimit(1)
                            Spacer()
                        }
                        .foregroundStyle(pickedFile == nil ? Theme.inkMuted : Theme.ink)
                        .padding(12)
                        .frame(maxWidth: .infinity)
                        .background(Theme.sunk)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    RecorderButton { url in pickedFile = url }

                    // YouTube / 連結直接轉錄 (Gemini direct, no download)
                    HStack(spacing: 8) {
                        Image(systemName: "link").foregroundStyle(Theme.inkFaint)
                        TextField("貼 YouTube / 影片連結", text: $linkURL)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .keyboardType(.URL).font(.subheadline)
                        Button("轉錄") {
                            let u = linkURL.trimmingCharacters(in: .whitespaces)
                            if u.hasPrefix("http") { gated { pendingSource = .url(u) } }
                        }
                        .font(.caption).fontWeight(.semibold)
                        .disabled(!linkURL.trimmingCharacters(in: .whitespaces).hasPrefix("http"))
                    }
                    .padding(12).background(Theme.sunk).clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    private var settingsSection: some View {
        VStack(spacing: 12) {
            SectionHeader(index: "02", title: "AI 設定")
            Card {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Text("引擎").foregroundStyle(Theme.inkMuted)
                        Spacer()
                        Picker("", selection: Binding(get: { settings.model ?? Engine.defaultModel },
                                                       set: { settings.model = $0 })) {
                            ForEach(Engine.all, id: \.id) { Text($0.name).tag($0.id) }
                        }.tint(Theme.teal)
                    }
                    Divider()
                    HStack {
                        Text("語言").foregroundStyle(Theme.inkMuted)
                        Spacer()
                        Picker("", selection: Binding(get: { settings.language.first ?? "yue" },
                                                       set: { settings.language = [$0] })) {
                            ForEach(Language.all) { Text($0.name).tag($0.id) }
                        }.tint(Theme.teal)
                    }
                    Divider()
                    Toggle("時間戳", isOn: $settings.enableTimestamps).tint(Theme.teal)
                    Toggle("講者分離", isOn: $settings.enableDiarization).tint(Theme.teal)
                }
                .font(.subheadline)
            }
        }
    }

    private var startButton: some View {
        PrimaryButton(title: pickedFile == nil ? "請先揀檔案" : "開始轉錄",
                      systemImage: "play.circle.fill",
                      disabled: pickedFile == nil) {
            if let f = pickedFile { gated { pendingSource = .file(f) } }
        }
        .padding(.top, 4)
    }

    private var creditPill: some View {
        HStack(spacing: 4) {
            Image(systemName: "bolt.fill").font(.caption2)
            Text(app.isAdmin ? "管理員" : app.profile?.subscriptionStatus == .active ? "訂閱中" : "餘 \(app.creditMinutes) 分鐘")
        }
        .font(.caption).fontWeight(.semibold)
        .padding(.horizontal, 10).padding(.vertical, 5)
        .background(Theme.tealSoft).foregroundStyle(Theme.tealDeep)
        .clipShape(Capsule())
        .onTapGesture { showPaywall = true }
    }

    private var accountMenu: some View {
        Menu {
            Button { showAccount = true } label: { Label("帳戶 / 連結登入", systemImage: "person.crop.circle") }
            Button { showHistory = true } label: { Label("轉換記錄", systemImage: "clock.arrow.circlepath") }
            Button { showMerge = true } label: { Label("多影片合併分析", systemImage: "rectangle.stack.badge.plus") }
            Button { showPaywall = true } label: { Label("購買 / 訂閱", systemImage: "creditcard") }
            Button { Task { try? await app.billing.restore(); await app.refreshProfile() } } label: {
                Label("還原購買", systemImage: "arrow.clockwise")
            }
            Divider()
            Button(role: .destructive) { app.signOut() } label: { Label("登出", systemImage: "arrow.right.square") }
        } label: { Image(systemName: "person.crop.circle") }
    }

    // MARK: Gating
    private func gated(_ action: () -> Void) {
        if app.isPro || app.creditMinutes > 0 || app.isAdmin { action() }
        else { showPaywall = true }
    }

    static func stableCopy(_ url: URL) -> URL {
        let needsAccess = url.startAccessingSecurityScopedResource()
        defer { if needsAccess { url.stopAccessingSecurityScopedResource() } }
        let dest = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "-" + url.lastPathComponent)
        try? FileManager.default.copyItem(at: url, to: dest)
        return FileManager.default.fileExists(atPath: dest.path) ? dest : url
    }
}
