import SwiftUI

/// Design tokens mirroring the web app's "Modern Light Studio" (light teal) look.
enum Theme {
    // Brand
    static let teal       = Color(hex: 0x14B8A6)   // teal-500
    static let tealDeep   = Color(hex: 0x0D9488)   // teal-600
    static let tealSoft   = Color(hex: 0xCCFBF1)   // teal-100
    static let fuchsia    = Color(hex: 0xD946EF)   // accent for AI features

    // Surfaces (light)
    static let canvas     = Color(hex: 0xF5F6F4)
    static let surface    = Color.white
    static let sunk       = Color(hex: 0xECEEEA)

    // Ink (text)
    static let ink        = Color(hex: 0x1A1D1B)
    static let inkMuted   = Color(hex: 0x5B635E)
    static let inkFaint   = Color(hex: 0x9AA29C)
    static let line       = Color(hex: 0xE3E6E1)

    // Studio (dark)
    static let studioBg   = Color(hex: 0x0B0F0D)
    static let studioPanel = Color(hex: 0x0E1412)
}

extension Color {
    init(hex: UInt, alpha: Double = 1) {
        self.init(
            .sRGB,
            red:   Double((hex >> 16) & 0xff) / 255,
            green: Double((hex >> 8) & 0xff) / 255,
            blue:  Double(hex & 0xff) / 255,
            opacity: alpha
        )
    }
}

// MARK: - Reusable components

/// Primary filled button (teal).
struct PrimaryButton: View {
    let title: String
    var systemImage: String? = nil
    var loading: Bool = false
    var disabled: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if loading { ProgressView().tint(.white) }
                else if let s = systemImage { Image(systemName: s) }
                Text(title).fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity).frame(height: 50)
            .background(disabled || loading ? Theme.teal.opacity(0.5) : Theme.teal)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .disabled(disabled || loading)
    }
}

/// Card container.
struct Card<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(16)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.line, lineWidth: 1))
            .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
    }
}

/// Small section header like "01 上載影音".
struct SectionHeader: View {
    let index: String
    let title: String
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(index).font(.system(.headline, design: .rounded)).bold().foregroundStyle(Theme.teal)
            Text(title.uppercased())
                .font(.caption).fontWeight(.semibold).tracking(2)
                .foregroundStyle(Theme.inkMuted)
            Spacer()
        }
        .padding(.bottom, 6)
        .overlay(Rectangle().frame(height: 1).foregroundStyle(Theme.line), alignment: .bottom)
    }
}
