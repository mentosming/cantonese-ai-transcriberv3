import SwiftUI
import AuthenticationServices

/// Account screen: shows the profile, lets the user **link the other login
/// provider** to the same account so credits are shared across web + iOS.
struct AccountView: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var appleNonce: String?
    @State private var busy = false
    @State private var error: String?
    @State private var info: String?

    private var hasGoogle: Bool { app.linkedProviders.contains("google.com") }
    private var hasApple: Bool { app.linkedProviders.contains("apple.com") }

    var body: some View {
        NavigationStack {
            List {
                Section("帳戶") {
                    LabeledContent("電郵", value: app.profile?.email ?? "—")
                    LabeledContent("方案", value: planText)
                    LabeledContent("額度", value: app.isAdmin ? "管理員" : "\(app.creditMinutes) 分鐘")
                }

                Section {
                    providerRow(name: "Google", linked: hasGoogle, system: "globe") {
                        Task { await link { try await app.linkGoogle() } }
                    }
                    providerRow(name: "Apple", linked: hasApple, system: "apple.logo") {
                        // Apple linking goes through the SignInWithApple flow below.
                    }
                    if !hasApple {
                        SignInWithAppleButton(.continue) { request in
                            let raw = AuthService.randomNonce()
                            appleNonce = raw
                            request.requestedScopes = [.fullName, .email]
                            request.nonce = AuthService.sha256(raw)
                        } onCompletion: { result in Task { await linkApple(result) } }
                        .signInWithAppleButtonStyle(.black)
                        .frame(height: 44)
                    }
                } header: {
                    Text("登入方式")
                } footer: {
                    Text("連結 Apple 同 Google 到同一帳戶，跨 iOS / 網頁版額度就會共通。")
                }

                if let info { Section { Text(info).foregroundStyle(Theme.teal).font(.caption) } }
                if let error { Section { Text(error).foregroundStyle(.red).font(.caption) } }

                Section {
                    Button(role: .destructive) { app.signOut(); dismiss() } label: { Text("登出") }
                }
            }
            .navigationTitle("帳戶").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("關閉") { dismiss() } } }
            .overlay { if busy { ProgressView().padding().background(.ultraThinMaterial).clipShape(RoundedRectangle(cornerRadius: 12)) } }
        }
    }

    private func providerRow(name: String, linked: Bool, system: String, link: @escaping () -> Void) -> some View {
        HStack {
            Image(systemName: system)
            Text(name)
            Spacer()
            if linked { Label("已連結", systemImage: "checkmark.circle.fill").foregroundStyle(Theme.teal).labelStyle(.titleAndIcon).font(.caption) }
            else if name == "Google" { Button("連結", action: link).font(.caption) }
        }
    }

    private var planText: String {
        switch app.profile?.subscriptionStatus {
        case .active: return "月費訂閱中"
        default: return app.creditMinutes > 0 ? "按量額度" : "免費"
        }
    }

    private func link(_ op: @escaping () async throws -> Void) async {
        busy = true; error = nil; info = nil
        do { try await op(); info = "已連結，跨平台額度已共通。" }
        catch { self.error = friendly(error) }
        busy = false
    }
    private func linkApple(_ result: Result<ASAuthorization, Error>) async {
        switch result {
        case .success(let authorization):
            guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = cred.identityToken,
                  let idToken = String(data: tokenData, encoding: .utf8),
                  let raw = appleNonce else { error = "Apple 連結失敗"; return }
            await link { try await app.linkApple(idToken: idToken, rawNonce: raw, fullName: cred.fullName) }
        case .failure(let e):
            if (e as? ASAuthorizationError)?.code != .canceled { error = e.localizedDescription }
        }
    }
    private func friendly(_ e: Error) -> String {
        let ns = e as NSError
        // 17025 = credentialAlreadyInUse
        if ns.code == 17025 { return "呢個帳戶已經連結咗另一個用戶。請改用嗰個帳戶登入。" }
        if ns.code == 17015 { return "呢個登入方式已經連結。" }
        return e.localizedDescription
    }
}
