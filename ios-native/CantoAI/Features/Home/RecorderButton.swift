import SwiftUI
import AVFoundation

/// Microphone recorder → produces an m4a file (mirrors the web VoiceRecorder).
struct RecorderButton: View {
    var onRecorded: (URL) -> Void
    @StateObject private var rec = Recorder()

    var body: some View {
        HStack(spacing: 12) {
            Button {
                if rec.isRecording { rec.stop { url in if let url { onRecorded(url) } } }
                else { rec.start() }
            } label: {
                Image(systemName: rec.isRecording ? "stop.fill" : "mic.fill")
                    .font(.title3).foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(rec.isRecording ? Theme.ink : Color.red)
                    .clipShape(Circle())
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(rec.isRecording ? "錄音中" : "麥克風錄音").font(.subheadline).fontWeight(.medium)
                Text(rec.isRecording ? rec.timeString : "錄音轉文字 / 字幕")
                    .font(.caption).foregroundStyle(Theme.inkMuted)
            }
            Spacer()
        }
        .padding(12)
        .background(Theme.sunk)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

@MainActor
final class Recorder: ObservableObject {
    @Published var isRecording = false
    @Published var seconds = 0
    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private var url: URL?

    var timeString: String { String(format: "%02d:%02d", seconds / 60, seconds % 60) }

    func start() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .default)
        session.requestRecordPermission { [weak self] granted in
            guard granted else { return }
            Task { @MainActor in self?.begin() }
        }
    }

    private func begin() {
        try? AVAudioSession.sharedInstance().setActive(true)
        let dest = FileManager.default.temporaryDirectory.appendingPathComponent("rec-\(Int(Date().timeIntervalSince1970)).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        ]
        recorder = try? AVAudioRecorder(url: dest, settings: settings)
        recorder?.record()
        url = dest; isRecording = true; seconds = 0
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.seconds += 1 }
        }
    }

    func stop(_ completion: (URL?) -> Void) {
        recorder?.stop(); timer?.invalidate(); isRecording = false
        completion(url)
    }
}
