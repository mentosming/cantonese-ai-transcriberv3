import 'dotenv/config'; // must run before other imports read process.env
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { createBillingRouter } from './billing.js';
import { createSubtitleRouter } from './subtitles.js';
import { createMusicRouter } from './music.js';
import { rateLimit } from './rateLimit.js';

// Throttle the costly AI endpoints (per IP) to protect the Gemini key.
const aiLimiter = rateLimit({ windowMs: 60_000, max: 12, key: 'ai' });

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());

// Stripe webhook must receive the raw body for signature verification — mount
// before the JSON parser so this single route is exempt from express.json().
app.use('/api/stripe-webhook', express.raw({ type: '*/*' }));

app.use(express.json());

// Billing routes (Stripe web checkout + RevenueCat iOS webhook → Firestore credits).
app.use(createBillingRouter());

// Subtitle burning routes (FFmpeg burn-in + optional HyperFrames animated).
app.use(createSubtitleRouter());
app.use(createMusicRouter());

// Multer for memory storage (for direct file transcription)
const upload = multer({ storage: multer.memoryStorage() });

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("CRITICAL: API_KEY not found in environment variables.");
  process.exit(1);
}

// Correct initialization for @google/genai v1.46.0 using v1beta for Gemini 3
const genAI = new GoogleGenAI({ 
    apiKey: API_KEY, 
    vertexai: false,
    apiVersion: 'v1beta' // Required for Gemini 3
});

// Language rules kept in sync with frontend constants.ts LANGUAGES.
const LANGUAGES = {
  yue: { name: '廣東話 (Cantonese)', instruction: '1. Output strictly in Cantonese (Hong Kong) using proper Cantonese characters (正字: 嘅,喺,咁,唔,係).\n2. Do NOT convert to Standard Written Chinese. Write exactly what is said.\n3. Accurately transcribe code-mixed English words.' },
  'zh-TW': { name: '國語 (繁體中文)', instruction: 'Output strictly in Traditional Chinese. Transcribe exactly what is said.' },
  'zh-CN': { name: '普通話 (简体中文)', instruction: 'Output strictly in Simplified Chinese. Transcribe exactly what is said.' },
  en: { name: 'English', instruction: 'Output strictly in English. Transcribe exactly what is said.' },
  ja: { name: '日本語 (Japanese)', instruction: 'Output strictly in Japanese.' },
  ko: { name: '韓語 (Korean)', instruction: 'Output strictly in Korean.' },
  id: { name: '印尼語 (Indonesian)', instruction: 'Output strictly in Indonesian (Bahasa Indonesia).' },
  fil: { name: '菲律賓語 (Filipino)', instruction: 'Output strictly in Filipino (Tagalog), including Taglish as spoken.' },
};

// Rich buildSystemInstruction (parity with frontend geminiService).
const buildSystemInstruction = (settings) => {
  const { language, enableTimestamps, enableDiarization, customPrompt, subtitleMode } = settings || {};
  const ids = (language && language.length ? language : ['yue']).filter((id) => LANGUAGES[id]);
  const langs = (ids.length ? ids : ['yue']).map((id) => LANGUAGES[id]);
  const langNames = langs.map((l) => l.name).join(', ');
  const langInstructions = langs.map((l) => `### ${l.name} Rules:\n${l.instruction}`).join('\n\n');

  let si = `
You are a professional Transcriber.
Your task is to transcribe the **ENTIRE** audio/video file into text with high accuracy.
The audio contains: **${langNames}**.

**CRITICAL INSTRUCTION: FULL DURATION**
- You MUST continue transcribing until the audio completely ends.
- **Do not stop** at long pauses or silence. If silent for a while, write [Silence], then continue listening for speech.

**Language Rules:**
${langInstructions}
`.trim();

  if (subtitleMode) {
    si += `\n\n**SUBTITLE MODE — short lines with precise per-line timestamps (CRITICAL):**
- Break the speech into SHORT subtitle lines: each line is ONE short clause, about 6–14 characters (roughly 1–4 seconds of speech). NEVER merge multiple sentences/clauses into one line.
- Output every line as: \`[HH:MM:SS - HH:MM:SS] Content\` (use MM:SS if under 1 hour). No speaker labels.
- Each line's start/end MUST match the **actual time that exact clause is spoken** on the audio track (measured from 00:00). Do NOT estimate or evenly space them.
- The end time of one line must equal (or be very close to) the start time of the next line — no gaps, no overlaps.
- Split naturally at pauses and punctuation so each line appears and disappears in sync with the voice.`;
  } else if (enableTimestamps) {
    si += `\n\n**Formatting & Timestamp Accuracy (CRITICAL):**\n- Output: \`[HH:MM:SS - HH:MM:SS] Speaker Name: Content\` (HH:MM:SS for media > 1 hour, else MM:SS).\n- Timestamps MUST reflect the actual elapsed time on the media's audio track, measured from 00:00 at the first frame. Do NOT estimate from output position.\n- The end time of one line should align with the start time of the next; avoid drifting gaps.\n- Every sentence must have a timestamp.`;
  }

  if (enableDiarization) {
    si += `\n\n**Speaker Diarization:** Identify different speakers. Label as "Speaker 1", "Speaker 2", etc.`;
  }

  if (customPrompt && customPrompt.trim()) {
    si += `\n\n**ADDITIONAL USER INSTRUCTIONS:**\n${customPrompt.trim()}`;
  }

  return si;
};

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// Use the Files API for anything above this. Large inline payloads make the
// streaming connection to Google unstable, so keep the inline path small.
const MAX_INLINE_BYTES = 4 * 1024 * 1024;

// Upload large files to the Gemini Files API (REST), server-side with the key.
const uploadFileToGemini = async (buffer, mimeType, displayName) => {
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${API_KEY}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': buffer.length.toString(),
        'X-Goog-Upload-Header-Content-Type': mimeType || 'application/octet-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { displayName } }),
    }
  );
  if (!initRes.ok) throw new Error(`Init upload failed: ${initRes.status} - ${await initRes.text()}`);
  let uploadUrl = initRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Missing upload URL');
  if (!uploadUrl.includes('key=')) uploadUrl += `&key=${API_KEY}`;

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: buffer,
  });
  if (!uploadRes.ok) throw new Error(`Upload bytes failed: ${uploadRes.status} - ${await uploadRes.text()}`);

  const result = await uploadRes.json();
  let { uri, state, name } = result.file;
  let attempts = 0;
  while (state === 'PROCESSING' && attempts < 60) {
    await new Promise((r) => setTimeout(r, 2000));
    const getRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${name.split('/').pop()}?key=${API_KEY}`);
    if (getRes.ok) {
      const j = await getRes.json();
      state = j.state; uri = j.uri;
      if (state === 'ACTIVE') return uri;
      if (state === 'FAILED') throw new Error('File processing failed on server');
    }
    attempts++;
  }
  if (state !== 'ACTIVE') throw new Error('File processing timed out');
  return uri;
};

const DEFAULT_MODEL = 'gemini-3.5-flash';
const ALLOWED_MODELS = ['gemini-3.5-flash', 'gemini-pro-latest', 'gemini-3.1-pro-preview', 'gemini-flash-latest', 'gemini-3-flash-preview', 'gemini-3-pro-preview'];
const resolveModel = (settings) => {
  const requested = settings?.model;
  return requested && ALLOWED_MODELS.includes(requested) ? requested : DEFAULT_MODEL;
};

// Route: Transcribe via URL (YouTube)
app.post('/api/transcribe-url', aiLimiter, async (req, res) => {
  const { url, settings } = req.body;
  if (!url) return res.status(400).send("URL is required");

  try {
    // Gemini ingests the YouTube/remote URL directly (Google processes it
    // server-side) — no download, so no IP blocking.
    const streamConfig = {
      model: resolveModel(settings),
      contents: [
        { role: 'user', parts: [
          { fileData: { fileUri: url } },
          { text: "Task: Transcribe the media file word-for-word. Process the FULL duration." },
        ]},
      ],
      config: {
        systemInstruction: buildSystemInstruction(settings),
        temperature: 0.2,
        safetySettings: SAFETY_SETTINGS,
      },
    };

    let wroteAny = false;
    const runStream = async () => {
      const result = await genAI.models.generateContentStream(streamConfig);
      for await (const chunk of result) {
        const text = chunk.text;
        if (text) {
          if (!res.headersSent) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Transfer-Encoding', 'chunked');
          }
          wroteAny = true;
          res.write(text);
        }
      }
    };

    try {
      await runStream();
    } catch (streamErr) {
      if (!wroteAny) {
        console.warn('URL transcription reset before content, retrying once…', streamErr?.message);
        await runStream();
      } else {
        console.warn('URL transcription reset after content (kept):', streamErr?.message);
      }
    }
    res.end();
  } catch (error) {
    console.error("URL Transcription Error:", error?.message || error);
    if (!res.headersSent) res.status(500).json({ error: error?.message || 'URL 轉錄失敗' });
    else res.end();
  }
});

// Route: Transcribe via File Upload (Native Recording)
app.post('/api/transcribe-file', aiLimiter, upload.single('file'), async (req, res) => {
  const { settings: settingsStr } = req.body;
  const settings = JSON.parse(settingsStr || '{}');
  const file = req.file;

  if (!file) return res.status(400).send("File is required");

  try {
    // Inline for small files; Files API for anything over the inline limit.
    let mediaPart;
    if (file.size > MAX_INLINE_BYTES) {
      const uri = await uploadFileToGemini(file.buffer, file.mimetype, file.originalname);
      mediaPart = { fileData: { mimeType: file.mimetype || 'application/octet-stream', fileUri: uri } };
    } else {
      mediaPart = { inlineData: { data: file.buffer.toString('base64'), mimeType: file.mimetype } };
    }

    const streamConfig = {
      model: resolveModel(settings),
      contents: [
        { role: 'user', parts: [mediaPart, { text: "Task: Transcribe the media file word-for-word. Process the FULL duration." }] }
      ],
      config: {
        systemInstruction: buildSystemInstruction(settings),
        temperature: 0.2,
        safetySettings: SAFETY_SETTINGS,
      }
    };

    let wroteAny = false;
    const runStream = async () => {
      const result = await genAI.models.generateContentStream(streamConfig);
      for await (const chunk of result) {
        const text = chunk.text;
        if (text) {
          if (!res.headersSent) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Transfer-Encoding', 'chunked');
          }
          wroteAny = true;
          res.write(text);
        }
      }
    };

    try {
      await runStream();
    } catch (streamErr) {
      // Google sometimes resets the connection. If nothing was sent yet, retry
      // once; if we already streamed content, end gracefully (client keeps it).
      if (!wroteAny) {
        console.warn('Transcription stream reset before content, retrying once…', streamErr?.message);
        await runStream();
      } else {
        console.warn('Transcription stream reset after content (kept):', streamErr?.message);
      }
    }
    res.end();
  } catch (error) {
    console.error("File Transcription Error:", error?.message || error);
    if (!res.headersSent) res.status(500).json({ error: error?.message || 'Transcription failed' });
    else res.end();
  }
});

// Route: Text generation (summary / combined analysis). Accepts a full client
// prompt + optional systemInstruction (prompt text is not secret; only the key
// must stay server-side). Returns JSON { text }. Backward-compatible with `text`.
app.post('/api/analyze-text', aiLimiter, async (req, res) => {
  const { text, prompt, systemInstruction, settings } = req.body;
  const effectivePrompt = prompt || (text
    ? `請分析以下逐字稿內容，並提供摘要、主要主題以及問答總結：\n\n${text}`
    : null);
  if (!effectivePrompt) return res.status(400).json({ error: 'prompt or text is required' });

  try {
    const result = await genAI.models.generateContent({
      model: resolveModel(settings),
      contents: [{ role: 'user', parts: [{ text: effectivePrompt }] }],
      config: {
        systemInstruction: systemInstruction || `您是一位專業的 AI 內容分析師。請用繁體中文（香港風格）輸出結果。`,
        temperature: 0.3,
      }
    });
    res.json({ text: result.text || '' });
  } catch (error) {
    console.error("Analyze error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Gemini Proxy Server running at http://localhost:${port}`);
});

