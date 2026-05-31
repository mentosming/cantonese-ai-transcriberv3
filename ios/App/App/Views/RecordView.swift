import SwiftUI
import UniformTypeIdentifiers

struct RecordView: View {
    @EnvironmentObject var viewModel: TranscriberViewModel
    @State private var showFileImporter = false
    @State private var animatePulse = false
    @State private var youtubeURL: String = ""
    @State private var showSettings = false
    
    let languages: [(name: String, value: String)] = [
        ("廣東話", "Cantonese"),
        ("普通話", "Mandarin"),
        ("英文", "English"),
        ("菲律賓語", "Filipino"),
        ("印尼語", "Indonesian")
    ]
    
    var body: some View {
        ZStack {
            // Background Gradient
            LinearGradient(gradient: Gradient(colors: [Color.blue.opacity(0.1), Color(.systemBackground)]), startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
            
            VStack(spacing: 20) {
                // Header
                VStack(alignment: .leading, spacing: 6) {
                    Text("Canto AI")
                        .font(.system(size: 14, weight: .black, design: .rounded))
                        .foregroundColor(.blue)
                        .kerning(2)
                    Text("廣東話智能轉錄")
                        .font(.system(size: 32, weight: .bold))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 30)
                .padding(.top, 40)
                                
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 30) {
                        
                        // TRANSCRIPTION SETTINGS (Moved from SettingsView)
                        DisclosureGroup(isExpanded: $showSettings) {
                            VStack(spacing: 15) {
                                VStack(alignment: .leading, spacing: 10) {
                                    Text("轉錄語系 (可複選)")
                                        .font(.subheadline)
                                        .foregroundColor(.secondary)
                                    
                                    ForEach(languages, id: \.value) { lang in
                                        Button(action: {
                                            var current = Set(viewModel.selectedLanguagesString.components(separatedBy: ",").filter { !$0.isEmpty })
                                            if current.contains(lang.value) {
                                                if current.count > 1 { current.remove(lang.value) } // Require at least one language
                                            } else {
                                                current.insert(lang.value)
                                            }
                                            viewModel.selectedLanguagesString = Array(current).joined(separator: ",")
                                        }) {
                                            HStack {
                                                Text(lang.name)
                                                    .foregroundColor(.primary)
                                                Spacer()
                                                if viewModel.selectedLanguagesString.components(separatedBy: ",").contains(lang.value) {
                                                    Image(systemName: "checkmark.circle.fill")
                                                        .foregroundColor(.blue)
                                                } else {
                                                    Image(systemName: "circle")
                                                        .foregroundColor(.gray.opacity(0.3))
                                                }
                                            }
                                            .padding(.vertical, 8)
                                        }
                                    }
                                }
                                Toggle("包含時間軸", isOn: $viewModel.enableTimestamps)
                                
                                Divider()
                                
                                VStack(alignment: .leading, spacing: 10) {
                                    Text("講者標記 (Diarization)").font(.caption).foregroundColor(.secondary)
                                    Stepper("講者人數: \(viewModel.numSpeakers)", value: $viewModel.numSpeakers, in: 1...5)
                                    
                                    ForEach(0..<viewModel.numSpeakers, id: \.self) { index in
                                        TextField("講者 \(index + 1) 名稱", text: Binding(
                                            get: { viewModel.speakerNames.indices.contains(index) ? viewModel.speakerNames[index] : "Speaker \(index + 1)" },
                                            set: { newValue in
                                                if viewModel.speakerNames.indices.contains(index) {
                                                    viewModel.speakerNames[index] = newValue
                                                } else {
                                                    viewModel.speakerNames.append(newValue)
                                                }
                                            }
                                        ))
                                        .textFieldStyle(RoundedBorderTextFieldStyle())
                                        .font(.caption)
                                    }
                                }
                            }
                            .padding(.top, 10)
                        } label: {
                            HStack {
                                Image(systemName: "slider.horizontal.3")
                                Text("轉錄設定")
                                    .font(.headline)
                            }
                            .foregroundColor(.primary)
                        }
                        .padding()
                        .background(RoundedRectangle(cornerRadius: 15).fill(Color(.systemBackground)))
                        .padding(.horizontal, 30)
                        
                        // Main Recording / Review Card
                        if viewModel.showReviewPanel {
                            ReviewPanel()
                                .padding(.horizontal, 30)
                                .transition(.opacity)
                        } else {
                            VStack(spacing: 30) {
                                ZStack {
                                    if viewModel.isRecording {
                                        // Layered premium pulse animation
                                        ForEach(0..<3) { i in
                                            Circle()
                                                .stroke(Color.red.opacity(0.15), lineWidth: 30)
                                                .scaleEffect(animatePulse ? 1.6 : 1.0)
                                                .opacity(animatePulse ? 0 : 0.6)
                                                .animation(
                                                    Animation.easeInOut(duration: 2.0)
                                                        .repeatForever(autoreverses: false)
                                                        .delay(Double(i) * 0.6),
                                                    value: animatePulse
                                                )
                                        }
                                        .onAppear { animatePulse = true }
                                    }
                                    
                                    Button(action: {
                                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                                        if viewModel.isRecording {
                                            viewModel.stopRecording()
                                            animatePulse = false
                                        } else {
                                            viewModel.startRecording()
                                        }
                                    }) {
                                        Circle()
                                            .fill(viewModel.isRecording ? Color.red : Color.blue)
                                            .frame(width: 110, height: 110)
                                            .shadow(color: (viewModel.isRecording ? Color.red : Color.blue).opacity(0.4), radius: 25, y: 12)
                                            .overlay(
                                                Image(systemName: viewModel.isRecording ? "stop.fill" : "mic.fill")
                                                    .font(.system(size: 36, weight: .bold))
                                                    .foregroundColor(.white)
                                            )
                                    }
                                }
                                
                                if viewModel.isRecording {
                                    Text(formatTime(viewModel.recordingDuration))
                                        .font(.system(size: 32, weight: .bold, design: .monospaced))
                                        .foregroundColor(.red)
                                        .padding(.bottom, 20)
                                }
                            }
                            .padding(.top, 20)
                        }
                        
                        // Import Audio & YouTube Inputs (Only show when not recording/reviewing)
                        if !viewModel.isRecording && !viewModel.showReviewPanel {
                            VStack(spacing: 15) {
                                // Import Button
                                Button(action: { showFileImporter = true }) {
                                    HStack {
                                        Image(systemName: "folder.fill")
                                        Text("匯入音訊 (M4A/MP3/WAV)")
                                    }
                                    .font(.subheadline.bold())
                                    .foregroundColor(.blue)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 15)
                                    .background(Capsule().fill(Color.blue.opacity(0.1)))
                                }
                                
                                // YouTube Input
                                HStack(spacing: 12) {
                                    Button(action: {
                                        if let string = UIPasteboard.general.string {
                                            youtubeURL = string
                                        }
                                    }) {
                                        Image(systemName: "doc.on.clipboard")
                                            .foregroundColor(.red)
                                    }
                                    
                                    TextField("貼上 YouTube 影片連結...", text: $youtubeURL)
                                        .font(.system(size: 14))
                                        .padding(.vertical, 15)
                                        .textInputAutocapitalization(.none)
                                        .disableAutocorrection(true)
                                        .keyboardType(.URL)
                                    
                                    if !youtubeURL.isEmpty {
                                        Button(action: {
                                            viewModel.submitYouTube(url: youtubeURL)
                                            youtubeURL = ""
                                            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                                        }) {
                                            Image(systemName: "arrow.up.circle.fill")
                                                .font(.title2)
                                                .foregroundColor(.blue)
                                        }
                                    }
                                }
                                .padding(.horizontal, 20)
                                .background(Capsule().fill(Color(.systemBackground)))
                                .shadow(color: Color.black.opacity(0.05), radius: 5, y: 2)
                            }
                            .padding(.horizontal, 30)
                        }
                        
                        if viewModel.isProcessing {
                            VStack(spacing: 12) {
                                ProgressView(value: viewModel.processingProgress)
                                    .progressViewStyle(LinearProgressViewStyle(tint: .blue))
                                    .scaleEffect(x: 1, y: 1.5, anchor: .center)
                                    .padding(.horizontal, 40)
                                
                                Text(viewModel.statusMessage)
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(.secondary)
                            }
                            .padding(.top, 10)
                            .padding(.bottom, 100)
                        } else {
                            Text(viewModel.statusMessage)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                                .padding(.top, 10)
                                .padding(.bottom, 100)
                        }
                    }
                }
            }
        }
        .fileImporter(
            isPresented: $showFileImporter,
            allowedContentTypes: [.audio, .mp3, .mpeg4Audio, .wav],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                if let url = urls.first {
                    if url.startAccessingSecurityScopedResource() {
                        viewModel.importAudio(from: url)
                        url.stopAccessingSecurityScopedResource()
                    }
                }
            case .failure(let error):
                print("Import failure: \(error.localizedDescription)")
            }
        }
    }
    
    func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}

struct ReviewPanel: View {
    @EnvironmentObject var viewModel: TranscriberViewModel
    
    var body: some View {
        VStack(spacing: 30) {
            Text("準備轉錄")
                .font(.title3.bold())
            
            // Playback View
            HStack(spacing: 20) {
                Button(action: { viewModel.togglePlayback() }) {
                    Image(systemName: viewModel.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 60))
                        .foregroundColor(.blue)
                }
                
                VStack(alignment: .leading, spacing: 10) {
                    Text(viewModel.currentAudioURL?.lastPathComponent ?? "音訊檔案")
                        .font(.subheadline.bold())
                        .lineLimit(1)
                    
                    ProgressView(value: viewModel.playProgress)
                        .tint(.blue)
                }
            }
            .padding()
            .background(RoundedRectangle(cornerRadius: 20).fill(Color(.systemBackground)))
            .shadow(color: Color.black.opacity(0.05), radius: 10, y: 5)
            
            // Action Buttons
            HStack(spacing: 15) {
                Button(action: { viewModel.showReviewPanel = false }) {
                    Text("取消")
                        .font(.headline)
                        .foregroundColor(.red)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(RoundedRectangle(cornerRadius: 15).fill(Color.red.opacity(0.1)))
                }
                
                Button(action: { viewModel.submitTranscription() }) {
                    Text("確認轉錄")
                        .font(.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(RoundedRectangle(cornerRadius: 15).fill(Color.blue))
                }
            }
        }
    }
}
