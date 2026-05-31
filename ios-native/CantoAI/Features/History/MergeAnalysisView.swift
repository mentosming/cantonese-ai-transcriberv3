import SwiftUI

/// Pick multiple past transcripts → cross-conversation AI analysis (billed).
/// Mirrors the web app's merge-analysis feature.
struct MergeAnalysisView: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var logs: [UsageLog] = []
    @State private var selected = Set<String>()
    @State private var goal = ""
    @State private var result: String?
    @State private var loading = true
    @State private var analysing = false
    @State private var error: String?

    private let costMinutes = 2  // flat cost per analysis

    var body: some View {
        NavigationStack {
            Group {
                if let result {
                    ScrollView {
                        Text(result).font(.callout).textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading).padding()
                    }
                } else {
                    picker
                }
            }
            .navigationTitle("多影片合併分析").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("關閉") { dismiss() } }
                if result != nil {
                    ToolbarItem(placement: .topBarTrailing) { Button("重新揀") { result = nil } }
                }
            }
            .task { await load() }
        }
    }

    private var picker: some View {
        VStack(spacing: 0) {
            if loading { ProgressView().frame(maxHeight: .infinity) }
            else if logs.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "rectangle.stack.badge.questionmark").font(.largeTitle).foregroundStyle(Theme.inkFaint)
                    Text("未有轉錄記錄").font(.headline)
                    Text("先做幾段轉錄／字幕，再返嚟揀嚟合併分析").font(.caption).foregroundStyle(Theme.inkMuted)
                }.frame(maxHeight: .infinity)
            } else {
                List {
                    Section("揀要分析嘅對話（可多選）") {
                        ForEach(logs) { log in
                            Button { toggle(log.id) } label: {
                                HStack {
                                    Image(systemName: selected.contains(log.id) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(selected.contains(log.id) ? Theme.teal : Theme.inkFaint)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(log.fileName).font(.subheadline).foregroundStyle(Theme.ink)
                                        Text(log.preview).font(.caption).foregroundStyle(Theme.inkMuted).lineLimit(1)
                                    }
                                }
                            }
                        }
                    }
                    Section("分析目標（可選）") {
                        TextField("例：比較三次會議嘅決定", text: $goal, axis: .vertical)
                    }
                }
            }

            if !logs.isEmpty {
                VStack(spacing: 6) {
                    if let error { Text(error).font(.caption).foregroundStyle(.red) }
                    PrimaryButton(title: analysing ? "AI 分析中…" : "合併分析（\(selected.count)）· 約 \(costMinutes) 分鐘",
                                  systemImage: "sparkles", loading: analysing,
                                  disabled: selected.count < 2) {
                        Task { await analyse() }
                    }
                    Text(selected.count < 2 ? "至少揀 2 段" : "綜合摘要、共同主題、時間線、Q&A、待跟進")
                        .font(.caption2).foregroundStyle(Theme.inkFaint)
                }
                .padding(16).background(.ultraThinMaterial)
            }
        }
    }

    private func toggle(_ id: String) {
        if selected.contains(id) { selected.remove(id) } else { selected.insert(id) }
    }

    private func load() async {
        guard let uid = app.profile?.uid else { loading = false; return }
        logs = (try? await app.billing.history(uid: uid)) ?? []
        loading = false
    }

    private func analyse() async {
        let check = app.checkEntitlement(minutes: costMinutes)
        guard check.allowed else { error = check.message ?? "額度不足"; return }
        analysing = true; error = nil
        do {
            var items: [(label: String, content: String)] = []
            for log in logs where selected.contains(log.id) {
                let text = (try? await app.billing.fullTranscript(id: log.id)) ?? log.preview
                items.append((label: log.fileName, content: text))
            }
            result = try await AIService.shared.analyzeCombined(items, goal: goal)
            await app.consume(minutes: costMinutes)
        } catch { self.error = error.localizedDescription }
        analysing = false
    }
}
