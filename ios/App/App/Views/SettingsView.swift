import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var viewModel: TranscriberViewModel
    @State private var showingSubscription = false
    @State private var showingTerms = false
    @State private var showingPrivacy = false
    
    let languages = ["Cantonese", "Mandarin", "English", "Filipino", "Indonesian"]
    
    var body: some View {
        NavigationView {
            Form {

                
                Section(header: Text("帳戶與訂閱")) {
                    HStack {
                        Label(viewModel.history.count > 1 || UserDefaults.standard.bool(forKey: "isPro") ? "專業版已解鎖" : "免費版 (限制 1 筆紀錄)", systemImage: "crown.fill")
                            .foregroundColor(UserDefaults.standard.bool(forKey: "isPro") ? .yellow : .gray)
                        Spacer()
                        Button("升級") {
                            showingSubscription = true
                        }
                        .foregroundColor(.blue)
                        .bold()
                    }
                }
                
                Section(header: Text("關於")) {
                    HStack {
                        Text("版本")
                        Spacer()
                        Text("2.0.0")
                            .foregroundColor(.secondary)
                    }
                }
                
                Section(header: Text("法律與隱私")) {
                    Button(action: { showingTerms = true }) {
                        HStack {
                            Text("服務條款 (Terms of Service)")
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                    .foregroundColor(.primary)
                    
                    Button(action: { showingPrivacy = true }) {
                        HStack {
                            Text("隱私權政策 (Privacy Policy)")
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                    .foregroundColor(.primary)
                }
            }
            .navigationTitle("設定")
            .sheet(isPresented: $showingSubscription) {
                SubscriptionView()
                    .environmentObject(viewModel)
            }
            .sheet(isPresented: $showingTerms) {
                LegalDetailView(title: "服務條款", content: LegalContent.terms)
            }
            .sheet(isPresented: $showingPrivacy) {
                LegalDetailView(title: "隱私權政策", content: LegalContent.privacy)
            }
        }
    }
}

// MARK: - Legal Content (Bilingual & Detailed)
struct LegalContent {
    static let terms = """
    【服務條款 / Terms of Service】
    
    (中文版本 / Chinese Version)
    
    1. 接受條款
    當您下載、安裝或使用 Canto AI (下稱「本應用」)，即表示您同意受本服務條款之約束。如果您不同意這些條款，請勿使用本應用。
    
    2. 服務內容
    本應用透過人工智慧技術（包括但不限於 Google Gemini API）提供語音轉錄、文字分析、摘要生成及相關功能。服務內容可能隨技術升級而變動。
    
    3. 使用者帳戶與內容
    - 您對透過本應用上傳的所有音訊文件具有完全的所有權。
    - 本應用僅作為處理工具，不會宣稱對您的轉錄結果擁有任何權利。
    - 您不得利用本服務處理違法、侵害他人隱私或版權的內容。
    
    4. 訂閱與支付
    - 專業版 (Pro) 採訂閱制，費用將透過您的 Apple ID 帳戶收取。
    - 訂閱會自動續期，除非您在目前計費週期結束前至少 24 小時關閉自動續訂。
    
    5. 免責聲明
    - AI 生成內容可能存在誤差，本應用不保證轉錄與分析结果的 100% 準確性。
    - 對於因使用本應用而產生的任何直接或間接損失，開發者不承擔法律責任。
    
    --------------------------------------------------
    
    (English Version)
    
    1. Acceptance of Terms
    By downloading, installing, or using Cantonese AI (the "App"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the App.
    
    2. Description of Service
    The App provides voice transcription, text analysis, summary generation, and related features using AI technology (including but not limited to the Google Gemini API). Services are subject to change due to technical updates.
    
    3. User Accounts and Content
    - You retain full ownership of all audio files uploaded through the App.
    - The App acts as a processing tool and claims no rights to your transcription results.
    - You may not use the Service to process content that is illegal or infringes on the privacy or copyrights of others.
    
    4. Subscriptions and Payments
    - The Pro version is subscription-based, with fees charged via your Apple ID account.
    - Subscriptions automatically renew unless auto-renew is turned off at least 24 hours before the end of the current billing period.
    
    5. Disclaimers
    - AI-generated content may contain errors; the App does not guarantee 100% accuracy of transcriptions and analyses.
    - The developer is not liable for any direct or indirect damages arising from the use of the App.
    """
    
    static let privacy = """
    【隱私權政策 / Privacy Policy】
    
    (中文版本 / Chinese Version)
    
    1. 數據收集與範圍
    我們僅收集提供轉錄服務所必需的數據，包括您上傳的音訊文件以及您主動輸入的分析目標。我們不會收集您的聯絡人、地理位置等無關隱私。
    
    2. 數據處理與儲存
    - 語音處理：您的音訊會被傳輸至 Google Gemini API 進行計算。
    - 暫存政策：音訊文件在轉錄完成後會立即從處理伺服器中移除。
    - 訓練聲明：我們與 API 供應商的協議確保您的私有數據不會被用於訓練其 AI 模型。
    
    3. 資料安全
    所有數據傳輸均經過加密處理 (SSL/TLS)，確保在傳輸過程中不被第三方截取。
    
    4. 使用者權利
    您有權隨時要求刪除在本應用中存儲的歷史記錄。相關操作可在「歷史」頁面手動執行。
    
    5. 條款變更
    我們可能會不時更新隱私政策。建議您定期查看本頁面以獲取最新資訊。
    
    --------------------------------------------------
    
    (English Version)
    
    1. Information Collection
    We only collect data necessary to provide transcription services, including audio files you upload and specific analysis goals you input. We do not collect unrelated private info such as contacts or location.
    
    2. Data Processing and Storage
    - Voice Processing: Your audio is transmitted to Google Gemini API for computation.
    - Temporary Storage: Audio files are removed from processing servers immediately after transcription is complete.
    - Model Training: Our agreement with the API provider ensures your private data is NOT used to train their AI models.
    
    3. Data Security
    All data transmissions are encrypted using SSL/TLS to prevent interception by third parties.
    
    4. User Rights
    You have the right to delete your transcription history stored within this App at any time via the "History" page.
    
    5. Changes to Policy
    We may update this Privacy Policy from time to time. You are encouraged to review this page periodically for updates.
    """
}

// MARK: - Re-integrated LegalDetailView (to ensure Scope visibility)
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
