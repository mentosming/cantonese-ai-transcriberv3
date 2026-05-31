import SwiftUI
import RevenueCat

struct PaywallView: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var offering: Offering?
    @State private var loading = true
    @State private var purchasing = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    header
                    if loading { ProgressView().padding(40) }
                    else if let offering {
                        ForEach(offering.availablePackages, id: \.identifier) { pkg in
                            packageCard(pkg)
                        }
                    } else {
                        Text("暫時載入唔到方案").foregroundStyle(Theme.inkMuted).padding()
                    }
                    if purchasing {
                        HStack(spacing: 8) { ProgressView(); Text("處理緊購買、入賬中…") }
                            .font(.caption).foregroundStyle(Theme.inkMuted)
                    }
                    if let error { Text(error).font(.caption).foregroundStyle(.red) }
                    Button("還原購買") { Task { await restore() } }
                        .font(.footnote).foregroundStyle(Theme.inkMuted).padding(.top, 8)
                }
                .padding(16)
            }
            .background(Theme.canvas.ignoresSafeArea())
            .navigationTitle("升級").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("關閉") { dismiss() } } }
            .task { await load() }
        }
    }

    private var header: some View {
        VStack(spacing: 6) {
            Image(systemName: "sparkles").font(.largeTitle).foregroundStyle(Theme.teal)
            Text("解鎖全部功能").font(.title2).bold()
            Text("轉錄、字幕工作室、AI 設計、翻譯、配樂").font(.subheadline).foregroundStyle(Theme.inkMuted)
        }.padding(.vertical, 12)
    }

    private func packageCard(_ pkg: Package) -> some View {
        Button { Task { await buy(pkg) } } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(pkg.storeProduct.localizedTitle).font(.headline).foregroundStyle(Theme.ink)
                    Text(pkg.storeProduct.localizedDescription).font(.caption).foregroundStyle(Theme.inkMuted)
                }
                Spacer()
                Text(pkg.storeProduct.localizedPriceString).font(.headline).foregroundStyle(Theme.tealDeep)
            }
            .padding(16).background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line))
        }
        .disabled(purchasing)
    }

    private func load() async {
        do { offering = try await app.billing.offerings().current }
        catch { self.error = error.localizedDescription }
        loading = false
    }
    private func buy(_ pkg: Package) async {
        purchasing = true; error = nil
        let prevMinutes = app.creditMinutes
        let wasActive = app.profile?.subscriptionStatus == .active
        do {
            try await app.billing.purchase(pkg)
            // The webhook credits Firestore async — poll until it lands.
            await app.awaitEntitlementUpdate(previousMinutes: prevMinutes, wasActive: wasActive)
            dismiss()
        } catch { self.error = error.localizedDescription }
        purchasing = false
    }
    private func restore() async {
        do { try await app.billing.restore(); await app.refreshProfile(); dismiss() }
        catch { self.error = error.localizedDescription }
    }
}
