import AVFoundation
import UIKit

/// Render a still image into a short silent H.264 video so it can be inserted
/// into an AVMutableComposition timeline (AVFoundation can't put a raw image on
/// a video track). The image is cover-fit onto the given render size.
enum ImageVideoMaker {
    static func make(image: UIImage, size: CGSize, seconds: Double) async throws -> URL {
        let dest = FileManager.default.temporaryDirectory.appendingPathComponent("img-\(UUID().uuidString).mp4")
        try? FileManager.default.removeItem(at: dest)

        let writer = try AVAssetWriter(outputURL: dest, fileType: .mp4)
        let settings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: Int(size.width),
            AVVideoHeightKey: Int(size.height),
        ]
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        input.expectsMediaDataInRealTime = false
        let attrs: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
            kCVPixelBufferWidthKey as String: Int(size.width),
            kCVPixelBufferHeightKey as String: Int(size.height),
        ]
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attrs)
        writer.add(input)
        writer.startWriting()
        writer.startSession(atSourceTime: .zero)

        guard let buffer = pixelBuffer(from: image, size: size, attrs: attrs) else {
            throw NSError(domain: "img", code: 0, userInfo: [NSLocalizedDescriptionKey: "相片轉換失敗"])
        }

        let fps: Int32 = 30
        let frames = max(1, Int(seconds * Double(fps)))
        var frame = 0
        while frame < frames {
            if input.isReadyForMoreMediaData {
                let t = CMTime(value: CMTimeValue(frame), timescale: fps)
                adaptor.append(buffer, withPresentationTime: t)
                frame += 1
            } else {
                try? await Task.sleep(nanoseconds: 5_000_000)
            }
        }
        input.markAsFinished()
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            writer.finishWriting { cont.resume() }
        }
        return dest
    }

    private static func pixelBuffer(from image: UIImage, size: CGSize, attrs: [String: Any]) -> CVPixelBuffer? {
        var pb: CVPixelBuffer?
        CVPixelBufferCreate(kCFAllocatorDefault, Int(size.width), Int(size.height),
                            kCVPixelFormatType_32ARGB, attrs as CFDictionary, &pb)
        guard let buffer = pb else { return nil }
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        let ctx = CGContext(
            data: CVPixelBufferGetBaseAddress(buffer),
            width: Int(size.width), height: Int(size.height),
            bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
        )
        guard let ctx, let cg = image.cgImage else { return nil }
        ctx.setFillColor(UIColor.black.cgColor)
        ctx.fill(CGRect(origin: .zero, size: size))
        // Cover-fit (center crop).
        let iw = CGFloat(cg.width), ih = CGFloat(cg.height)
        let scale = max(size.width / iw, size.height / ih)
        let dw = iw * scale, dh = ih * scale
        ctx.draw(cg, in: CGRect(x: (size.width - dw) / 2, y: (size.height - dh) / 2, width: dw, height: dh))
        return buffer
    }
}
