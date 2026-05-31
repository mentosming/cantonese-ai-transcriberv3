import AVFoundation

/// Export a media file's audio track to a compact .m4a so long videos upload
/// small for transcription (mirrors the web extractAudio step).
enum AudioExtractor {
    static func extractM4A(from url: URL) async throws -> URL {
        let asset = AVURLAsset(url: url)
        guard let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
            return url
        }
        let dest = FileManager.default.temporaryDirectory.appendingPathComponent("audio-\(UUID().uuidString).m4a")
        export.outputURL = dest
        export.outputFileType = .m4a
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            export.exportAsynchronously { cont.resume() }
        }
        return export.status == .completed ? dest : url
    }
}
