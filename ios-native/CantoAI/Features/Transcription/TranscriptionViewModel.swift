import Foundation
import AVFoundation

@MainActor
final class TranscriptionViewModel: ObservableObject {
    @Published var transcript = ""
    @Published var status: Status = .idle
    @Published var error: String?

    enum Status { case idle, running, done, stopped, failed }
    enum Source: Hashable { case file(URL); case url(String) }
    var isRunning: Bool { status == .running }

    private var task: Task<Void, Never>?

    func start(source: Source, settings: TranscriptionSettings, app: AppState) {
        // For files we know the duration up-front; for URLs we meter afterwards
        // from the transcript's last timestamp.
        let upfront: Int = { if case .file(let u) = source { return Self.billableMinutes(for: u) } else { return 1 } }()
        let check = app.checkEntitlement(minutes: upfront)
        guard check.allowed else { error = check.message ?? "額度不足"; status = .failed; return }

        transcript = ""; error = nil; status = .running
        task = Task {
            do {
                let name: String
                switch source {
                case .file(let url):
                    name = url.lastPathComponent
                    try await APIClient.shared.transcribeFile(fileURL: url, settings: settings) { chunk in
                        Task { @MainActor in self.transcript += chunk }
                    }
                case .url(let link):
                    name = link
                    try await APIClient.shared.transcribeURL(link, settings: settings) { chunk in
                        Task { @MainActor in self.transcript += chunk }
                    }
                }
                if Task.isCancelled { status = .stopped; return }
                status = .done
                // Meter from known duration (file) or transcript timestamps (url).
                let minutes: Int = {
                    if case .file = source { return upfront }
                    let cues = SubtitleUtil.transcriptToCues(transcript)
                    let seconds = cues.last?.end ?? 0
                    return max(0, Int(ceil(seconds / 60)))
                }()
                await app.consume(minutes: minutes)
                if let p = app.profile {
                    await app.billing.logUsage(
                        uid: p.uid, email: p.email, fileName: name,
                        durationMinutes: minutes, model: settings.model,
                        charCount: transcript.count, transcript: transcript)
                }
            } catch is CancellationError {
                status = .stopped
            } catch {
                self.error = error.localizedDescription
                status = .failed
            }
        }
    }

    func stop() { task?.cancel(); status = .stopped }

    static func billableMinutes(for url: URL) -> Int {
        let asset = AVURLAsset(url: url)
        let seconds = CMTimeGetSeconds(asset.duration)
        guard seconds.isFinite, seconds > 0 else { return 1 }
        return max(1, Int(ceil(seconds / 60)))
    }
}
