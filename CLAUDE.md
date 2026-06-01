# Canto AI — 粵語 AI 轉錄 + 影片字幕工作室

跨裝置專案脈絡。詳細歷史見 `.claude` 記憶；呢度只記**現況同關鍵注意事項**。

## 架構
- **前端**：React + TypeScript + Vite（dev 喺 `:5173`，`npm run dev`）。Tailwind（CDN + inline config，主題：light teal「Modern Light Studio」）。
- **後端**：`server/`（Express，`:3001`，`cd server && npm start`）。**所有 Gemini 呼叫經 server 代理** —— Gemini key 只喺 server，絕不入瀏覽器 bundle。
- **iOS**：Capacitor（`capacitor.config.ts` + `ios/`）。錄音用瀏覽器原生 MediaRecorder（非 native plugin）。
- 前端 API base：`VITE_API_BASE || http://localhost:3001`。
- **品牌**：`components/Logo.tsx` —— `LogoMark`（in-app header 用簡潔 SVG）；app icon 用 Gemini（`gemini-3-pro-image` / Nano Banana Pro）生成嘅光柵圖，喺 `public/brand/`（favicon/apple-touch/PWA/iOS AppIcon）。生成腳本 `server/scripts/gen-icon*.mjs`（用 server `API_KEY`），候選圖喺 `brand-assets/`（gitignore）。購買頁 `components/PricingModal.tsx`（已重新設計）。

## Gemini 模型（vendor-neutral 名）
- 預設 `gemini-3.5-flash`（「高速引擎」，SRT 0 drift，已驗證）
- `gemini-pro-latest`（「高準確引擎」，stable alias，長片用佢）
- `audioTimestamp` 喺 Dev API **唔支援**（會 throw）——靠 prompt + subtitleMode。

## Server 端點（`server/`）
- `index.js`：`/api/transcribe-file`（串流；**長片切段 + Files API + 重試**，見下）、`/api/transcribe-url`、`/api/analyze-text`（AI 摘要/翻譯/設計/配樂都行呢條）。AI 端點有**每 IP 速率限制**（`rateLimit.js`，每分鐘 12 次）。
- `billing.js`：Stripe（checkout/portal/webhook）+ RevenueCat webhook，寫 `purchases`。用 `getFirestore(admin.app(), FIRESTORE_DB_ID)`（named DB）。**Stripe 已切去獨立 LIVE 帳戶 `Canto AI`（`acct_1TdBHR…`，同 HKLAW-LLM 分開、同一 login 多帳戶，唔係 Connect）**；4 條 LIVE price 已建（pack 60/180/600 = HK$30/78/228、月費 HK$88/1200 分鐘）。⚠️ `STRIPE_WEBHOOK_SECRET` 未填（要喺 Canto AI 帳戶開 LIVE webhook → `/api/stripe-webhook`），未填 = 買到但唔加額度。建 price 用 `server/scripts/create-prices.mjs`。
- `subtitles.js`：FFmpeg 燒字幕 async job；**HyperFrames**（`hyperframesRenderer.js`）動畫字幕係 **opt-in**（`ENABLE_HYPERFRAMES=true` + `npm i @heygen/hyperframes`），預設 fallback 靜態。
- `music.js`：免版稅背景音樂庫 + 代理串流（`/api/music`、`/api/music/:id`）。示範曲庫 = SoundHelix，可換成自己授權曲目。
- `import 'dotenv/config'` 必須係 `index.js` **第一行**。

## Firebase
- Auth：Google + Anonymous。Named Firestore DB **`cantonese-aitranscriber`**（`services/firebase.ts`）。
- 管理員：`km520daisy@gmail.com`（正常 Google 登入，`profile.isAdmin`）。
- 計費：新登入用戶送 `FREE_STARTER_MINUTES = 5`（轉錄 + 工作室**共用**）。必須登入先用功能。
- Collections：`users`、`usageLogs` + `transcripts`（歷史/後台）、`purchases`。Rules 已部署。

## 影片工作室（`components/MultiTrackEditor.tsx` —— 真·自由多軌 NLE）
**舊 `SubtitleStudio.tsx` 已移除**，統一用 MultiTrackEditor（App.tsx `showMT` 唯一入口）。Filmora 式佈局：左=媒體庫、中=預覽、右=屬性（頂部 topTab：媒體/字幕/效果/音訊/比例/剪輯）、下=多軌時間線（拖放/磁吸/裁剪/變速/PiP/轉場）。
- **渲染引擎**（`services/mtRender.ts`）：逐幀即時合成多軌（rAF 時鐘 + 每 clip 自己 video/audio + WebAudio 混音），字幕燒喺最上。
- **字幕引擎**（`services/captionRenderer.ts`）：`drawCaption` 預覽同匯出共用（WYSIWYG）。**30 個模板**（`TEMPLATE_NAMES`/`TEMPLATE_ORDER`：彈出/放大/彈跳/霓虹/標題/字框…）+ 動畫 `none/fade/pop/slide/zoom/bounce/drop/rise` + `emphScale`（重點放大）+ `reveal`（逐字浮現）+ karaoke 逐字高亮。
- **字幕分段**（`services/srtUtil.ts` `splitForSubtitles`）：每句 **10–15 中文字**、**標點全部轉空格**（無標點字幕風格）。
- **多層字幕**（最多 3 層）：`SubLayer` model（cues/tpl/ov/bilingual），各層獨立內容/模板/位置，預覽同匯出（`renderMultiTrack(..., captionLayers[])`）都疊。
- **AI 功能**（經 `analyze-text`）：**一鍵字幕 `aiAuto`**（設計對白風格 + 逐句動畫 + 將標題/金句抽去獨立放大圖層）、逐句動畫+重點字（`designCueAnimations` 有 `title` flag）、AI 校對（glossary）、翻譯（雙語）、配樂、精華。
- **AI 積分**：每個 AI 風格化動作扣 `AI_COST=1` 分鐘（`ensureAICredit`/`chargeAI`）；**管理員 + 有效月費（plan===monthly && status===active）免扣**。
- **VAD**（`services/vadAlign.ts`）：`alignCuesToOnsets`（句首）+ `alignCharsToEnergy`（逐字 charProgress）。
- 畫面比例（原片/9:16/1:1/16:9）、背景音樂（曲庫/AI/上載）、匯出 SRT/VTT/TXT 同上。

## 關鍵注意事項（容易踩雷）
- **長片轉錄**：Google 對單次長 request 會斷線（"fetch failed"）。必須**切段 ~120s + Files API（`MAX_INLINE_BYTES=4MB`）+ 重試**。詳見 `services/extractAudio.ts` `extractForSubtitles` + `server/index.js`。**唔好改返單次 inline。**
- **檔名大小寫**：Linux/Zeabur 區分大小寫。`URLImporter.tsx` 曾因 `UrlImporter` vs `URLImporter` 整爆 build——保持與 import 一致。
- **唔好加 COOP/COEP header**：會整爆 Google OAuth popup（已移除；ffmpeg.wasm 冇用）。
- OAuth 用 popup + redirect fallback；localhost 要喺 Firebase authorized domains。
- 私隱：處理中影片只暫存**本地**，只送抽取音訊去轉錄（私隱政策 `LegalModal.tsx` 已寫明）。
- **Stripe 帳戶分離**：Canto AI 收款**唔可以**用 HKLAW-LLM 帳戶（客人會見到錯品牌）。用同一 login 下嘅獨立 `Canto AI` 帳戶（**帳戶層級 `sk_live_`，唔好用 org key `sk_org_live_`** —— org key 每 call 要 `Stripe-Context` header，server 唔支援）。`STRIPE_SECRET_KEY` + 所有 `STRIPE_PRICE_*` 必須同帳戶同 mode。`.env` 而家係 **LIVE**，本機試買會真扣錢（要 dev 解返 test 註解）。
- **AI 積分**：MultiTrackEditor 嘅 AI 動作會扣 `creditMinutes`（`onConsume`→`deductMinutes`）；改前留意 admin/月費豁免邏輯。

## 相關
- 後端 API（舊 Zeabur）：https://github.com/mentosming/cantonese-ai-transcriber-api
- URL 匯入（`URLImporter`）：YouTube 反爬蟲封雲端 IP，目前不穩；可開但未必 work。
