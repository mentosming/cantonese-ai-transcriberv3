// Make a clean FULL-BLEED master from the chosen v2-b (for iOS / favicon / PWA).
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_KEY = process.env.API_KEY;
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dir, '../../public/brand');
const ai = new GoogleGenAI({ apiKey: API_KEY });
const refData = readFileSync(resolve(OUT, 'timeline-v2-b.jpg')).toString('base64');

const PROMPT = `Recreate THIS exact app-icon design, but make it FULL-BLEED for the App Store:
- The teal background gradient must fill the ENTIRE square frame, edge to edge.
- NO transparent area, NO checkerboard pattern, NO rounded corners, NO border or padding — the four corners are filled solid with the teal background (the OS adds its own rounding later).
- Keep every interior element IDENTICAL and centered: the audio waveform track, the multi-colour clip track (teal/mint/amber/coral clips), the white play triangle with the vertical playhead line, and the amber AI spark.
- Keep it crisp, flat-vector, glossy, premium, App Store quality.
- ABSOLUTELY NO text, letters, numbers or words.
Output a clean 1024x1024 square image with a solid filled background.`;

const pickImage = (res) => {
  const parts = res?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) if (p?.inlineData?.data) return p.inlineData;
  return null;
};

for (const name of ['master-a', 'master-b']) {
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-3-pro-image',
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: refData } }, { text: PROMPT }] }],
      config: { responseModalities: ['Image'] },
    });
    const img = pickImage(res);
    if (!img) { console.log(`✗ ${name} no image`); continue; }
    const ext = (img.mimeType || 'image/png').includes('jpeg') ? 'jpg' : 'png';
    const file = resolve(OUT, `icon-${name}.${ext}`);
    writeFileSync(file, Buffer.from(img.data, 'base64'));
    console.log(`✓ ${file}`);
  } catch (e) { console.log(`✗ ${name}: ${e?.message || e}`); }
}
console.log('done');
