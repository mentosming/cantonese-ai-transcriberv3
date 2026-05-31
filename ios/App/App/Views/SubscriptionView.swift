import SwiftUI
import StoreKit

struct SubscriptionView: View {
    @EnvironmentObject var viewModel: TranscriberViewModel
    @State private var products: [Product] = []
    
    var body: some View {
        ScrollView {
            VStack(spacing: 30) {
                // Header
                VStack(spacing: 12) {
                    Image(systemName: "crown.fill")
                        .font(.system(size: 60))
                        .foregroundColor(.yellow)
                    Text("升級至專業版 Pro")
                        .font(.largeTitle.bold())
                    Text("解鎖無限轉錄內容，支援長音訊與導出")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 40)
                
                // Pricing Card
                VStack(spacing: 20) {
                    HStack {
                        VStack(alignment: .leading) {
                            Text("每月訂閱")
                                .font(.headline)
                            Text("每月只需 $2.00 USD")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        Spacer()
                        Button(action: { buySubscription() }) {
                            Text("立即訂閱")
                                .bold()
                                .padding(.horizontal, 20)
                                .padding(.vertical, 10)
                                .background(Color.blue)
                                .foregroundColor(.white)
                                .cornerRadius(10)
                        }
                    }
                    .padding()
                    .background(RoundedRectangle(cornerRadius: 15).fill(Color(.systemBackground)))
                    .shadow(color: Color.black.opacity(0.05), radius: 10, y: 5)
                }
                .padding(.horizontal)
                
                // Features List
                VStack(alignment: .leading, spacing: 15) {
                    FeatureRow(icon: "infinite", title: "無限次歷史紀錄存儲")
                    FeatureRow(icon: "timer", title: "支援超過 7 分鐘的長音訊")
                    FeatureRow(icon: "square.and.arrow.up", title: "全格式導出 (SRT, CSV, Text)")
                    FeatureRow(icon: "person.2.fill", title: "高級講者識別與標記")
                }
                .padding(.horizontal)
                
                Divider()
                
                // Legal & SOP
                VStack(alignment: .leading, spacing: 20) {
                    Text("法律條款與指南")
                        .font(.headline)
                    
                    NavigationLink(destination: LegalTextView(title: "隱私政策 (Privacy Policy)", content: privacyPolicy)) {
                        Label("隱私政策", systemImage: "shield.lefthalf.filled")
                    }
                    
                    NavigationLink(destination: LegalTextView(title: "使用守則 (Terms of Use)", content: termsOfUse)) {
                        Label("使用守則 (EULA)", systemImage: "doc.text.shield")
                    }
                    
                    NavigationLink(destination: LegalTextView(title: "使用標準作業程序 (SOP)", content: sopContent)) {
                        Label("使用 SOP", systemImage: "info.circle")
                    }
                }
                .padding(.horizontal)
                .foregroundColor(.blue)
                
                Spacer(minLength: 50)
            }
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
    }
    
    func buySubscription() {
        // Standard StoreKit 2 logic (Placeholder for actual product IDs)
        // Task { try? await AppStore.sync() }
        viewModel.statusMessage = "正在連線 App Store..."
    }
}

struct FeatureRow: View {
    let icon: String
    let title: String
    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundColor(.blue)
                .frame(width: 30)
            Text(title)
                .font(.body)
        }
    }
}

struct LegalTextView: View {
    let title: String
    let content: String
    var body: some View {
        ScrollView {
            Text(content)
                .padding()
                .font(.system(size: 14))
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Legal Content Constants
let privacyPolicy = """
本應用程式（Cantonese AI Transcriber）承諾保護您的個人隱私。
1. 所有錄音檔案與轉錄結果均儲存在使用者的本機設備中。
2. 我們不會在雲端伺服器備份或儲存您的音訊內容。
3. 如果您選擇轉錄，音訊數據會傳送至 Gemini AI 服務器進行處理，但不與您的身份相關聯。
"""

let termsOfUse = """
使用本應用程式代表您同意：
1. 僅將本服務用於合法用途。
2. 您對上傳或錄製的所有內容負有完全法律責任。
3. 訂閱費用將透過 Apple 賬號收取，您隨時可以取消。
"""

let sopContent = """
獲取最佳轉錄效果的 SOP：
1. 請確保麥克風靠近講者。
2. 在安靜的環境中進行錄音，避免背景噪音。
3. 轉錄長音訊前，請確保網絡連線穩定。
"""
