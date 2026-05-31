# Canto AI — 粵語 AI 轉錄 + 影片字幕工作室

跨裝置專案脈絡。詳細歷史見 `.claude` 記憶；呢度只記**現況同關鍵注意事項**。

## 架構
- **前端**：React + TypeScript + Vite（dev 喺 `:5173`，`npm run dev`）。Tailwind（CDN + inline config，主題：light teal「Modern Light Studio」）。
- **後端**：`server/`（Express，`:3001`，`cd server && npm start`）。**所有 Gemini 呼叫經 server 代理** —— Gemini key 只喺 server，絕不入瀏覽器 bundle。
- **iOS**：Capacitor（`capacitor.config.ts` + `ios/`）。錄音用瀏覽器原生 MediaRecorder（非 native plugin）。
- 前端 API base：`VITE_API_BASE || http://localhost:3001`。

## Gemini 模型（vendor-neutral 名）
- 預設 `gemini-3.5-flash`（「高速引擎」，SRT 0 drift，已驗證）
- `gemini-pro-latest`（「高準確引擎」，stable alias，長片用佢）
- `audioTimestamp` 喺 Dev API **唔支援**（會 throw）——靠 prompt + subtitleMode。

## Server 端點（`server/`）
- `index.js`：`/api/transcribe-file`（串流；**長片切段 + Files API + 重試**，見下）、`/api/transcribe-url`、`/api/analyze-text`（AI 摘要/翻譯/設計/配樂都行呢條）。AI 端點有**每 IP 速率限制**（`rateLimit.js`，每分鐘 12 次）。
- `billing.js`：Stripe（checkout/portal/webhook）+ RevenueCat webhook，寫 `purchases`。用 `getFirestore(admin.app(), FIRESTORE_DB_ID)`（named DB）。
- `subtitles.js`：FFmpeg 燒字幕 async job；**HyperFrames**（`hyperframesRenderer.js`）動畫字幕係 **opt-in**（`ENABLE_HYPERFRAMES=true` + `npm i @heygen/hyperframes`），預設 fallback 靜態。
- `music.js`：免版稅背景音樂庫 + 代理串流（`/api/music`、`/api/music/:id`）。示範曲庫 = SoundHelix，可換成自己授權曲目。
- `import 'dotenv/config'` 必須係 `index.js` **第一行**。

## Firebase
- Auth：Google + Anonymous。Named Firestore DB **`cantonese-aitranscriber`**（`services/firebase.ts`）。
- 管理員：`km520daisy@gmail.com`（正常 Google 登入，`profile.isAdmin`）。
- 計費：新登入用戶送 `FREE_STARTER_MINUTES = 5`（轉錄 + 工作室**共用**）。必須登入先用功能。
- Collections：`users`、`usageLogs` + `transcripts`（歷史/後台）、`purchases`。Rules 已部署。

## 影片工作室（`components/SubtitleStudio.tsx`，統一 4 格）
字幕同剪片**已合併**成一個工具：左=媒體庫（主影片 + 附加片段/相片）、中=預覽、右=屬性、下=時間線。
- **字幕引擎**（`services/captionRenderer.ts`）：字體/大小/文字色/描邊/位置/動畫（淡入/彈出/上移/karaoke）+ 逐字重點高亮。預覽同匯出用同一個 `drawCaption`（WYSIWYG）。
- **AI 功能**（經 `analyze-text`，token 極少）：整體風格設計、逐句動畫 + 重點字、翻譯（雙語字幕）、配樂（揀曲庫 id）。
- **VAD 對齊**（`services/vadAlign.ts`）：靜音偵測校準每句開始時間。
- **畫面比例**：原片 / 9:16 / 1:1 / 16:9（cover 裁切重構圖，直出社交）。
- **背景音樂**：曲庫 / AI 配樂 / 自己上載，WebAudio 混音墊喺人聲下。
- **匯出**：純字幕燒錄 → WebCodecs 真 MP4（`localRender.ts`）；有附加片段/改比例/背景音樂 → `renderTimeline.ts` 合成。字幕檔可出 SRT / VTT / TXT（`srtUtil.ts`；剪映直接讀 SRT）。

## 關鍵注意事項（容易踩雷）
- **長片轉錄**：Google 對單次長 request 會斷線（"fetch failed"）。必須**切段 ~120s + Files API（`MAX_INLINE_BYTES=4MB`）+ 重試**。詳見 `services/extractAudio.ts` `extractForSubtitles` + `server/index.js`。**唔好改返單次 inline。**
- **檔名大小寫**：Linux/Zeabur 區分大小寫。`URLImporter.tsx` 曾因 `UrlImporter` vs `URLImporter` 整爆 build——保持與 import 一致。
- **唔好加 COOP/COEP header**：會整爆 Google OAuth popup（已移除；ffmpeg.wasm 冇用）。
- OAuth 用 popup + redirect fallback；localhost 要喺 Firebase authorized domains。
- 私隱：處理中影片只暫存**本地**，只送抽取音訊去轉錄（私隱政策 `LegalModal.tsx` 已寫明）。

## 相關
- 後端 API（舊 Zeabur）：https://github.com/mentosming/cantonese-ai-transcriber-api
- URL 匯入（`URLImporter`）：YouTube 反爬蟲封雲端 IP，目前不穩；可開但未必 work。
