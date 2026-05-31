// Refine the chosen "studio-timeline" icon (image-to-image) — keep the layout,
// add richness: multi-colour timeline clips, gradient waveform, depth, glow.
// Nano Banana Pro (gemini-3-pro-image). Saves to public/brand/.
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_KEY = process.env.API_KEY;
if (!API_KEY) { console.error('No API_KEY'); process.exit(1); }
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dir, '../../public/brand');
mkdirSync(OUT, { recursive: true });
const ai = new GoogleGenAI({ apiKey: API_KEY });

const REF = resolve(OUT, 'studio-timeline.jpg');
const refData = readFileSync(REF).toString('base64');

const BASE = `Redesign THIS app icon. Keep the same overall composition (a play triangle over a multi-track editing TIMELINE with a sound-wave track) and the teal "Modern Light Studio" brand, but make it FAR more polished and vibrant — the current one is too plain/monotone.
Improvements required:
- Richer teal background gradient with real depth and a soft inner glow (not flat).
- The timeline clips should be MULTI-COLOURED segments (teal, mint, a warm amber/coral accent clip) with rounded corners — clearly a multi-track video editor.
- The audio waveform should use a smooth gradient (teal→mint) and feel lively.
- Add a small subtitle/caption line with one highlighted word to signal "captions".
- A refined amber (#F6B73C) AI spark, well integrated.
- Glossy top highlight, soft long shadow, crisp clean vector geometry, premium App Store quality.
iOS rounded-square (squircle) app icon, centered, generous padding, transparent backdrop.
ABSOLUTELY NO text, NO letters, NO numbers, NO words.`;

const VARIANTS = [
  { name: 'timeline-v2-a', extra: 'Balanced and clean; clips in teal/mint with ONE amber clip; play triangle centered.' },
  { name: 'timeline-v2-b', extra: 'More dynamic: a longer waveform across the top track, the timeline playhead line crossing the clips, amber spark near the playhead.' },
  { name: 'timeline-v2-c', extra: 'Bolder and chunkier shapes for high legibility at small sizes; two tracks, vivid clip colours, strong contrast.' },
  { name: 'timeline-v2-d', extra: 'Add a thin highlighted caption bar under the tracks with one teal-highlighted segment; elegant, editorial.' },
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
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: refData } },
          { text: `${BASE}\n\nVariant focus: ${v.extra}` },
        ],
      }],
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
