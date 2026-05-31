import Foundation
import FirebaseFirestore
import RevenueCat

/// Profile/credits in Firestore + RevenueCat IAP (mirrors billingService.ts).
final class BillingService {
    private var db: Firestore { Firestore.firestore(database: Config.firestoreDatabase) }

    // MARK: RevenueCat
    func configure(uid: String) async {
        Purchases.logLevel = .warn
        if Purchases.isConfigured == false {
            Purchases.configure(withAPIKey: Config.revenueCatAPIKey, appUserID: uid)
        } else {
            _ = try? await Purchases.shared.logIn(uid)
        }
    }

    func offerings() async throws -> Offerings { try await Purchases.shared.offerings() }

    /// Purchase a package; the RevenueCat webhook credits Firestore server-side.
    func purchase(_ package: Package) async throws {
        _ = try await Purchases.shared.purchase(package: package)
    }

    func restore() async throws { _ = try await Purchases.shared.restorePurchases() }

    // MARK: Firestore profile
    func loadOrCreateProfile(uid: String, email: String?) async throws -> UserProfile {
        let ref = db.collection("users").document(uid)
        let snap = try await ref.getDocument()
        if snap.exists, let p = try? snap.data(as: UserProfile.self) {
            return p
        }
        // New signed-in user: grant free starter minutes.
        let isAdmin = email == Config.adminEmail
        let profile = UserProfile(
            uid: uid, email: email, plan: .free,
            creditMinutes: Config.freeStarterMinutes,
            subscriptionStatus: .none, isAdmin: isAdmin
        )
        try ref.setData(from: profile)
        return profile
    }

    func fetchProfile(uid: String) async throws -> UserProfile {
        try await db.collection("users").document(uid).getDocument(as: UserProfile.self)
    }

    func setCredit(uid: String, minutes: Int) async throws {
        try await db.collection("users").document(uid)
            .updateData(["creditMinutes": minutes, "updatedAt": Date().timeIntervalSince1970 * 1000])
    }

    // MARK: Usage history (mirrors adminService.logUsage)
    func logUsage(uid: String, email: String?, fileName: String, durationMinutes: Int,
                  model: String?, charCount: Int, transcript: String) async {
        let preview = String(transcript.prefix(280))
        let meta: [String: Any] = [
            "uid": uid, "email": email ?? NSNull(), "fileName": fileName,
            "durationMinutes": durationMinutes, "model": model ?? "",
            "charCount": charCount, "preview": preview,
            "createdAt": Date().timeIntervalSince1970 * 1000,
        ]
        do {
            let ref = try await db.collection("usageLogs").addDocument(data: meta)
            try await db.collection("transcripts").document(ref.documentID)
                .setData(["uid": uid, "text": String(transcript.prefix(100_000)),
                          "createdAt": Date().timeIntervalSince1970 * 1000])
        } catch { /* best-effort */ }
    }

    func history(uid: String) async throws -> [UsageLog] {
        let snap = try await db.collection("usageLogs")
            .whereField("uid", isEqualTo: uid)
            .order(by: "createdAt", descending: true)
            .limit(to: 100)
            .getDocuments()
        return snap.documents.compactMap { d in
            let x = d.data()
            return UsageLog(
                id: d.documentID,
                fileName: x["fileName"] as? String ?? "",
                durationMinutes: x["durationMinutes"] as? Int ?? 0,
                model: x["model"] as? String,
                charCount: x["charCount"] as? Int ?? 0,
                preview: x["preview"] as? String ?? "",
                createdAt: x["createdAt"] as? Double ?? 0
            )
        }
    }

    func fullTranscript(id: String) async throws -> String {
        let snap = try await db.collection("transcripts").document(id).getDocument()
        return snap.data()?["text"] as? String ?? ""
    }
}
