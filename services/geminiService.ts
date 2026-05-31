import { TranscriptionSettings, TranscriptionError } from "../types";
import { ERROR_MESSAGES, DEFAULT_MODEL } from "../constants";

// All Gemini calls go through the server so the API key never reaches the
// browser. Configure the server origin via VITE_API_BASE.
const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://localhost:3001";

export const transcribeMedia = async (
  file: File,
  settings: TranscriptionSettings,
  onProgress: (text: string) => void,
  signal: AbortSignal
) => {
  const form = new FormData();
  form.append("file", file);
  form.append("settings", JSON.stringify({ ...settings, model: settings.model || DEFAULT_MODEL }));

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/transcribe-file`, {
      method: "POST",
      body: form,
      signal,
    });
  } catch (err: any) {
    if (signal.aborted) throw { type: "general", message: "Transcription stopped by user." } as TranscriptionError;
    throw { type: "network", message: ERROR_MESSAGES.NETWORK } as TranscriptionError;
  }

  if (!res.ok) {
    const errObj: TranscriptionError = { type: "general", message: ERROR_MESSAGES.GENERAL };
    if (res.status === 403) { errObj.type = "auth"; errObj.message = ERROR_MESSAGES.AUTH; }
    else if (res.status === 429) { errObj.type = "quota"; errObj.message = ERROR_MESSAGES.QUOTA; }
    else {
      try { const j = await res.json(); if (j?.error) errObj.message = j.error; } catch {}
    }
    throw errObj;
  }

  if (!res.body) throw { type: "general", message: ERROR_MESSAGES.GENERAL } as TranscriptionError;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let receivedAny = false;
  try {
    while (true) {
      if (signal.aborted) {
        reader.cancel().catch(() => {});
        throw { type: "general", message: "Transcription stopped by user." } as TranscriptionError;
      }
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) { receivedAny = true; onProgress(text); }
    }
  } catch (err: any) {
    if (signal.aborted) throw { type: "general", message: "Transcription stopped by user." } as TranscriptionError;
    // Some models (slower Pro) reset the upstream connection AFTER delivering all
    // the text. If we already received content, treat it as a successful finish.
    if (receivedAny) return;
    if (err?.type) throw err;
    throw { type: "network", message: ERROR_MESSAGES.NETWORK } as TranscriptionError;
  }
};

// Transcribe a YouTube / remote media URL by passing it straight to Gemini
// (Google fetches & processes the video server-side — no download, no IP block).
export const transcribeUrl = async (
  url: string,
  settings: TranscriptionSettings,
  onProgress: (text: string) => void,
  signal: AbortSignal
) => {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/transcribe-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, settings: { ...settings, model: settings.model || DEFAULT_MODEL } }),
      signal,
    });
  } catch (err: any) {
    if (signal.aborted) throw { type: "general", message: "Transcription stopped by user." } as TranscriptionError;
    throw { type: "network", message: ERROR_MESSAGES.NETWORK } as TranscriptionError;
  }

  if (!res.ok) {
    const errObj: TranscriptionError = { type: "general", message: ERROR_MESSAGES.GENERAL };
    if (res.status === 429) { errObj.type = "quota"; errObj.message = ERROR_MESSAGES.QUOTA; }
    else { try { const j = await res.json(); if (j?.error) errObj.message = j.error; } catch {} }
    throw errObj;
  }
  if (!res.body) throw { type: "general", message: ERROR_MESSAGES.GENERAL } as TranscriptionError;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let receivedAny = false;
  try {
    while (true) {
      if (signal.aborted) { reader.cancel().catch(() => {}); throw { type: "general", message: "Transcription stopped by user." } as TranscriptionError; }
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) { receivedAny = true; onProgress(text); }
    }
  } catch (err: any) {
    if (signal.aborted) throw { type: "general", message: "Transcription stopped by user." } as TranscriptionError;
    if (receivedAny) return;
    if (err?.type) throw err;
    throw { type: "network", message: ERROR_MESSAGES.NETWORK } as TranscriptionError;
  }
};

// Shared helper to call the server text-analysis endpoint.
const callAnalyze = async (prompt: string, systemInstruction?: string): Promise<string> => {
  const res = await fetch(`${API_BASE}/api/analyze-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, systemInstruction }),
  });
  if (!res.ok) {
    let msg = `分析失敗 (${res.status})`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  const { text } = await res.json();
  return text || "";
};

// Merge multiple transcripts and run a cross-conversation AI analysis.
export const analyzeCombinedTranscripts = async (
  texts: { label: string; content: string }[],
  goal?: string
): Promise<string> => {
  const combined = texts
    .map((t, i) => `### 對話 ${i + 1}：${t.label}\n${t.content}`)
    .join("\n\n---\n\n")
    .slice(0, 120000);

  const prompt = `以下是 ${texts.length} 段獨立對話／逐字稿。請進行「跨對話綜合分析」，用繁體中文（香港風格）輸出：
1. **整體摘要**：橫跨所有對話的重點。
2. **共同主題與分歧**：各段之間的關聯、重複出現的主題、立場差異。
3. **時間線／脈絡**：若有先後關係，整理事件發展。
4. **重點問答 (Q&A)**：彙整關鍵問題與答案。
5. **行動項目／待跟進**（如適用）。
${goal ? `\n使用者額外分析目標：${goal}\n` : ""}
內容如下：\n\n${combined}`;

  return callAnalyze(prompt);
};

// Ask the AI to pick the most important/engaging segments from a transcript,
// returning time ranges (seconds) for an auto-cut highlight reel.
export const pickHighlights = async (
  cues: { start: number; end: number; text: string }[],
  targetSeconds = 60
): Promise<{ start: number; end: number; label: string }[]> => {
  if (!cues.length) return [];
  const list = cues
    .map((c) => `[${c.start.toFixed(1)}-${c.end.toFixed(1)}] ${c.text}`)
    .join('\n')
    .slice(0, 60000);

  const prompt = `你係專業影片剪接師。以下係影片逐字稿，每行格式 \`[開始秒-結束秒] 內容\`。
請揀出**最重要、最精彩、最有資訊量**嘅片段，組成一條總長約 ${targetSeconds} 秒嘅精華片。
**只可以回覆 JSON**（唔好有其他文字、唔好 markdown），格式：
[{"start": 開始秒(number), "end": 結束秒(number), "label": "簡短原因"}]
片段要按時間順序、唔好重疊、每段最好 3-15 秒。
逐字稿：
${list}`;

  const raw = await callAnalyze(prompt, '你只會輸出有效 JSON，無任何其他文字。');
  try {
    const jsonStr = raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1);
    const arr = JSON.parse(jsonStr);
    return (Array.isArray(arr) ? arr : [])
      .map((s: any) => ({ start: Number(s.start), end: Number(s.end), label: String(s.label || '') }))
      .filter((s) => isFinite(s.start) && isFinite(s.end) && s.end > s.start)
      .sort((a, b) => a.start - b.start);
  } catch {
    throw new Error('AI 回覆解析失敗，請重試。');
  }
};

export interface AiCaptionDesign {
  template: 'classic' | 'news' | 'cinema' | 'tiktok' | 'karaoke';
  fontId: 'sans' | 'serif' | 'round' | 'hand';
  sizeId: 's' | 'm' | 'l' | 'xl';
  color: string;
  strokeColor: string;
  pos: 'top' | 'middle' | 'bottom';
  animation: 'none' | 'fade' | 'pop' | 'slide';
  rationale: string;
}

// Ask the AI to design a caption look (template + font + size + colour +
// position + animation) that suits the video's content/mood. Returns a config
// the studio applies to its style overrides.
export const designCaptionStyle = async (sampleText: string): Promise<AiCaptionDesign> => {
  const sample = sampleText.slice(0, 4000);
  const prompt = `你係專業影片字幕設計師。以下係影片字幕內容。請根據內容嘅**題材、語氣、節奏**，設計一套最襯嘅字幕風格。
**只可以回覆 JSON**（唔好 markdown、唔好其他文字），格式同可選值如下：
{
  "template": "classic|news|cinema|tiktok|karaoke",
  "fontId": "sans(黑體)|serif(宋體)|round(圓體)|hand(手寫)",
  "sizeId": "s|m|l|xl",
  "color": "#RRGGBB 文字顏色",
  "strokeColor": "#RRGGBB 描邊顏色",
  "pos": "top|middle|bottom",
  "animation": "none|fade(淡入)|pop(彈出)|slide(上移)",
  "rationale": "一句中文解釋點解咁設計"
}
設計原則：娛樂/Vlog 用 tiktok/karaoke + 彈出/手寫 + 鮮色；新聞/正式用 news/classic + 黑體 + 底部；電影/感性用 cinema + 宋體 + 淡入。文字同描邊要夠對比、易睇。
字幕內容：
${sample}`;

  const raw = await callAnalyze(prompt, '你只會輸出有效 JSON，無任何其他文字。');
  try {
    const jsonStr = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const d = JSON.parse(jsonStr);
    const pick = <T extends string>(v: any, allow: readonly T[], def: T): T => (allow.includes(v) ? v : def);
    const hex = (v: any, def: string) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : def);
    return {
      template: pick(d.template, ['classic', 'news', 'cinema', 'tiktok', 'karaoke'] as const, 'classic'),
      fontId: pick(d.fontId, ['sans', 'serif', 'round', 'hand'] as const, 'sans'),
      sizeId: pick(d.sizeId, ['s', 'm', 'l', 'xl'] as const, 'm'),
      color: hex(d.color, '#FFFFFF'),
      strokeColor: hex(d.strokeColor, '#000000'),
      pos: pick(d.pos, ['top', 'middle', 'bottom'] as const, 'bottom'),
      animation: pick(d.animation, ['none', 'fade', 'pop', 'slide'] as const, 'fade'),
      rationale: String(d.rationale || '已根據內容調整字幕風格'),
    };
  } catch {
    throw new Error('AI 設計解析失敗，請重試。');
  }
};

export interface CueAnimation { i: number; anim: 'none' | 'fade' | 'pop' | 'slide'; emph: string[]; }

// One AI call: assign a per-line entrance animation and key emphasis words.
// Sends only the cue text (no timestamps) and asks for a SPARSE result —
// only lines worth animating/emphasising — to keep tokens small.
export const designCueAnimations = async (cues: { text: string }[]): Promise<CueAnimation[]> => {
  const slice = cues.slice(0, 150);
  const list = slice.map((c, i) => `${i}|${c.text}`).join('\n').slice(0, 12000);
  const prompt = `你係短影片字幕動畫師。下面每行格式 \`索引|字幕\`。
請揀出**值得加強嘅句子**，為佢哋設計入場動畫，並標出該句最多 2 個**重點詞**（必須係該句原文出現嘅字詞）。
平淡、過渡嘅句子可以唔使理（唔好全部都加）。
**只回覆 JSON 陣列**（唔好 markdown、唔好其他字），格式：
[{"i": 索引number, "anim": "none|fade|pop|slide", "emph": ["重點詞", ...]}]
動畫指引：重點/興奮用 pop；柔和/感性用 fade；列點/連續用 slide；一般 none。
字幕：
${list}`;

  const raw = await callAnalyze(prompt, '你只會輸出有效 JSON，無任何其他文字。');
  try {
    const jsonStr = raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1);
    const arr = JSON.parse(jsonStr);
    const anims = ['none', 'fade', 'pop', 'slide'];
    return (Array.isArray(arr) ? arr : [])
      .map((d: any) => ({
        i: Number(d.i),
        anim: (anims.includes(d.anim) ? d.anim : 'pop') as CueAnimation['anim'],
        emph: Array.isArray(d.emph) ? d.emph.map((x: any) => String(x)).filter(Boolean).slice(0, 2) : [],
      }))
      .filter((d: CueAnimation) => Number.isInteger(d.i) && d.i >= 0 && d.i < slice.length);
  } catch {
    throw new Error('AI 動畫解析失敗，請重試。');
  }
};

// Pick the best-fitting library track for the video's vibe. Tiny token cost:
// only sends the track list + a short transcript sample, returns one id.
export const pickMusicForVibe = async (
  sampleText: string,
  tracks: { id: string; title: string; moods: string[] }[]
): Promise<{ id: string; reason: string }> => {
  if (!tracks.length) throw new Error('音樂庫為空');
  const list = tracks.map((t) => `${t.id}: ${t.title} [${t.moods.join('/')}]`).join('\n');
  const prompt = `根據影片字幕內容嘅氛圍，喺以下背景音樂清單揀一首最襯嘅。
**只回覆 JSON**：{"id":"清單中的id","reason":"一句中文原因"}
音樂清單：
${list}
字幕內容：
${sampleText.slice(0, 1500)}`;
  const raw = await callAnalyze(prompt, '你只會輸出有效 JSON，無任何其他文字。');
  try {
    const d = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const id = tracks.some((t) => t.id === d.id) ? d.id : tracks[0].id;
    return { id, reason: String(d.reason || '已根據內容氛圍配樂') };
  } catch {
    throw new Error('AI 配樂解析失敗，請重試。');
  }
};

// Translate each cue's text into the target language. Batched, order-preserving.
export const translateCues = async (cues: { text: string }[], targetLabel: string): Promise<string[]> => {
  const out: string[] = new Array(cues.length).fill('');
  const CHUNK = 80;
  for (let off = 0; off < cues.length; off += CHUNK) {
    const part = cues.slice(off, off + CHUNK);
    const list = part.map((c, i) => `${i}|${c.text.replace(/\n/g, ' ')}`).join('\n');
    const prompt = `將以下每行字幕翻譯做${targetLabel}。每行獨立翻譯、唔好合併、唔好加註解。
**只回覆 JSON 字串陣列**，數量同順序必須同輸入完全一致：["譯文0","譯文1",...]
字幕（格式 索引|原文）：
${list}`;
    try {
      const raw = await callAnalyze(prompt, '你只會輸出有效 JSON 陣列，無任何其他文字。');
      const arr = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
      if (Array.isArray(arr)) arr.forEach((t: any, i: number) => { if (off + i < out.length) out[off + i] = String(t || ''); });
    } catch { /* leave this chunk blank on parse failure */ }
  }
  return out;
};

export const generateSummary = async (text: string): Promise<string> => {
  const prompt = `請根據轉錄文字生成一份詳盡的「問答式摘要」。繁體中文輸出。內容：\n${text.slice(0, 30000)}`;
  const result = await callAnalyze(prompt);
  return result || "無法生成摘要。";
};
