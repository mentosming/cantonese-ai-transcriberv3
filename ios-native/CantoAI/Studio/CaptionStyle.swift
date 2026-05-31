import SwiftUI

/// Caption appearance (mirrors the web captionRenderer style model).
struct CaptionStyle {
    enum Pos: String, CaseIterable { case top, middle, bottom }
    enum Anim: String, CaseIterable { case none, fade, pop, slide }

    var fontName: String = "PingFangHK-Semibold"
    var fontFraction: CGFloat = 0.058     // size as fraction of video height
    var color: Color = .white
    var strokeColor: Color = .black
    var highlightColor: Color = Color(hex: 0x34C3AC)  // emphasis words
    var pos: Pos = .bottom
    var animation: Anim = .none

    static let fonts: [(id: String, name: String, font: String)] = [
        ("sans", "黑體", "PingFangHK-Semibold"),
        ("serif", "宋體", "STSongti-TC-Bold"),
        ("round", "圓體", "PingFangHK-Medium"),
        ("hand", "手寫", "HannotateTC-W7"),
    ]
    static let sizes: [(id: String, name: String, f: CGFloat)] = [
        ("s", "細", 0.045), ("m", "中", 0.058), ("l", "大", 0.072), ("xl", "特大", 0.09),
    ]
}

/// Output aspect ratios for social reframe.
enum OutputAspect: String, CaseIterable, Identifiable {
    case original = "原片", r9_16 = "9:16", r1_1 = "1:1", r16_9 = "16:9"
    var id: String { rawValue }
    func size(for natural: CGSize) -> CGSize {
        switch self {
        case .original: return natural
        case .r9_16: return CGSize(width: 1080, height: 1920)
        case .r1_1:  return CGSize(width: 1080, height: 1080)
        case .r16_9: return CGSize(width: 1920, height: 1080)
        }
    }
    var isReframe: Bool { self != .original }
}
