# 影片燒錄字幕設定

形式：**模板庫 + 非同步 job**（避免長片 timeout）。Server 路由（`server/subtitles.js`）：

| 路由 | 做法 |
|---|---|
| `GET /api/subtitle-templates` | 回傳模板清單（經典白字／新聞黃字／TikTok／Karaoke…） |
| `POST /api/subtitle-jobs` | 提交 job（video + srt + template）→ `{ jobId }`，背景渲染 |
| `GET /api/subtitle-jobs/:id` | 輪詢 `{ status, progress, error }` |
| `GET /api/subtitle-jobs/:id/download` | 完成後下載 MP4 |

模板分兩類：**靜態**（FFmpeg `force_style` 燒字，需 libass）；**動畫**（`tiktok`/`karaoke` 等，啟用 HyperFrames 時用，否則自動 fallback 到最接近嘅靜態樣式）。

前端 [SubtitleBurner.tsx](components/SubtitleBurner.tsx)：上載影片 → 由轉錄自動產生 SRT（[srtUtil.ts](services/srtUtil.ts)）→ 揀模板 → 提交 → 進度條輪詢 → 完成自動下載。屬有額度功能（`hasEntitlement`）。

> Job 狀態存喺記憶體（單一 instance 足夠）。多 instance 部署要改用 Redis。

---

## ⚠️ FFmpeg 必須 enable libass

`subtitles` filter 依賴 **libass**。檢查：
```bash
ffmpeg -hide_banner -filters | grep subtitles   # 要見到 subtitles
ffmpeg -version | grep enable-libass
```

- **Linux / Zeabur（生產）**：`apt-get install ffmpeg` 已包含 libass ✅。Docker 用 `jrottenberg/ffmpeg` 或 Debian base + `apt install ffmpeg`。
- **macOS 本機開發**：若 `subtitles` filter 唔存在（本專案測試機就係咁），`brew reinstall ffmpeg`（新版 bottle 已含 libass）。

> 本機 `/opt/homebrew/bin/ffmpeg` 目前 **無 libass**，所以本地燒錄會失敗；部署到 Zeabur 正常。

燒錄指令（server 已實作）：
```bash
ffmpeg -i input.mp4 \
  -vf "subtitles='/tmp/x.srt':force_style='FontName=Noto Sans HK,FontSize=24,PrimaryColour=&H00FFFFFF,Outline=2,Alignment=2'" \
  -c:a copy out.mp4
```

---

## HyperFrames 動畫字幕（opt-in）

HeyGen HyperFrames（Apache-2.0）：HTML/CSS → 確定性 MP4，靠 headless Chromium + FFmpeg。`hyperframesRenderer.js` 由 SRT 建立帶 `data-start/data-end` 嘅 HTML 時間軸，render 成透明 overlay，再用 FFmpeg `overlay` 合成。

啟用：
```bash
cd server && npm install @heygen/hyperframes
# host 需有 Chromium + FFmpeg
export ENABLE_HYPERFRAMES=true
```
未啟用時路由回 501 並提示。

> 註：`hyperframesRenderer.js` 內 `render({...})` 的具體參數需對齊你安裝嘅 HyperFrames 版本 API（已留 TODO 標記）。
