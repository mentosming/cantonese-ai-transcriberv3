# Canto AI — 功能清單 + 場景用法

粵語 AI 轉錄 + 字幕影片工作室。**Web（React/Vite）** 同 **iOS（SwiftUI native）** 兩個 client，
共用同一個 **Express 後端 + Firebase + Stripe/RevenueCat**。

---

## 1. 帳戶 / 登入
| 功能 | Web | iOS |
|---|---|---|
| Google 登入 | ✅ | ✅ |
| Apple 登入 | — | ✅ |
| 帳戶連結（Apple⇄Google 同一 uid）| — | ✅ |
| 登入送 5 分鐘免費額度（轉錄＋工作室共用）| ✅ | ✅ |
| 必須登入先用功能（gating）| ✅ | ✅ |
| 管理員（km520daisy@gmail.com）後台 | ✅ | （後補）|

**場景**：新用戶 Google 一鍵登入 → 即送 5 分鐘 → 試轉錄。iOS 用戶喺「帳戶」連結埋 Apple，
之後 web/iOS 任何一邊登入都係同一份額度。

## 2. 轉錄
| 功能 | 說明 |
|---|---|
| 上載影/音檔轉錄 | 串流即時顯示文字 |
| 麥克風錄音轉錄 | 瀏覽器 MediaRecorder / iOS AVAudioRecorder |
| URL 匯入（YouTube 等）| Web，目前不穩（雲端 IP 被封）|
| 雙引擎 | 高速（gemini-3.5-flash）/ 高準確（gemini-pro-latest）|
| 多語言 | 廣東話／國語／普通話／英／日／韓… |
| 時間戳、講者分離 | ✅ |
| 長片穩定 | 自動切 ~2 分鐘段 + Files API + 重試（解決 fetch failed）|
| 匯出 | SRT / TXT（iOS）、SRT/VTT/TXT（工作室）|

**場景**：記者把 1 小時錄音上載 → 揀高準確引擎 → 切段穩定轉錄 → 匯出 SRT 交字幕組。

## 3. AI 分析
| 功能 | 說明 |
|---|---|
| AI 問答式摘要 | 由逐字稿生成 |
| 多對話合併分析 | 揀多條歷史記錄一齊 AI 分析（計費）|
| 轉換記錄 | Firestore 儲存，可重看 / 載入 |

**場景**：開會錄三段 → 各自轉錄 → 揀三條記錄「合併分析」→ 出一份跨會議重點。

## 4. 影片字幕工作室（核心）
4 格版面（媒體庫 / 預覽 / 屬性 / 時間線），字幕＋剪片合併。

| 功能 | Web | iOS |
|---|---|---|
| 影片內生成字幕（抽音軌 + subtitleMode）| ✅ | ✅ |
| VAD 逐句時間校準 | ✅ | （server 端時間，native 後補）|
| 字幕內嵌編輯（改字/拆/合/刪）| ✅ | （編輯後補；可重生成）|
| 字幕外觀：字體/大小/顏色/描邊/位置/動畫 | ✅ | ✅ |
| **AI 設計整體風格** | ✅ | ✅ |
| **AI 逐句動畫 + 重點字高亮** | ✅ | ✅ |
| **翻譯 / 雙語字幕** | ✅ | ✅ |
| 模板（經典/新聞/電影/TikTok/Karaoke）| ✅ | ✅ |
| 畫面比例 9:16 / 1:1 / 16:9 重構圖 | ✅ | ✅ |
| **AI 配樂 + 免版稅音樂庫** | ✅ | ✅ |
| 背景音樂混音（音量）| ✅ | ✅ |
| 多片段時間線（接片/相片）| ✅ | ✅ |
| 燒錄輸出 MP4 | WebCodecs/Canvas | AVFoundation + Core Animation |
| 字幕檔匯出 SRT/VTT/TXT | ✅ | ✅ |
| 疊加圖層 PiP + 時間窗 | ✅ | ✅ |
| 旁白配音（主聲+生字幕）| ✅ | ✅ |
| 主影片裁剪 | （後補）| ✅ |
| 預覽 live 影片疊加層 | ✅ | ✅ |
| AI 自動剪重點（精華）| ✅ | （後補）|

**場景 A（Vlog 直片）**：上載橫片 → 自動生成字幕 → 撳「AI 設計整體風格」（揀咗 TikTok 黃字彈出）
→「AI 逐句動畫＋重點字」→ 畫面比例揀 9:16 → AI 配樂揀咗輕快曲 → 匯出直片出抖音/IG。

**場景 B（雙語教學）**：上載講課片 → 生成廣東話字幕 → 翻譯做 English → 開雙語顯示
→ 燒錄出片，原文上、英文下。

**場景 C（相片＋影片混剪）**：主影片講解 + 加幾張產品相片（設每張 3 秒）→ 字幕疊喺主影片
→ 加背景音樂 → 一次匯出一條 MP4。

## 5. 計費（跨平台統一）
| 功能 | Web | iOS |
|---|---|---|
| 按量額度包（60/180/600 分鐘）| Stripe | Apple IAP |
| 月費訂閱（1200 分鐘）| Stripe | Apple IAP |
| 統一額度 | Firestore `users/{uid}` 單一真相 | 同上 |
| 購買後即時入賬 | webhook | webhook + **app 輪詢** |
| 還原購買 | — | ✅ RevenueCat restore |

**場景**：用戶喺 iOS 買月費（Apple IAP）→ RevenueCat webhook 入賬 Firestore → 同一帳戶
喺 web 登入即見月費生效。詳見 `ios-native/IAP_SETUP.md`。

## 6. 私隱 / 合規
- 處理中影片只暫存**本地**，只送抽取音訊去轉錄
- 私隱政策 + 服務條款頁（web `LegalModal`）
- server AI 端點**速率限制**（每 IP 每分鐘 12 次）保護 Gemini key
- Gemini key 只喺 server，絕不入前端 bundle

---

## 平台差異速查
- **Web**：功能最全（含字幕內嵌編輯、VAD、AI 精華、URL 匯入、管理後台）。
- **iOS native**：登入（含 Apple）、串流轉錄、歷史、付費牆、**完整工作室**（生成→AI 設計/動畫/翻譯/配樂→比例→多片段→AVFoundation 燒錄）。後補中：字幕內嵌編輯 UI、AI 精華、管理後台。
