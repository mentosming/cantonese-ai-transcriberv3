import SwiftUI

struct SummaryView: View {
    @EnvironmentObject var viewModel: TranscriberViewModel

    var body: some View {
        Text("摘要功能已整合至 AI 分析頁面中。")
            .foregroundColor(.secondary)
    }
}
