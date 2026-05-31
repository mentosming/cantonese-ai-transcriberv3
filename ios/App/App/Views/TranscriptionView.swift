import SwiftUI

struct TranscriptionView: View {
    @EnvironmentObject var viewModel: TranscriberViewModel

    var body: some View {
        Text("轉錄功能已整合至主分頁與歷史紀錄中。")
            .foregroundColor(.secondary)
    }
}
