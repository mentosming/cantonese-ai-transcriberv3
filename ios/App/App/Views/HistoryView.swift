import SwiftUI

struct HistoryView: View {
    @EnvironmentObject var viewModel: TranscriberViewModel
    @State private var showingDetail = false
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
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    selectedItem = item
                                    showingDetail = true
                                }
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
        // Auto-save is triggered by Task in ViewModel or implicitly if @AppStorage was used directly on the array (but it's not here)
        // Manually trigger save
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
                    .foregroundColor(.primary)
                Spacer()
                Text(formatDate(item.timestamp))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Text(item.text)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .lineLimit(2)
            
            HStack {
                Label("廣東話", systemImage: "bubble.left.and.exclamationmark.bubble.right.fill")
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundColor(.blue)
            }
            .font(.caption2)
            .foregroundColor(.blue.opacity(0.8))
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 15).fill(Color(.systemBackground)))
        .padding(.horizontal, 4)
        .padding(.bottom, 8)
        .shadow(color: Color.black.opacity(0.03), radius: 5, y: 2)
    }
    
    func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MM/dd HH:mm"
        return formatter.string(from: date)
    }
}
