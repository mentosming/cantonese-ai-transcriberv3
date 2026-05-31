import Foundation

/// An extra clip appended after the main (subtitle) video on the timeline.
struct TimelineClip: Identifiable, Equatable {
    enum Kind { case video, image }
    let id = UUID()
    var kind: Kind
    var url: URL          // video file, or image file
    var name: String
    var duration: Double  // video: full duration; image: chosen seconds
}
