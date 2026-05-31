# Canto AI — Native iOS (SwiftUI)

Native Swift rewrite of the Canto AI 粵語轉錄 + 字幕工作室. Reuses the **same
Express backend** (`server/` in the repo root) + Firebase + RevenueCat — only the
client is rebuilt natively.

## 一次過設定

### 1. 產生 Xcode 專案
```bash
brew install xcodegen          # 一次
cd ios-native
xcodegen generate              # 由 project.yml 生成 CantoAI.xcodeproj
open CantoAI.xcodeproj
```
（唔想用 XcodeGen 嘅話：開新 iOS App 專案，把 `CantoAI/` 整個拖入，再用 SPM 加
Firebase / GoogleSignIn-iOS / RevenueCat 三個 package。）

### 2. Firebase + 登入
- Firebase Console → iOS app（bundle id `com.cantoai.app`）→ 下載 `GoogleService-Info.plist`
- 拖入 `CantoAI/Resources/`（加入 target）
- 喺 `Info.plist` 把 `REVERSED_CLIENT_ID` 換成 plist 入面嗰個值（Google 登入 URL scheme）
- Firebase Auth → 啟用 **Google** 同 **Apple** 兩個 provider
- **Sign in with Apple**：
  - Apple Developer → Identifiers → App ID 開啟 *Sign In with Apple* capability（`CantoAI.entitlements` 已包含，Xcode Signing 會自動對應）
  - Firebase Apple provider 設定好 Services ID / Key（用 native Apple 登入唔使填 redirect，但 provider 要啟用）
- 確認 Firestore 用 named database **`cantonese-aitranscriber`**（同 web 一致）

### 3. 設定值（`App/Config.swift`）
- `apiBase` → 你部署嘅 Express server URL（模擬器可用 `http://localhost:3001`，實機唔得，要 LAN IP / 已部署網址）
- `revenueCatAPIKey` → RevenueCat 的 iOS public SDK key
- `adminEmail` 已設 `km520daisy@gmail.com`

### 4. 簽署
Xcode → target → Signing → 揀你個 Team（或喺 `project.yml` 填 `DEVELOPMENT_TEAM`）。

## 架構對照（web → native）
| Web | Native |
|---|---|
| `services/geminiService.ts` | `Networking/APIClient.swift` + `AIService.swift` |
| `services/srtUtil.ts` | `Services/SubtitleUtil.swift` |
| `services/authService.ts` | `Services/AuthService.swift`（Firebase + GoogleSignIn）|
| `services/billingService.ts` | `Services/BillingService.swift`（Firestore + RevenueCat）|
| `services/extractAudio.ts` | `Services/AudioExtractor.swift`（AVAssetExportSession）|
| `captionRenderer` + `localRender`/`renderTimeline` | `Studio/CaptionBurner.swift`（AVFoundation + Core Animation）|
| `SubtitleStudio.tsx` | `Studio/StudioView.swift` + `StudioViewModel.swift` |
| `App.tsx` | `Features/Home/HomeView.swift` + `App/AppState.swift` |

## 已實作
- **Apple + Google 登入**閘 / 5 分鐘免費額度 / 額度 gating
- 上載 + 麥克風錄音 → **串流轉錄**（連現有 `/api/transcribe-file`，含「出咗內容後斷線當成功」嘅韌性）
- 轉錄結果 + 匯出 SRT / TXT（分享 sheet）
- 轉換記錄（Firestore）
- RevenueCat 付費牆（offerings → 購買 → webhook 入賬）
- **影片工作室**：揀片 → 生成字幕（抽音軌 + subtitleMode）→ 即時預覽字幕疊加 →
  字幕外觀（字體/大小/位置/動畫/顏色）→ AI 設計 / AI 逐句動畫 + 重點字 / 翻譯雙語 /
  AI 配樂 + 音樂庫 → 畫面比例重構圖 → **AVFoundation 燒錄輸出 MP4**（+ 背景音樂混音）

## 多片段時間線 + 逐字重點（已完成）
- **媒體庫**：主影片 + 加片段 / 加相片，可排序、刪除、設相片秒數（`Studio/TimelineClip.swift`）
- **多片段串接**：`CaptionBurner.burn` 用 `AVMutableComposition` 把主影片 + 附加片段接埋，每段 cover-fit 到輸出比例，字幕疊喺主影片上，一次匯出
- **相片轉片段**：`Studio/ImageVideoMaker.swift` 用 `AVAssetWriter` 把相片 render 成短片插入時間線
- **逐字重點高亮**：burner 同預覽都會將 AI 標出嘅重點詞著上 highlight 色（attributed range）

## 下一步（仲未做）
- 後台（管理員睇所有用戶）— web 已有，native 可後補
- 推播 / 低額提醒 / 刪除帳戶頁
- 片段之間轉場 / 主影片裁剪
