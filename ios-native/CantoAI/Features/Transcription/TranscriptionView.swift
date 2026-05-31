import SwiftUI

struct TranscriptionView: View {
    let source: TranscriptionViewModel.Source
    let settings: TranscriptionSettings
    @EnvironmentObject var app: AppState
    @StateObject private var vm = TranscriptionViewModel()
    @State private var showShare = false
    @State private var exportURL: URL?

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    Text(vm.transcript.isEmpty ? "準備轉錄…" : vm.transcript)
                        .font(.system(.body, design: .monospaced))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .foregroundStyle(vm.transcript.isEmpty ? Theme.inkFaint : Theme.ink)
                        .padding(16)
                        .id("bottom")
                }
                .onChange(of: vm.transcript) { _ in withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
            }
            if let e = vm.error {
                Text(e).font(.caption).foregroundStyle(.red).padding(.horizontal)
            }
            controls
        }
        .background(Theme.canvas.ignoresSafeArea())
        .navigationTitle("轉錄結果")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { if vm.status == .idle { vm.start(source: source, settings: settings, app: app) } }
        .sheet(isPresented: $showShare) { if let u = exportURL { ShareSheet(items: [u]) } }
    }

    private var controls: some View {
        HStack(spacing: 12) {
            if vm.isRunning {
                Button { vm.stop() } label: {
                    Label("停止", systemImage: "stop.circle").frame(maxWidth: .infinity)
                }.tint(.red).buttonStyle(.borderedProminent)
            } else {
                Menu {
                    Button("SRT 字幕") { exportSubs("srt") }
                    Button("VTT 字幕") { exportSubs("vtt") }
                    Button("純文字 TXT") { exportSubs("txt") }
                } label: {
                    Label("匯出字幕", systemImage: "square.and.arrow.up").frame(maxWidth: .infinity)
                }.buttonStyle(.borderedProminent).disabled(vm.transcript.isEmpty)
            }
        }
        .padding(16)
        .background(.ultraThinMaterial)
    }

    private func exportSubs(_ fmt: String) {
        let cues = SubtitleUtil.transcriptToCues(vm.transcript)
        let body: String
        switch fmt {
        case "vtt": body = SubtitleUtil.cuesToVTT(cues)
        case "txt": body = SubtitleUtil.cuesToText(cues).ifEmpty(vm.transcript)
        default:    body = SubtitleUtil.cuesToSRT(cues)
        }
        write(body, ext: fmt)
    }
    private func write(_ text: String, ext: String) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("transcript.\(ext)")
        try? text.data(using: .utf8)?.write(to: url)
        exportURL = url; showShare = true
    }
}

private extension String { func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self } }

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { .init(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}
