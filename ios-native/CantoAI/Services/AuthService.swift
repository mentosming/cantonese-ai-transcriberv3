import Foundation
import FirebaseAuth
import FirebaseCore
import GoogleSignIn
import AuthenticationServices
import CryptoKit
import UIKit

/// Google sign-in via Firebase Auth (mirrors the web authService.ts).
struct AuthService {
    struct Result { let uid: String; let email: String? }

    var currentUID: String? { Auth.auth().currentUser?.uid }
    var currentEmail: String? { Auth.auth().currentUser?.email }
    /// Providers linked to the current account, e.g. ["google.com", "apple.com"].
    var linkedProviderIDs: [String] { Auth.auth().currentUser?.providerData.map(\.providerID) ?? [] }

    private func googleCredential() async throws -> AuthCredential {
        guard let clientID = FirebaseApp.app()?.options.clientID else {
            throw NSError(domain: "auth", code: 0, userInfo: [NSLocalizedDescriptionKey: "缺少 Firebase clientID"])
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        guard let presenter = await Self.topViewController() else {
            throw NSError(domain: "auth", code: 1, userInfo: [NSLocalizedDescriptionKey: "找不到畫面"])
        }
        let gid = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
        guard let idToken = gid.user.idToken?.tokenString else {
            throw NSError(domain: "auth", code: 2, userInfo: [NSLocalizedDescriptionKey: "Google 登入失敗"])
        }
        return GoogleAuthProvider.credential(withIDToken: idToken, accessToken: gid.user.accessToken.tokenString)
    }

    func signInWithGoogle() async throws -> Result {
        let authResult = try await Auth.auth().signIn(with: try await googleCredential())
        return Result(uid: authResult.user.uid, email: authResult.user.email)
    }

    // MARK: Account linking — connect another provider to the SAME Firebase uid
    // so credits (keyed by uid in Firestore) are shared across web + iOS.
    func linkGoogle() async throws {
        guard let user = Auth.auth().currentUser else { throw Self.notSignedIn }
        try await user.link(with: try await googleCredential())
    }
    func linkApple(idToken: String, rawNonce: String, fullName: PersonNameComponents?) async throws {
        guard let user = Auth.auth().currentUser else { throw Self.notSignedIn }
        let credential = OAuthProvider.appleCredential(withIDToken: idToken, rawNonce: rawNonce, fullName: fullName)
        try await user.link(with: credential)
    }
    private static let notSignedIn = NSError(domain: "auth", code: 9,
        userInfo: [NSLocalizedDescriptionKey: "請先登入"])

    // MARK: Sign in with Apple (Firebase credential)
    func signInWithApple(idToken: String, rawNonce: String, fullName: PersonNameComponents?) async throws -> Result {
        let credential = OAuthProvider.appleCredential(
            withIDToken: idToken, rawNonce: rawNonce, fullName: fullName)
        let authResult = try await Auth.auth().signIn(with: credential)
        return Result(uid: authResult.user.uid, email: authResult.user.email)
    }

    func signOut() {
        try? Auth.auth().signOut()
        GIDSignIn.sharedInstance.signOut()
    }

    // MARK: Nonce helpers (required so Apple's idToken can't be replayed)
    static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remaining = length
        while remaining > 0 {
            var random: UInt8 = 0
            _ = SecRandomCopyBytes(kSecRandomDefault, 1, &random)
            if random < charset.count { result.append(charset[Int(random)]); remaining -= 1 }
        }
        return result
    }

    static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    @MainActor
    static func topViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene
        var top = scene?.keyWindow?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}
