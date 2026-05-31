import SwiftUI

struct HistoryView: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var logs: [UsageLog] = []
    @State private var loading = true
    @State private var detail: String?

    var body: some View {
        NavigationStack {
            Group {
                if loading { ProgressView() }
                else if logs.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "clock").font(.largeTitle).foregroundStyle(Theme.inkFaint)
                        Text("未有記錄").font(.headline)
                        Text("轉錄或生成字幕後會喺度顯示").font(.caption).foregroundStyle(Theme.inkMuted)
                    }
                } else {
                    List(logs) { log in
                        Button { Task { await openDetail(log) } } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(log.fileName).font(.subheadline).fontWeight(.medium).foregroundStyle(Theme.ink)
                                Text(log.preview).font(.caption).foregroundStyle(Theme.inkMuted).lineLimit(2)
                                HStack(spacing: 8) {
                                    Label("\(log.durationMinutes) 分鐘", systemImage: "clock")
                                    Label("\(log.charCount) 字", systemImage: "text.alignleft")
                                    Text(Date(timeIntervalSince1970: log.createdAt / 1000), style: .date)
                                }.font(.caption2).foregroundStyle(Theme.inkFaint)
                            }
                        }
                    }
                }
            }
            .navigationTitle("轉換記錄").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("關閉") { dismiss() } } }
            .task { await load() }
            .sheet(item: Binding(get: { detail.map { IdentifiedString(value: $0) } },
                                 set: { detail = $0?.value })) { item in
                NavigationStack {
                    ScrollView { Text(item.value).font(.system(.body, design: .monospaced)).padding() }
                        .navigationTitle("內容").navigationBarTitleDisplayMode(.inline)
                }
            }
        }
    }

    private func load() async {
        guard let uid = app.profile?.uid else { loading = false; return }
        logs = (try? await app.billing.history(uid: uid)) ?? []
        loading = false
    }
    private func openDetail(_ log: UsageLog) async {
        detail = (try? await app.billing.fullTranscript(id: log.id)) ?? log.preview
    }
}

private struct IdentifiedString: Identifiable { let id = UUID(); let value: String }
