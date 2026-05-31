// Canto AI icon v2 — fuses transcription + the VIDEO CAPTION STUDIO (play, captions,
// timeline) with the voice wave. Nano Banana Pro. Saves to public/brand/.
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_KEY = process.env.API_KEY;
if (!API_KEY) { console.error('No API_KEY'); process.exit(1); }
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dir, '../../public/brand');
mkdirSync(OUT, { recursive: true });
const ai = new GoogleGenAI({ apiKey: API_KEY });

const BRAND = `App icon for "Canto AI" — a Cantonese speech-to-text transcriber AND an AI VIDEO CAPTION / EDITING STUDIO (it turns voice into subtitles and burns them onto videos, with a multi-track editor).
The icon MUST express BOTH ideas at once: voice → AI → captions ON VIDEO.
Design language: "Modern Light Studio" — clean, premium, friendly tech, flat vector.
Color: fresh teal gradient background (#3FCBB3 → #119C89 → #0A6358), white motif shapes, one small warm amber (#F6B73C) AI spark accent.
Form: iOS-style rounded-square (squircle) app icon, soft long shadow, subtle glossy highlight, crisp geometry, centered, generous padding, transparent backdrop.
ABSOLUTELY NO text, NO letters, NO numbers, NO words anywhere.
App Store quality, single icon.`;

const VARIANTS = [
  { name: 'studio-play-caption', extra: 'A rounded video/play card: a triangular PLAY button in the upper area, and a SUBTITLE/CAPTION bar (2 rounded caption lines, one teal-highlighted) across the lower area, plus a tiny audio sound-wave and an amber spark. Reads as "captions on a video".' },
  { name: 'studio-frame-wave', extra: 'A video frame (rounded screen) containing an audio sound-wave that turns into a caption line, with a small play triangle and an amber spark in a corner. Voice → subtitles inside a video screen.' },
  { name: 'studio-bubble-play', extra: 'A white speech bubble whose tail forms a small PLAY triangle; inside the bubble a sound-wave plus one caption underline; amber spark top-right. Marries chat/voice with video playback.' },
  { name: 'studio-timeline', extra: 'A play triangle over two stacked rounded timeline/caption tracks (like a multi-track editor), a subtle sound-wave on the top track, amber spark. Minimal, iconic, conveys a video caption studio.' },
];

const pickImage = (res) => {
  const parts = res?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) if (p?.inlineData?.data) return p.inlineData;
  return null;
};

for (const v of VARIANTS) {
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-3-pro-image',
      contents: `${BRAND}\n\nVariant focus: ${v.extra}`,
      config: { responseModalities: ['Image'] },
    });
    const img = pickImage(res);
    if (!img) { console.log(`✗ no image ${v.name}`); continue; }
    const ext = (img.mimeType || 'image/png').includes('jpeg') ? 'jpg' : 'png';
    const file = resolve(OUT, `${v.name}.${ext}`);
    writeFileSync(file, Buffer.from(img.data, 'base64'));
    console.log(`✓ ${v.name} → ${file}`);
  } catch (e) {
    console.log(`✗ ${v.name}: ${e?.message || e}`);
  }
}
console.log('done');
