import SwiftUI

struct ResultDetailView: View {
    @EnvironmentObject var viewModel: TranscriberViewModel
    var item: TranscriptionItem?
    
    @State private var summaryPercentage: Double = 80
    @State private var customGoal: String = ""
    @State private var showExportMenu = false
    
    var body: some View {
        NavigationView {
            ZStack {
                Color(.systemGroupedBackground).ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: 24) {
                        // 1. Transcription Content (Table Style)
                        VStack(alignment: .leading, spacing: 15) {
                            HStack {
                                Label("轉錄內容", systemImage: "doc.text.fill")
                                    .font(.headline)
                                Spacer()
                                Button(action: { showExportMenu = true }) {
                                    Image(systemName: "square.and.arrow.up")
                                        .foregroundColor(.blue)
                                }
                            }
                            
                            if viewModel.isProcessing && viewModel.transcriptionText.isEmpty {
                                ProgressView("AI 正在工作中...")
                                    .padding()
                            } else {
                                VStack(alignment: .leading, spacing: 0) {
                                    ForEach(viewModel.parsedLines) { line in
                                        TranscriptionRow(line: line)
                                        Divider().padding(.leading, 95)
                                    }
                                }
                                .background(RoundedRectangle(cornerRadius: 15).fill(Color(.systemBackground)))
                                
                                // 3. Export Formats (Moved up for visibility)
                                if !viewModel.transcriptionText.isEmpty {
                                    HStack(spacing: 12) {
                                        ExportTile(title: "SRT 字幕檔", icon: "captions.bubble.fill", color: .green) {
                                            exportAsSRT()
                                        }
                                        ExportTile(title: "CSV 表格", icon: "tablecells.fill", color: .orange) {
                                            exportAsCSV()
                                        }
                                    }
                                    .padding(.top, 10)
                                }
                            }
                        }
                        .padding(.horizontal)
                        
                        // 2. AI Summary Control Panel
                        VStack(alignment: .leading, spacing: 20) {
                            Text("AI 深度分析設定")
                                .font(.headline)
                                .padding(.horizontal)
                            
                            VStack(spacing: 20) {
                                // Percentage Slider
                                VStack(alignment: .leading) {
                                    HStack {
                                        Text("摘要比例")
                                        Spacer()
                                        Text("\(Int(summaryPercentage))%")
                                            .foregroundColor(.blue)
                                            .bold()
                                    }
                                    Slider(value: $summaryPercentage, in: 20...100, step: 10)
                                }
                                
                                // Custom Goal Input
                                VStack(alignment: .leading) {
                                    Text("自定義分析目標")
                                        .font(.subheadline.bold())
                                    TextField("例如：列出待辦事項、分析講者情緒...", text: $customGoal)
                                        .textFieldStyle(RoundedBorderTextFieldStyle())
                                }
                                
                                Button(action: {
                                    viewModel.summaryPercentage = Int(summaryPercentage)
                                    viewModel.customGoal = customGoal
                                    // Trigger re-analysis logic if implemented
                                    viewModel.statusMessage = "正在依照新目標分析..."
                                }) {
                                    Text("重新分析內容")
                                        .frame(maxWidth: .infinity)
                                        .padding()
                                        .background(Color.blue)
                                        .foregroundColor(.white)
                                        .cornerRadius(12)
                                }
                            }
                            .padding()
                            .background(RoundedRectangle(cornerRadius: 20).fill(Color(.systemBackground)))
                            .padding(.horizontal)
                        }
                        
                        Spacer(minLength: 100)
                    }
                    .padding(.top)
                }
            }
            .navigationTitle("轉錄與分析")
            .navigationBarTitleDisplayMode(.inline)
            .confirmationDialog("選擇導出格式", isPresented: $showExportMenu, titleVisibility: .visible) {
                Button("導出 SRT 字幕 (.srt)") { exportAsSRT() }
                Button("導出 CSV 表格 (.csv)") { exportAsCSV() }
                Button("導出 純文字 (.txt)") { exportAsText() }
                Button("取消", role: .cancel) {}
            }
        }
    }
    
    // MARK: - Export Logic
    func exportAsSRT() {
        let lines = viewModel.parsedLines
        var srtContent = ""
        var validIndex = 1
        
        for line in lines {
            guard !line.timeRange.isEmpty else { continue }
            let start = line.srtTimestamp(isEnd: false)
            let end = line.srtTimestamp(isEnd: true)
            srtContent += "\(validIndex)\n"
            srtContent += "\(start) --> \(end)\n"
            srtContent += "\(line.speaker ?? "Unknown"): \(line.content)\n\n"
            validIndex += 1
        }
        
        shareFile(content: srtContent, filename: "transcript.srt")
    }
    
    func exportAsCSV() {
        let lines = viewModel.parsedLines
        var csvContent = "StartTime,EndTime,Speaker,Content\n"
        
        for line in lines {
            let times = line.timeRange.components(separatedBy: " - ")
            let start = times.first ?? ""
            let end = times.last ?? ""
            let speaker = line.speaker ?? "Unknown"
            let escapedContent = line.content.replacingOccurrences(of: "\"", with: "\"\"")
            csvContent += "\(start),\(end),\(speaker),\"\(escapedContent)\"\n"
        }
        
        shareFile(content: csvContent, filename: "transcript.csv")
    }
    
    func exportAsText() {
        let cleanText = viewModel.transcriptionText.replacingOccurrences(of: "DEBUG: [^\\n]*\\n?", with: "", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
        shareFile(content: cleanText, filename: "transcript.txt")
    }
    
    func shareFile(content: String, filename: String) {
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        try? content.write(to: tempURL, atomically: true, encoding: .utf8)
        
        let av = UIActivityViewController(activityItems: [tempURL], applicationActivities: nil)
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let rootVC = windowScene.windows.first?.rootViewController {
            rootVC.present(av, animated: true)
        }
    }
}

struct TranscriptionRow: View {
    let line: TranscriptionLine
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(line.timeRange.isEmpty ? "--:--" : line.timeRange)
                .font(.system(.caption2, design: .monospaced))
                .foregroundColor(.secondary)
                .frame(width: 85, alignment: .leading)
            
            VStack(alignment: .leading, spacing: 4) {
                if let speaker = line.speaker {
                    Text(speaker)
                        .font(.caption.bold())
                        .foregroundColor(.blue)
                }
                Text(line.content)
                    .font(.system(size: 15, weight: .regular, design: .rounded))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 15)
    }
}

struct ExportTile: View {
    let title: String
    let icon: String
    let color: Color
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.title2)
                Text(title)
                    .font(.caption.bold())
            }
            .foregroundColor(color)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(color.opacity(0.1))
            .cornerRadius(12)
        }
    }
}
