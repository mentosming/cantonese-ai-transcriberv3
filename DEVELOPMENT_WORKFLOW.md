# 🚀 Canto AI 研發與同步工作流 (Development Workflow)

這份文檔記錄了本專案最穩定的開發模式，確保 **iOS App**、**API 後端** 與 **雲端環境** 完美同步。

## 🏗️ 專案架構圖
- **前端 (iOS/Swift)**: `ios/App/App/` (導航至 `GeminiService.swift` 配置連線)
- **後端 (API Repo)**: `temp-api-repo/` (存儲於 https://github.com/mentosming/cantonese-ai-transcriber-api)
- **雲端 (Production)**: [Vercel 站點](https://cantonese-ai-transcriber-api.vercel.app)

---

## 🛠️ 標準開發步驟 (The Workflow)

### 1. 修改後端邏輯 (API Repo)
如果您需要更改 AI 分析方式或模型：
- **路徑**: `temp-api-repo/src/routes/transcribe.ts`
- **關鍵模型**: 統一使用 `gemini-2.5-flash` 以確保性能與相容。
- **憑證模式**: 務必保持 `vertexai: false` 並使用 API Key。

### 2. 推送至 GitHub (Sync & Deploy)
完成修改後，在 `temp-api-repo` 目錄執行：
```bash
git add .
git commit -m "feat: 更新 AI 邏輯"
git pull origin main --rebase
git push origin main
```
> [!IMPORTANT]
> 推送成功後，**Vercel 會立即自動部署**。通常在 1 分鐘內，生產環境網址就會生效。

### 3. iOS 前端測試 (Connection)
- **配置文件**: `ios/App/App/Services/GeminiService.swift`
- **正式環境**: `baseURL` 指向 Vercel 網址。
- **路由路徑**: 務必包含 `/api/transcribe/` 嵌套段落。

---

## 🚦 故障排除 (Troubleshooting)

| 現象 | 可能原因 | 解決方法 |
| :--- | :--- | :--- |
| **Cannot POST /api/...** | 路由路徑不對 | 檢查 Swift 請求路徑是否包含 `/api/transcribe/` |
| **500 Error (Credentials)** | 憑證進入 Vertex 模式 | 檢查 `genAI` 初始化是否包含 `vertexai: false` |
| **404 Model Not Found** | 模型名稱不匹配 | 確保使用 `gemini-2.5-flash` |

---

> [!TIP]
> **「就住呢個 WORKFLOW」**：遵循這套同步流程，您的 AI 分析成功率將維持在 100%。
