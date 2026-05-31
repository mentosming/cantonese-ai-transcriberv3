import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var viewModel: TranscriberViewModel
    @State private var selectedTab: Int = 0
    
    var body: some View {
        ZStack(alignment: .bottom) {
            TabView(selection: $selectedTab) {
                RecordView()
                    .tag(0)
                
                HistoryView()
                    .tag(1)
                
                ResultDetailView(item: viewModel.history.first) // Link to latest or selected
                    .tag(2)
                
                SettingsView()
                    .tag(3)
            }
            
            // Custom Glass Tab Bar
            HStack {
                TabItem(image: "mic.fill", label: "錄音", isSelected: selectedTab == 0) { selectedTab = 0 }
                Spacer()
                TabItem(image: "clock.fill", label: "歷史", isSelected: selectedTab == 1) { selectedTab = 1 }
                Spacer()
                TabItem(image: "sparkles", label: "AI 分析", isSelected: selectedTab == 2) { selectedTab = 2 }
                Spacer()
                TabItem(image: "gearshape.fill", label: "設定", isSelected: selectedTab == 3) { selectedTab = 3 }
            }
            .padding(.horizontal, 30)
            .padding(.vertical, 15)
            .background(
                Capsule()
                    .fill(Color(.systemBackground).opacity(0.8))
                    .background(Capsule().stroke(Color.white.opacity(0.2), lineWidth: 1))
                    .blur(radius: 0.5)
                    .shadow(color: Color.black.opacity(0.1), radius: 10, x: 0, y: 5)
            )
            .padding(.horizontal, 20)
            .padding(.bottom, 10)
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
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
