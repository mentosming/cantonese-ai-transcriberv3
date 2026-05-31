import Foundation
import SwiftUI
import Combine
import AVFoundation

struct TranscriptionLine: Identifiable {
    let id = UUID()
    let timeRange: String
    let originalSpeaker: String?
    let displayName: String
    let content: String
    
    // For SRT format (HH:MM:SS,mmm)
    func srtTimestamp(isEnd: Bool) -> String {
        let parts = timeRange.components(separatedBy: " - ")
        let timeStr = isEnd ? (parts.count > 1 ? parts[1] : parts[0]) : parts[0]
        let components = timeStr.components(separatedBy: ":")
        if components.count == 2 {
            return "00:\(components[0]):\(components[1]),000"
        }
        return "00:00:00,000"
    }
}

struct TranscriptionItem: Identifiable, Codable {
    var id = UUID()
    var text: String
    var timestamp: Date
    var title: String?
    var audioFilename: String? // Local path
    var summary: String?
}

@MainActor
class TranscriberViewModel: ObservableObject {
    // UI State
    @Published var transcriptionText: String = ""
    @Published var aiAnalysisResult: String = ""
    @Published var history: [TranscriptionItem] = []
    @Published var isProcessing: Bool = false
    @Published var processingProgress: Double = 0.0
    @Published var statusMessage: String = "準備就緒"
    
    // Recording & Playback State
    @Published var isRecording: Bool = false
    @Published var recordingDuration: TimeInterval = 0
    @Published var isPlaying: Bool = false
    @Published var playProgress: Double = 0
    @Published var showReviewPanel: Bool = false
    @Published var currentAudioURL: URL?
    
    // Settings (AppStorage for persistence)
    @AppStorage("selectedLanguagesString") var selectedLanguagesString: String = "Cantonese"

    @AppStorage("enableTimestamps") var enableTimestamps: Bool = true
    @AppStorage("summaryPercentage") var summaryPercentage: Int = 80
    @AppStorage("isDarkMode") var isDarkMode: Bool = false
    @Published var numSpeakers: Int = 1
    @Published var speakerNames: [String] = ["Speaker 1"]
    // Stores mapping from "Speaker 1" to "John", etc.
    @Published var customSpeakerMap: [String: String] = [:]
    @Published var customGoal: String = ""
    
    // Computed property to parse lines for table view
    var parsedLines: [TranscriptionLine] {
        let raw = transcriptionText.replacingOccurrences(of: "DEBUG: [^\\n]*\\n?", with: "", options: .regularExpression)
        let lines = raw.components(separatedBy: .newlines).filter { !$0.isEmpty }
        
        var result: [TranscriptionLine] = []
        // Regex pattern: [MM:SS - MM:SS] (Speaker:)? Content
        let pattern = #"\[(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})\]\s*(?:([^:]+):\s*)?(.*)"#
        
        for line in lines {
            if let regex = try? NSRegularExpression(pattern: pattern),
               let match = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)) {
                let timeRange = String(line[Range(match.range(at: 1), in: line)!])
                let speaker = match.range(at: 2).location != NSNotFound ? String(line[Range(match.range(at: 2), in: line)!]) : nil
                let content = String(line[Range(match.range(at: 3), in: line)!])
                
                // If AI provided a speaker name
                let finalRawSpeaker = speaker?.trimmingCharacters(in: .whitespaces) ?? "Speaker 1"
                
                // Apply custom name from map if exists
                let displayName = customSpeakerMap[finalRawSpeaker] ?? finalRawSpeaker
                
                result.append(TranscriptionLine(
                    timeRange: timeRange,
                    originalSpeaker: finalRawSpeaker,
                    displayName: displayName,
                    content: content
                ))
            } else {
                // Fallback for lines without timestamps
                result.append(TranscriptionLine(
                    timeRange: "",
                    originalSpeaker: "Speaker 1",
                    displayName: customSpeakerMap["Speaker 1"] ?? "Speaker 1",
                    content: line
                ))
            }
        }
        return result
    }
    
    private var timer: AnyCancellable?
    private var playbackTimer: AnyCancellable?
    private let apiService = GeminiService()
    private let audioRecorder = AudioRecorder()
    private var audioPlayer: AVAudioPlayer?
    private let haptics = HapticManager.shared

    init() {
        loadHistory()
    }

    // MARK: - Recording
    func startRecording() {
        haptics.triggerImpact(style: .heavy)
        do {
            try audioRecorder.startRecording()
            isRecording = true
            recordingDuration = 0
            timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect().sink { [weak self] _ in
                self?.recordingDuration += 1
            }
            statusMessage = "錄音中..."
            showReviewPanel = false
        } catch {
            statusMessage = "錄音失敗"
        }
    }

    func stopRecording() {
        haptics.triggerImpact(style: .medium)
        timer?.cancel()
        isRecording = false
        audioRecorder.stopRecording()
        
        if let url = audioRecorder.audioFileURL {
            self.currentAudioURL = url
            self.showReviewPanel = true
            self.statusMessage = "已錄音完成，請預約或更改後提交"
        }
    }
    
    // MARK: - File Import
    func importAudio(from url: URL) {
        // Copy to local app directory for privacy & persistence
        let fileManager = FileManager.default
        let documents = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let destinationURL = documents.appendingPathComponent(url.lastPathComponent)
        
        do {
            if fileManager.fileExists(atPath: destinationURL.path) {
                try fileManager.removeItem(at: destinationURL)
            }
            try fileManager.copyItem(at: url, to: destinationURL)
            self.currentAudioURL = destinationURL
            self.showReviewPanel = true
            self.statusMessage = "檔案匯入成功"
            haptics.triggerNotification(type: .success)
        } catch {
            print("Import failed: \(error)")
            statusMessage = "檔案匯入失敗"
        }
    }

    // MARK: - Playback
    func togglePlayback() {
        guard let url = currentAudioURL else { return }
        
        if isPlaying {
            audioPlayer?.pause()
            isPlaying = false
            playbackTimer?.cancel()
        } else {
            do {
                if audioPlayer == nil || audioPlayer?.url != url {
                    audioPlayer = try AVAudioPlayer(contentsOf: url)
                    audioPlayer?.prepareToPlay()
                }
                audioPlayer?.play()
                isPlaying = true
                
                playbackTimer = Timer.publish(every: 0.1, on: .main, in: .common).autoconnect().sink { [weak self] _ in
                    guard let player = self?.audioPlayer else { return }
                    self?.playProgress = player.currentTime / player.duration
                    if !player.isPlaying {
                        self?.isPlaying = false
                        self?.playbackTimer?.cancel()
                        self?.playProgress = 0
                    }
                }
            } catch {
                print("Playback error: \(error)")
            }
        }
    }

    // MARK: - Transcription
    func submitTranscription() {
        guard let url = currentAudioURL else { return }
        
        // Stop playback if playing
        if isPlaying { togglePlayback() }
        
        isProcessing = true
        processingProgress = 0.05
        transcriptionText = "" // Clear for streaming
        statusMessage = "正在連線 AI 伺服器..."
        showReviewPanel = false
        
        let userLangs = selectedLanguagesString.components(separatedBy: ",").filter { !$0.isEmpty }
        let finalLangs = Array(Set(userLangs))
        
        let settings = TranscribeSettings(
            language: finalLangs,
            enableTimestamps: enableTimestamps,
            numSpeakers: numSpeakers,
            speakerNames: speakerNames,
            summaryPercentage: summaryPercentage,
            customGoal: customGoal
        )
        
        Task {
            let stream = apiService.transcribeAudioStream(fileURL: url, fileName: url.lastPathComponent, settings: settings)
            
            for await textChunk in stream {
                await MainActor.run {
                    self.transcriptionText += textChunk
                    
                    // Increment progress slightly for each chunk
                    if self.processingProgress < 0.85 {
                        self.processingProgress += 0.015
                    }
                    
                    if textChunk.contains("DEBUG:") {
                        self.statusMessage = "伺服器已回應，準備開始轉錄..."
                    } else if self.processingProgress < 0.85 {
                        self.statusMessage = "正在轉錄音訊內容..."
                    } else if self.processingProgress >= 0.85 {
                        self.statusMessage = "轉錄完成，正在進行深度 AI 分析與總結..."
                        self.processingProgress = min(0.98, self.processingProgress + 0.005)
                    }
                    
                    if textChunk.contains("API ERROR") {
                        self.statusMessage = "❌ 轉錄出錯 (詳情見下方)"
                    }
                }
            }
            
            await MainActor.run {
                self.addTranscription(text: self.transcriptionText, audioURL: url)
                self.processingProgress = 1.0
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    self.isProcessing = false
                    self.statusMessage = "轉錄完成"
                }
                self.haptics.triggerNotification(type: .success)
            }
        }
    }

    func submitYouTube(url: String) {
        guard !url.isEmpty else { return }
        if isPlaying { togglePlayback() }
        
        isProcessing = true
        processingProgress = 0.05
        transcriptionText = ""
        statusMessage = "正在連接 YouTube 處理伺服器..."
        showReviewPanel = false
        haptics.triggerSelection()
        
        let userLangs = selectedLanguagesString.components(separatedBy: ",").filter { !$0.isEmpty }
        let finalLangs = Array(Set(userLangs))
        
        let settings = TranscribeSettings(
            language: finalLangs,
            enableTimestamps: enableTimestamps,
            numSpeakers: numSpeakers,
            speakerNames: speakerNames,
            summaryPercentage: summaryPercentage,
            customGoal: customGoal
        )
        
        Task {
            let stream = apiService.transcribeYouTubeStream(url: url, settings: settings)
            
            for await textChunk in stream {
                await MainActor.run {
                    self.transcriptionText += textChunk
                    
                    // Progress for YouTube
                    if self.processingProgress < 0.85 {
                        self.processingProgress += 0.01
                    }
                    
                    if textChunk.contains("DEBUG:") {
                        self.statusMessage = "正在從伺服器抓取 YouTube 內容..."
                    } else if self.processingProgress < 0.85 {
                        self.statusMessage = "正在分析影片內容中..."
                    } else if self.processingProgress >= 0.85 {
                        self.statusMessage = "內容已處理，正在總結分析..."
                        self.processingProgress = min(0.98, self.processingProgress + 0.005)
                    }
                }
            }
            
            await MainActor.run {
                self.addTranscription(text: self.transcriptionText, audioURL: nil)
                self.processingProgress = 1.0
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    self.isProcessing = false
                    self.statusMessage = "YouTube 轉錄完成"
                }
                self.haptics.triggerNotification(type: .success)
            }
        }
    }


    func reanalyze(item: TranscriptionItem?) {
        print("🧠 ViewModel: Starting Re-analysis for item: \(item?.id.uuidString ?? "nil")")
        guard let item = item else { return }
        
        Task { @MainActor in
            self.isProcessing = true
            self.processingProgress = 0.05
            self.aiAnalysisResult = ""
            
            // Priority: If text exists, use the NEW fast Text-to-Analysis mode
            if !item.text.isEmpty {
                print("📝 Found existing text, using Text-to-Analysis mode.")
                self.transcriptionText = item.text
                self.submitAnalysis(text: item.text)
                return
            }
            
            // Fallback: If no text, we must re-transcribe from audio
            if let filename = item.audioFilename {
                let fileManager = FileManager.default
                let documents = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
                let url = documents.appendingPathComponent(filename)
                
                if fileManager.fileExists(atPath: url.path) {
                    print("🎵 Found audio file, re-transcribing...")
                    self.currentAudioURL = url
                    self.submitTranscription()
                    return
                }
            }
            
            print("⚠️ Re-analysis: Falling back to submitTranscription")
            self.submitTranscription() 
        }
    }

    func submitAnalysis(text: String) {
        guard !text.isEmpty else { return }
        
        isProcessing = true
        processingProgress = 0.05
        aiAnalysisResult = ""
        statusMessage = "正在連線 AI 分析師..."
        
        let settings = TranscribeSettings(
            summaryPercentage: summaryPercentage,
            customGoal: customGoal
        )
        
        Task {
            let stream = apiService.analyzeTextStream(text: text, settings: settings)
            
            for await textChunk in stream {
                await MainActor.run {
                    self.aiAnalysisResult += textChunk
                    
                    if self.processingProgress < 0.9 {
                        self.processingProgress += 0.05
                    }
                    
                    if textChunk.contains("DEBUG:") {
                        self.statusMessage = "正在讀取內容..."
                    } else {
                        self.statusMessage = "正在生成 AI 精華摘要..."
                    }
                }
            }
            
            await MainActor.run {
                // Save analysis back to history item
                if let index = self.history.firstIndex(where: { $0.text == text }) {
                    self.history[index].summary = self.aiAnalysisResult
                    self.saveHistory()
                }
                
                self.processingProgress = 1.0
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    self.isProcessing = false
                    self.statusMessage = "分析完成"
                }
                self.haptics.triggerNotification(type: .success)
            }
        }
    }

    func addTranscription(text: String, audioURL: URL?) {
        let filename = audioURL?.lastPathComponent
        let newItem = TranscriptionItem(text: text, timestamp: Date(), audioFilename: filename)
        
        // Premium Limitation: Free tier stores only 1 record
        if !UserDefaults.standard.bool(forKey: "isPro") {
            history = [newItem]
        } else {
            history.insert(newItem, at: 0)
        }
        
        saveHistory()
    }

    private func saveHistory() {
        if let encoded = try? JSONEncoder().encode(history) {
            UserDefaults.standard.set(encoded, forKey: "transcription_history")
        }
    }

    private func loadHistory() {
        if let data = UserDefaults.standard.data(forKey: "transcription_history"),
           let decoded = try? JSONDecoder().decode([TranscriptionItem].self, from: data) {
            self.history = decoded
            if let latest = decoded.first {
                self.transcriptionText = latest.text
            }
        }
    }
}
