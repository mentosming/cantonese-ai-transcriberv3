import SwiftUI
import StoreKit

struct ContentView: View {
    @EnvironmentObject var viewModel: TranscriberViewModel
    @State private var selectedTab: Int = 0
    
    init() {
        // Force hide the system tab bar to prevent overlap
        let appearance = UITabBarAppearance()
        appearance.configureWithTransparentBackground()
        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
        UITabBar.appearance().isHidden = true
    }
    
    var body: some View {
        ZStack(alignment: .bottom) {
            TabView(selection: $selectedTab) {
                RecordView()
                    .tag(0)
                
                HistoryView()
                    .tag(1)
                
                ResultDetailView(item: viewModel.history.first)
                    .tag(2)
                
                SettingsView()
                    .tag(3)
            }
            
            // Custom Glass Tab Bar
            HStack {
                TabItem(image: "mic.fill", label: "錄音", isSelected: selectedTab == 0) {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    selectedTab = 0
                }
                Spacer()
                TabItem(image: "clock.fill", label: "歷史", isSelected: selectedTab == 1) {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    selectedTab = 1
                }
                Spacer()
                TabItem(image: "sparkles", label: "AI 分析", isSelected: selectedTab == 2) {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    selectedTab = 2
                }
                Spacer()
                TabItem(image: "gearshape.fill", label: "設定", isSelected: selectedTab == 3) {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    selectedTab = 3
                }
            }
            .padding(.horizontal, 30)
            .padding(.vertical, 12)
            .background(
                Capsule()
                    .fill(.ultraThinMaterial)
                    .background(Capsule().stroke(Color.white.opacity(0.3), lineWidth: 0.5))
                    .shadow(color: Color.black.opacity(0.08), radius: 15, x: 0, y: 8)
            )
            .padding(.horizontal, 25)
            .padding(.bottom, 12)
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .preferredColorScheme(viewModel.isDarkMode ? .dark : .light)
    }
}

struct TabItem: View {
    let image: String
    let label: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: image)
                    .font(.system(size: 20, weight: isSelected ? .bold : .medium))
                    .foregroundColor(isSelected ? .blue : .gray)
                Text(label)
                    .font(.system(size: 10, weight: isSelected ? .bold : .medium))
                    .foregroundColor(isSelected ? .blue : .gray)
            }
            .frame(maxWidth: .infinity)
            .scaleEffect(isSelected ? 1.1 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isSelected)
        }
    }
}

// MARK: - History View
struct HistoryView: View {
    @EnvironmentObject var viewModel: TranscriberViewModel
    @State private var selectedItem: TranscriptionItem?
    
    var body: some View {
        NavigationView {
            ZStack {
                Color(.systemGroupedBackground).ignoresSafeArea()
                
                if viewModel.history.isEmpty {
                    VStack(spacing: 20) {
                        Image(systemName: "clock.badge.exclamationmark")
                            .font(.system(size: 60))
                            .foregroundColor(.gray)
                        Text("目前沒有轉錄紀錄")
                            .font(.headline)
                            .foregroundColor(.secondary)
                    }
                } else {
                    List {
                        ForEach(viewModel.history) { item in
                            HistoryRow(item: item)
                                .onTapGesture { selectedItem = item }
                        }
                        .onDelete(perform: deleteItems)
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                    }
                    .listStyle(PlainListStyle())
                }
            }
            .navigationTitle("歷史紀錄")
            .sheet(item: $selectedItem) { item in
                ResultDetailView(item: item)
                    .environmentObject(viewModel)
            }
        }
    }
    
    func deleteItems(at offsets: IndexSet) {
        viewModel.history.remove(atOffsets: offsets)
        if let encoded = try? JSONEncoder().encode(viewModel.history) {
            UserDefaults.standard.set(encoded, forKey: "transcription_history")
        }
    }
}

struct HistoryRow: View {
    let item: TranscriptionItem
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(item.title ?? "未命名錄音")
                    .font(.headline)
                Spacer()
                Text(formatDate(item.timestamp)).font(.caption).foregroundColor(.secondary)
            }
            Text(item.text).font(.subheadline).foregroundColor(.secondary).lineLimit(2)
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 15).fill(Color(.systemBackground)))
        .padding(.vertical, 4)
    }
    func formatDate(_ date: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "MM/dd HH:mm"; return f.string(from: date)
    }
}

// MARK: - Subscription View
struct SubscriptionView: View {
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        ScrollView {
            VStack(spacing: 35) {
                // Header Image & Title
                VStack(spacing: 15) {
                    ZStack {
                        Circle()
                            .fill(LinearGradient(colors: [.yellow, .orange], startPoint: .topLeading, endPoint: .bottomTrailing))
                            .frame(width: 100, height: 100)
                            .shadow(color: .orange.opacity(0.3), radius: 15)
                        
                        Image(systemName: "crown.fill")
                            .font(.system(size: 50))
                            .foregroundColor(.white)
                    }
                    .padding(.top, 50)
                    
                    Text("解鎖 Pro 無限可能")
                        .font(.system(size: 32, weight: .black, design: .rounded))
                    
                    Text("只要 $2.00 USD / 每月")
                        .font(.headline)
                        .foregroundColor(.secondary)
                }
                
                // Feature List
                VStack(alignment: .leading, spacing: 20) {
                    FeatureRow(icon: "clock.arrow.2.circlepath", title: "無限歷史紀錄", subtitle: "永久儲存您的所有轉錄文件")
                    FeatureRow(icon: "waveform.path.badge.plus", title: "支援長時數轉錄", subtitle: "輕鬆處理超過一小時的深度內容")
                    FeatureRow(icon: "doc.zipper", title: "專業格式導出", subtitle: "一鍵生成 SRT 字幕與 CSV 數據表")
                    FeatureRow(icon: "sparkles", title: "深度 AI 分析", subtitle: "更強大的摘要、待辦事項提取功能")
                }
                .padding(25)
                .background(RoundedRectangle(cornerRadius: 24).fill(Color(.systemBackground)))
                .shadow(color: Color.black.opacity(0.05), radius: 20, y: 10)
                .padding(.horizontal)
                
                // Subscribe Button
                Button(action: { /* StoreKit */ }) {
                    Text("立即開始 7 天免費試用")
                        .font(.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                        .background(
                            LinearGradient(colors: [.blue, .purple], startPoint: .leading, endPoint: .trailing)
                        )
                        .cornerRadius(16)
                        .shadow(color: .blue.opacity(0.3), radius: 10, y: 5)
                }
                .padding(.horizontal, 30)
                .padding(.top, 10)
                
                Text("隨時可以點擊「設定」取消訂閱")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .background(
            ZStack {
                Color(.systemGroupedBackground)
                Circle()
                    .fill(Color.blue.opacity(0.05))
                    .frame(width: 400, height: 400)
                    .offset(x: 200, y: -300)
            }
            .ignoresSafeArea()
        )
    }
}

struct FeatureRow: View {
    let icon: String
    let title: String
    let subtitle: String
    
    var body: some View {
        HStack(spacing: 15) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(.blue)
                .frame(width: 40, height: 40)
                .background(Color.blue.opacity(0.1))
                .cornerRadius(10)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 16, weight: .bold))
                Text(subtitle)
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
            }
        }
    }
}

// MARK: - Re-integrated ResultDetailView (to ensure Scope visibility)
struct ResultDetailView: View {
    @EnvironmentObject var viewModel: TranscriberViewModel
    var item: TranscriptionItem?
    
    @State private var summaryPercentage: Double = 80
    @State private var customGoal: String = ""
    @State private var showExportMenu = false
    
    // For Speaker Renaming
    @State private var renamingOriginalSpeaker: String? = nil
    @State private var speakerNewName: String = ""
    
    var body: some View {
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
                            
                            if viewModel.isProcessing {
                                VStack(spacing: 8) {
                                    ProgressView(value: viewModel.processingProgress)
                                        .progressViewStyle(LinearProgressViewStyle(tint: .blue))
                                        .padding(.horizontal)
                                    
                                    Text(viewModel.statusMessage)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                .padding(.bottom, 10)
                            }
                            
                            VStack(alignment: .leading, spacing: 0) {
                                ForEach(viewModel.parsedLines) { line in
                                    TranscriptionRow(line: line) { original in
                                        renamingOriginalSpeaker = original
                                        speakerNewName = viewModel.customSpeakerMap[original] ?? original
                                    }
                                    Divider().padding(.leading, 95)
                                }
                            }
                            .background(RoundedRectangle(cornerRadius: 15).fill(Color(.systemBackground)))
                            .opacity(viewModel.isProcessing && viewModel.transcriptionText.isEmpty ? 0.3 : 1.0)
                            .overlay(
                                Group {
                                    if viewModel.isProcessing && viewModel.transcriptionText.isEmpty {
                                        ProgressView()
                                    }
                                }
                            )
                                
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
                            .padding(.horizontal)
                        
                        // 2. AI Summary Control Panel
                        VStack(alignment: .leading, spacing: 18) {
                            Text("AI 深度分析設定")
                                .font(.system(size: 18, weight: .bold, design: .rounded))
                                .padding(.horizontal, 5)
                            
                            VStack(spacing: 24) {
                                // 2.5 AI Analysis Highlight Card (Moved to bottom)
                                if !viewModel.aiAnalysisResult.isEmpty || !(item?.summary?.isEmpty ?? true) {
                                    VStack(alignment: .leading, spacing: 12) {
                                        HStack {
                                            Label("AI 精華摘要與分析", systemImage: "sparkles")
                                                .font(.headline)
                                                .foregroundColor(.blue)
                                            Spacer()
                                        }
                                        
                                        ScrollView {
                                            Text(viewModel.aiAnalysisResult.isEmpty ? (item?.summary ?? "") : viewModel.aiAnalysisResult)
                                                .font(.system(size: 15, weight: .medium, design: .rounded))
                                                .foregroundColor(.primary)
                                                .lineSpacing(4)
                                                .textSelection(.enabled)
                                        }
                                        .frame(maxHeight: 400) // Contain long analysis
                                    }
                                    .padding(20)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(
                                        RoundedRectangle(cornerRadius: 20)
                                            .fill(Color.blue.opacity(0.05))
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 20)
                                                    .stroke(LinearGradient(colors: [.blue.opacity(0.2), .purple.opacity(0.2)], startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 2)
                                            )
                                    )
                                    .shadow(color: Color.black.opacity(0.04), radius: 15, y: 10)
                                }

                                // Percentage Slider
                                VStack(alignment: .leading, spacing: 12) {
                                    HStack {
                                        Label("摘要比例", systemImage: "text.quote")
                                            .font(.subheadline.bold())
                                        Spacer()
                                        Text("\(Int(summaryPercentage))%")
                                            .font(.system(.body, design: .monospaced))
                                            .foregroundColor(.blue)
                                            .bold()
                                    }
                                    Slider(value: $summaryPercentage, in: 20...100, step: 10)
                                        .accentColor(.blue)
                                }
                                
                                // Custom Goal Input
                                VStack(alignment: .leading, spacing: 12) {
                                    Label("分析目標預設", systemImage: "target")
                                        .font(.subheadline.bold())
                                    
                                    TextField("例如：列出待辦事項、分析講者情緒...", text: $customGoal)
                                        .textFieldStyle(PlainTextFieldStyle())
                                        .padding()
                                        .background(Color(.secondarySystemBackground))
                                        .cornerRadius(12)
                                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.gray.opacity(0.1), lineWidth: 1))
                                }
                                
                                Button(action: {
                                    print("🚀 AI Re-analyze Button Tapped")
                                    HapticManager.shared.triggerImpact(style: .medium)
                                    viewModel.summaryPercentage = Int(summaryPercentage)
                                    viewModel.customGoal = customGoal
                                    // Properly trigger re-analysis for the specific item
                                    viewModel.reanalyze(item: item)
                                }) {
                                    HStack {
                                        Image(systemName: "sparkles")
                                        Text("套用並重新分析")
                                    }
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 16)
                                    .background(Color.blue)
                                    .foregroundColor(.white)
                                    .cornerRadius(14)
                                    .shadow(color: .blue.opacity(0.2), radius: 8, y: 4)
                                }
                            }
                            .padding(20)
                            .background(
                                RoundedRectangle(cornerRadius: 22)
                                    .fill(Color(.systemBackground))
                                    .overlay(RoundedRectangle(cornerRadius: 22).stroke(Color.white.opacity(0.5), lineWidth: 1))
                            )
                            .shadow(color: Color.black.opacity(0.04), radius: 15, y: 10)
                        }
                        .padding(.horizontal)
                        
                        Spacer(minLength: 100)
                    }
                    .padding(.top)
                }
            .navigationTitle("轉錄與分析")
            .navigationBarTitleDisplayMode(.inline)
            .confirmationDialog("選擇導出格式", isPresented: $showExportMenu, titleVisibility: .visible) {
                Button("導出 SRT 字幕 (.srt)") { exportAsSRT() }
                Button("導出 CSV 表格 (.csv)") { exportAsCSV() }
                Button("導出 純文字 (.txt)") { exportAsText() }
                Button("取消", role: .cancel) {}
            }
            .alert("更改講者名稱", isPresented: Binding(get: { renamingOriginalSpeaker != nil }, set: { if !$0 { renamingOriginalSpeaker = nil } })) {
                TextField("輸入新名稱", text: $speakerNewName)
                Button("取消", role: .cancel) { renamingOriginalSpeaker = nil }
                Button("確定") {
                    if let original = renamingOriginalSpeaker, !speakerNewName.isEmpty {
                        viewModel.customSpeakerMap[original] = speakerNewName
                    }
                    renamingOriginalSpeaker = nil
                    speakerNewName = ""
                }
            } message: {
                Text("這將會同步更改全篇文件中「\(renamingOriginalSpeaker ?? "")」的使用者顯示名稱。")
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
            srtContent += "\(line.displayName): \(line.content)\n\n"
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
            let speaker = line.displayName
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
    let onRename: (String) -> Void
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(line.timeRange.isEmpty ? "--:--" : line.timeRange)
                .font(.system(.caption2, design: .monospaced))
                .foregroundColor(.secondary)
                .frame(width: 85, alignment: .leading)
            
            VStack(alignment: .leading, spacing: 4) {
                Button(action: { onRename(line.originalSpeaker ?? "Speaker 1") }) {
                    Text(line.displayName)
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
