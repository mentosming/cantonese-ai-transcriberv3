# Cantonese AI Transcriber — 前端

## 專案概覽
粵語 AI 轉錄工具，使用 Gemini API 進行語音轉文字。部署於 GitHub Pages (cantonese-ai-transcriber.com)。

## 技術棧
- React + TypeScript + Vite
- Tailwind CSS
- Gemini API（語音轉錄）
- GitHub Pages 部署（GitHub Actions）

## 重要環境變數
- `GEMINI_API_KEY` — Gemini API 金鑰（GitHub Secrets: `API_KEY`）
- `DOWNLOAD_API_URL` — 後端 API 網址（目前: https://cantonese-ai-transcriber-api.zeabur.app）

## 相關 Repo
- **後端 API**: https://github.com/mentosming/cantonese-ai-transcriber-api (Zeabur Docker)

## 功能狀態

### V5.4 網絡連結匯入 (Download+) — 暫停
- **狀態**: URLImporter 組件已隱藏（App.tsx ~line 622，用 JSX 註釋包住）
- **原因**: YouTube 反機器人封鎖雲端伺服器 IP，cookies 從不同 IP 無法使用
- **已嘗試但失敗**: 多種 player_client、cookies、bgutil PO tokens、OAuth2（已棄用）、Invidious/Piped（已關閉）、cobalt.tools（需認證）
- **重新啟用**: 找到可靠方案後，取消 App.tsx 的 URLImporter 註釋即可
- **其他平台** (Instagram/TikTok/Facebook): 後端 yt-dlp 可能可用，未全面測試

## 注意事項
- 檔名大小寫敏感：GitHub Actions 在 Linux 運行，Windows 不區分大小寫但 Linux 區分
- `Cross-Origin-Embedder-Policy` 使用 `credentialless`（不是 `require-corp`），否則 CDN 資源會被封鎖
- 下載 MP3 功能為 Pro-only
