import Foundation
import SwiftUI

/// Global app state: auth, profile/entitlement, and convenience gating.
@MainActor
final class AppState: ObservableObject {
    @Published var profile: UserProfile?
    @Published var isSignedIn = false
    @Published var booting = true
    @Published var linkedProviders: [String] = []

    private let auth = AuthService()
    let billing = BillingService()

    var isAdmin: Bool { profile?.isAdmin ?? false }
    /// Entitled to paid features: admin, active subscription, or has credit.
    var isPro: Bool {
        guard let p = profile else { return false }
        return p.isAdmin || p.subscriptionStatus == .active || p.creditMinutes > 0
    }
    var creditMinutes: Int { profile?.creditMinutes ?? 0 }

    func bootstrap() async {
        if let uid = auth.currentUID {
            await loadProfile(uid: uid, email: auth.currentEmail)
            isSignedIn = true
        }
        booting = false
    }

    func signIn() async throws {
        let result = try await auth.signInWithGoogle()
        await loadProfile(uid: result.uid, email: result.email)
        await billing.configure(uid: result.uid)
        isSignedIn = true
    }

    func signInWithApple(idToken: String, rawNonce: String, fullName: PersonNameComponents?) async throws {
        let result = try await auth.signInWithApple(idToken: idToken, rawNonce: rawNonce, fullName: fullName)
        await loadProfile(uid: result.uid, email: result.email)
        await billing.configure(uid: result.uid)
        isSignedIn = true
    }

    func signOut() {
        auth.signOut()
        profile = nil
        isSignedIn = false
    }

    private func loadProfile(uid: String, email: String?) async {
        do {
            profile = try await billing.loadOrCreateProfile(uid: uid, email: email)
            await billing.configure(uid: uid)
        } catch {
            // Minimal fallback profile so the UI still works offline.
            profile = UserProfile(uid: uid, email: email,
                                  creditMinutes: 0,
                                  isAdmin: email == Config.adminEmail)
        }
        linkedProviders = auth.linkedProviderIDs
    }

    // MARK: Account linking (connect the other provider to the same uid)
    func linkGoogle() async throws {
        try await auth.linkGoogle()
        linkedProviders = auth.linkedProviderIDs
    }
    func linkApple(idToken: String, rawNonce: String, fullName: PersonNameComponents?) async throws {
        try await auth.linkApple(idToken: idToken, rawNonce: rawNonce, fullName: fullName)
        linkedProviders = auth.linkedProviderIDs
    }

    /// Poll Firestore after a purchase until the webhook has credited the account
    /// (RevenueCat → server → Firestore is async, a few seconds).
    func awaitEntitlementUpdate(previousMinutes: Int, wasActive: Bool, tries: Int = 8) async {
        for _ in 0..<tries {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            await refreshProfile()
            if let p = profile, p.creditMinutes > previousMinutes || (!wasActive && p.subscriptionStatus == .active) {
                return
            }
        }
    }

    // MARK: Entitlement
    func checkEntitlement(minutes: Int) -> EntitlementCheck {
        guard let p = profile else { return .init(allowed: false, remainingMinutes: 0, message: "請先登入") }
        if p.isAdmin || p.subscriptionStatus == .active {
            return .init(allowed: true, remainingMinutes: 9_999)
        }
        if p.creditMinutes >= minutes {
            return .init(allowed: true, remainingMinutes: p.creditMinutes)
        }
        return .init(allowed: false, remainingMinutes: p.creditMinutes, message: "額度不足，請購買或訂閱。")
    }

    func consume(minutes: Int) async {
        guard let p = profile, !p.isAdmin, p.subscriptionStatus != .active, minutes > 0 else { return }
        let remaining = max(0, p.creditMinutes - minutes)
        profile?.creditMinutes = remaining
        try? await billing.setCredit(uid: p.uid, minutes: remaining)
    }

    func refreshProfile() async {
        guard let uid = profile?.uid else { return }
        if let fresh = try? await billing.fetchProfile(uid: uid) { profile = fresh }
    }
}
