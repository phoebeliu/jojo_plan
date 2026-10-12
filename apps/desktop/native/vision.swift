import Foundation
import Vision
import ImageIO
struct Box: Codable { let x: Double; let y: Double; let width: Double; let height: Double }
struct Line: Codable { let text: String; let confidence: Float; let box: Box }
struct Result: Codable { let parser: String; let lines: [Line]; let faces: Int; let width: Int; let height: Int }
guard CommandLine.arguments.count == 2 else { exit(2) }
let url = URL(fileURLWithPath: CommandLine.arguments[1])
do {
    guard let image = CGImageSourceCreateWithURL(url as CFURL, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(image, 0, nil) as? [String: Any],
          let width = properties[kCGImagePropertyPixelWidth as String] as? Int,
          let height = properties[kCGImagePropertyPixelHeight as String] as? Int,
          width > 0, height > 0, width * height <= 25_000_000 else { exit(3) }
    let text = VNRecognizeTextRequest()
    text.recognitionLevel = .accurate
    text.recognitionLanguages = ["en-US", "zh-Hans"]
    text.usesLanguageCorrection = false
    let faces = VNDetectFaceRectanglesRequest()
    let handler = VNImageRequestHandler(url: url, options: [:])
    try handler.perform([text, faces])
    let lines = (text.results ?? []).prefix(1000).compactMap { observation -> Line? in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let b = observation.boundingBox
        return Line(text: candidate.string, confidence: candidate.confidence, box: Box(x: b.origin.x, y: b.origin.y, width: b.size.width, height: b.size.height))
    }
    let result = Result(parser: "apple-vision/1", lines: lines, faces: faces.results?.count ?? 0, width: width, height: height)
    FileHandle.standardOutput.write(try JSONEncoder().encode(result))
} catch {
    FileHandle.standardError.write(Data("VISION_PARSE_FAILED".utf8))
    exit(4)
}
