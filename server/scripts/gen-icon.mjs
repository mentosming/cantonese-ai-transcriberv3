// Generate Canto AI app-icon candidates with Gemini's image model (Nano Banana).
// Uses the server's API_KEY (Google Gemini). Saves PNGs to public/brand/.
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_KEY = process.env.API_KEY;
if (!API_KEY) { console.error('No API_KEY in server/.env'); process.exit(1); }

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dir, '../../public/brand');
mkdirSync(OUT, { recursive: true });

const ai = new GoogleGenAI({ apiKey: API_KEY });

const BRAND = `App icon for "Canto AI", a Cantonese speech-to-text + AI video-caption studio.
Design language: "Modern Light Studio" — clean, premium, friendly tech.
Color: fresh teal gradient (#3FCBB3 to #0A6358) as the icon background, with one small warm amber (#F6B73C) spark accent.
Motif: a rounded white speech/chat bubble holding a teal audio sound-wave (5 bars of varying height), expressing voice → AI → captions.
Style: flat vector, iOS-style rounded-square (squircle) app icon, soft long shadow, subtle glossy top highlight, crisp geometry, centered, generous padding.
NO text, NO letters, NO words. Single icon on a transparent or matching backdrop. Highly polished, App Store quality.`;

const VARIANTS = [
  { name: 'icon-bubble-wave', extra: 'Speech bubble + sound wave + tiny amber spark, the primary concept.' },
  { name: 'icon-wave-to-text', extra: 'Left side audio sound-wave bars morphing into right side caption text-lines (rounded pills), teal on white card, amber spark top-right.' },
  { name: 'icon-soundwave-disc', extra: 'A bold circular teal medallion with a clean white sound-wave / waveform through the middle and a small amber spark, minimal and iconic.' },
];

const pickImage = (res) => {
  const parts = res?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) if (p?.inlineData?.data) return p.inlineData;
  return null;
};

const MODELS = ['gemini-3-pro-image', 'nano-banana-pro-preview', 'gemini-3-pro-image-preview'];

for (const v of VARIANTS) {
  let saved = false;
  for (const model of MODELS) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: `${BRAND}\n\nVariant focus: ${v.extra}`,
        config: { responseModalities: ['Image'] },
      });
      const img = pickImage(res);
      if (!img) { console.log(`  [${model}] no image for ${v.name}`); continue; }
      const ext = (img.mimeType || 'image/png').includes('jpeg') ? 'jpg' : 'png';
      const file = resolve(OUT, `${v.name}.${ext}`);
      writeFileSync(file, Buffer.from(img.data, 'base64'));
      console.log(`✓ ${v.name} → ${file} (${model})`);
      saved = true;
      break;
    } catch (e) {
      console.log(`  [${model}] ${v.name} failed: ${e?.message || e}`);
    }
  }
  if (!saved) console.log(`✗ ${v.name} produced nothing`);
}
console.log('done');
