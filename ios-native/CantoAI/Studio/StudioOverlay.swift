import Foundation
import CoreGraphics

/// A picture-in-picture overlay layer (video or image) shown on top of the base
/// video within a time window. Mirrors the web OverlayLayer.
struct StudioOverlay: Identifiable, Equatable {
    enum Kind { case video, image }
    let id = UUID()
    var kind: Kind
    var url: URL
    var natSize: CGSize
    var pos: String        // tl, tr, bl, br, c
    var size: Double       // width as a fraction of the canvas
    var start: Double = 0
    var end: Double = 0    // 0 = until the end

    func active(at t: Double) -> Bool { t >= start && (end <= 0 || t <= end) }
}

/// Top-left-origin rect for an overlay on a W×H canvas (matches web overlayRect).
func overlayRectTL(_ o: StudioOverlay, _ W: CGFloat, _ H: CGFloat) -> CGRect {
    let w = max(1, CGFloat(o.size) * W)
    let aspect = o.natSize.width > 0 ? o.natSize.height / o.natSize.width : 9.0 / 16.0
    let h = w * aspect
    let mx = 0.03 * W, my = 0.03 * H
    var x: CGFloat = 0, y: CGFloat = 0
    switch o.pos {
    case "tl": x = mx; y = my
    case "tr": x = W - mx - w; y = my
    case "bl": x = mx; y = H - my - h
    case "br": x = W - mx - w; y = H - my - h
    default:   x = (W - w) / 2; y = (H - h) / 2
    }
    return CGRect(x: x, y: y, width: w, height: h)
}
