import SwiftUI

struct LegalDetailView: View {
    let title: String
    let content: String
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text(content)
                        .font(.system(size: 15, design: .rounded))
                        .lineSpacing(6)
                        .foregroundColor(.primary.opacity(0.8))
                }
                .padding()
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("完成") {
                        dismiss()
                    }
                }
            }
        }
    }
}

struct LegalDetailView_Previews: PreviewProvider {
    static var previews: some View {
        LegalDetailView(title: "測試標題", content: "這是測試內容...")
    }
}
