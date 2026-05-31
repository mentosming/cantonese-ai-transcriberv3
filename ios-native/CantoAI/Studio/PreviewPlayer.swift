import SwiftUI
import AVFoundation

/// AVPlayer wrapper publishing playback time for the live caption overlay.
@MainActor
final class PreviewPlayer: ObservableObject {
    @Published var time: Double = 0
    @Published var isPlaying = false
    let avPlayer = AVPlayer()
    private var observer: Any?
    private var loadedURL: URL?

    func load(_ url: URL) {
        guard loadedURL != url else { return }
        loadedURL = url
        avPlayer.replaceCurrentItem(with: AVPlayerItem(url: url))
        if observer == nil {
            observer = avPlayer.addPeriodicTimeObserver(
                forInterval: CMTime(value: 1, timescale: 30), queue: .main
            ) { [weak self] t in
                self?.time = CMTimeGetSeconds(t)
            }
        }
    }

    func toggle() {
        if isPlaying { avPlayer.pause() } else { avPlayer.play() }
        isPlaying.toggle()
    }
}

/// Hosts an AVPlayerLayer so we can overlay SwiftUI captions on top.
struct PlayerLayerView: UIViewRepresentable {
    let player: AVPlayer
    func makeUIView(context: Context) -> PlayerUIView { PlayerUIView(player: player) }
    func updateUIView(_ uiView: PlayerUIView, context: Context) {}
}

final class PlayerUIView: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    private var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    init(player: AVPlayer) {
        super.init(frame: .zero)
        playerLayer.player = player
        playerLayer.videoGravity = .resizeAspect
        backgroundColor = .black
    }
    required init?(coder: NSCoder) { fatalError() }
}

/// A muted, auto-looping video — used for live PiP overlay previews.
struct LoopingVideoView: UIViewRepresentable {
    let url: URL
    func makeUIView(context: Context) -> LoopingPlayerUIView { LoopingPlayerUIView(url: url) }
    func updateUIView(_ uiView: LoopingPlayerUIView, context: Context) {}
}

final class LoopingPlayerUIView: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    private var looper: AVPlayerLooper?
    init(url: URL) {
        super.init(frame: .zero)
        let item = AVPlayerItem(url: url)
        let queue = AVQueuePlayer()
        queue.isMuted = true
        looper = AVPlayerLooper(player: queue, templateItem: item)
        let pl = layer as! AVPlayerLayer
        pl.player = queue
        pl.videoGravity = .resizeAspectFill
        queue.play()
    }
    required init?(coder: NSCoder) { fatalError() }
}
