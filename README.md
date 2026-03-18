<div align="center">

# Cantonese AI Transcriber v3

**專業廣東話及多語言語音轉文字工具**

[![React](https://img.shields.io/badge/React-19-blue.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6-purple.svg)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3-38B2AC.svg)](https://tailwindcss.com/)
[![Gemini API](https://img.shields.io/badge/Gemini_API-Supported-orange.svg)](https://ai.google.dev/)

</div>

---

## 📖 專案簡介 (About the Project)

**Cantonese AI Transcriber** 是一個基於網頁的專業語音轉文字工具，專為處理廣東話、英文及國語夾雜的語境而設計。它目前預設使用 **Google Gemini 3.0 Flash** 模型（亦可切換至 Pro 版），提供高準確度的語音識別、自動時間戳記、語者分離以及 AI 內容摘要功能。

### ✨ 核心功能 (Key Features)

- 🎙️ **多語言混合識別**：完美支援廣東話 (Cantonese)、英文、國語識別。
- ⏱️ **高精度時間戳記與語者分離 (Diarization)**：提升會議記錄、訪談等場景的實用性。
- 📝 **即時編輯與導出**：在網頁上直接編輯轉錄結果，並支援導出為 **SRT 字幕**, TXT 或 CSV 格式。
- 🪄 **AI 智能摘要**：一鍵生成詳細的會議重點、案情整理或問答。
- 🛠️ **豐富的輔助工具**：
  - **Audio Extractor**: 音訊提取工具。
  - **File Splitter**: 長檔案自動分割工具。
  - **URL Importer**: 直接從 YouTube/Instagram 等網絡連結匯入音訊。
- 🌙 **自訂化體驗**：內建淺色/深色模式 (Dark/Light mode) 及全局字型大小調整。
- 👑 **Pro 完全版解鎖**：提供無限制轉錄時長、長檔案處理等進階功能 (支援通行碼及管理員登入)。

---

## 🚀 快速開始 (Getting Started)

遵循以下步驟在本地端運行此應用程式。

### 📋 系統需求 (Prerequisites)
- [Node.js](https://nodejs.org/) (建議 v18 或以上)
- 一組有效的 [Google Gemini API Key](https://aistudio.google.com/app/apikey)

### ⚙️ 安裝與運行 (Installation & Running)

1. **安裝依賴套件 (Install dependencies):**
   ```bash
   npm install
   ```

2. **設定環境變數 (Set Environment Variables):**
   在專案根目錄建立 `.env.local` 檔案，並填入您的 Gemini API 密鑰：
   ```env
   VITE_GEMINI_API_KEY=你的_GEMINI_API_KEY
   ```
   *(註：發佈到 Vercel 等平台時，請確保設定相應的環境變數)*

3. **啟動開發伺服器 (Run the development server):**
   ```bash
   npm run dev
   ```

4. **開啟應用程式:**
   開啟瀏覽器並訪問 `http://localhost:5173` (或終端機提示的本機網址)。

---

## 🏗️ 技術棧 (Tech Stack)

- **前端框架**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **建置工具**: [Vite](https://vitejs.dev/)
- **樣式設計**: [Tailwind CSS](https://tailwindcss.com/)
- **圖示庫**: [Lucide React](https://lucide.dev/)
- **AI 引擎**: `@google/genai` (Google Gemini API)
- **授權與後台**: [Firebase](https://firebase.google.com/)

---

## 🔒 隱私與安全 (Privacy & Security)

- **無痕模式理念**: 檔案主要在客戶端處理並直接傳送至 AI API，減少伺服器中轉點的存儲風險。
- **管理員授權**: 後台管理與 Pro 版解鎖功能使用 Firebase 進行安全驗證。

---

## 🤝 貢獻與支持 (Support)

如果您覺得這個工具對您有幫助，歡迎支持開發者一杯咖啡！

<a href="https://buymeacoffee.com/cantonese.ai.transcriber" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

---

*Powered by Google Gemini*
