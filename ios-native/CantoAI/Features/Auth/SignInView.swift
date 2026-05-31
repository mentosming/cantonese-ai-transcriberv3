import SwiftUI
import AuthenticationServices

struct SignInView: View {
    @EnvironmentObject var app: AppState
    @State private var loading = false
    @State private var error: String?
    @State private var appleNonce: String?

    var body: some View {
        ZStack {
            Theme.canvas.ignoresSafeArea()
            VStack(spacing: 24) {
                Spacer()
                VStack(spacing: 10) {
                    Image(systemName: "waveform.circle.fill")
                        .font(.system(size: 64)).foregroundStyle(Theme.teal)
                    Text("Canto AI").font(.system(.largeTitle, design: .rounded)).bold()
                    Text("粵語 AI 轉錄 · 字幕工作室")
                        .font(.subheadline).foregroundStyle(Theme.inkMuted)
                }
                Spacer()
                VStack(spacing: 12) {
                    SignInWithAppleButton(.signIn) { request in
                        let raw = AuthService.randomNonce()
                        appleNonce = raw
                        request.requestedScopes = [.fullName, .email]
                        request.nonce = AuthService.sha256(raw)
                    } onCompletion: { result in
                        Task { await handleApple(result) }
                    }
                    .signInWithAppleButtonStyle(.black)
                    .frame(height: 50)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                    PrimaryButton(title: "用 Google 登入", systemImage: "person.crop.circle", loading: loading) {
                        Task { await signIn() }
                    }
                    Text("登入即送 \(Config.freeStarterMinutes) 分鐘免費額度（轉錄 + 工作室共用）")
                        .font(.caption).foregroundStyle(Theme.inkFaint).multilineTextAlignment(.center)
                    if let error { Text(error).font(.caption).foregroundStyle(.red) }
                }
                .padding(.horizontal, 24).padding(.bottom, 32)
            }
            .padding()
        }
    }

    private func signIn() async {
        loading = true; error = nil
        do { try await app.signIn() }
        catch { self.error = error.localizedDescription }
        loading = false
    }

    private func handleApple(_ result: Result<ASAuthorization, Error>) async {
        switch result {
        case .success(let authorization):
            guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = cred.identityToken,
                  let idToken = String(data: tokenData, encoding: .utf8),
                  let raw = appleNonce else {
                error = "Apple 登入失敗"; return
            }
            do { try await app.signInWithApple(idToken: idToken, rawNonce: raw, fullName: cred.fullName) }
            catch { self.error = error.localizedDescription }
        case .failure(let e):
            if (e as? ASAuthorizationError)?.code != .canceled { error = e.localizedDescription }
        }
    }
}
