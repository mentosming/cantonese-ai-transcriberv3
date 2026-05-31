import SwiftUI
import FirebaseCore
import GoogleSignIn

@main
struct CantoAIApp: App {
    @StateObject private var app = AppState()

    init() {
        // Requires GoogleService-Info.plist in the app target.
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(app)
                .tint(Theme.teal)
                .onOpenURL { url in GIDSignIn.sharedInstance.handle(url) }
                .task { await app.bootstrap() }
        }
    }
}

/// Switches between the signed-out gate and the main app.
struct RootView: View {
    @EnvironmentObject var app: AppState
    var body: some View {
        Group {
            if app.isSignedIn {
                HomeView()
            } else {
                SignInView()
            }
        }
        .animation(.default, value: app.isSignedIn)
    }
}
