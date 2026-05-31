// HyperFrames animated-subtitle renderer (opt-in).
//
// HyperFrames (HeyGen, Apache-2.0) renders deterministic MP4 from HTML/CSS/JS
// using a headless browser + FFmpeg. We build an HTML timeline where each SRT
// cue is a subtitle element with data-* timing attributes, then let HyperFrames
// render it as an overlay composited over the source video.
//
// Setup (see SUBTITLES_SETUP.md):
//   cd server && npm install @heygen/hyperframes
//   (Chromium + FFmpeg must be available on the host)
//   set ENABLE_HYPERFRAMES=true
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

// Parse SRT → [{ start, end, text }] in seconds.
function parseSrt(srt) {
  const blocks = srt.replace(/\r/g, '').split(/\n\n+/);
  const toSec = (t) => {
    const m = t.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
    if (!m) return 0;
    return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
  };
  const cues = [];
  for (const b of blocks) {
    const lines = b.split('\n');
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const [s, e] = timeLine.split('-->').map((x) => toSec(x.trim()));
    const text = lines.slice(lines.indexOf(timeLine) + 1).join('\n').trim();
    if (text) cues.push({ start: s, end: e, text });
  }
  return cues;
}

// Build the HyperFrames HTML document (animated fade/slide per cue).
function buildHtml(cues, style = {}) {
  const fontSize = parseInt(style.fontSize) || 28;
  const color = style.color || '#FFFFFF';
  const pos = style.position === 'top' ? 'top:8%' : style.position === 'middle' ? 'top:45%' : 'bottom:8%';
  const cueEls = cues
    .map(
      (c) => `<div class="cue" data-start="${c.start}" data-end="${c.end}">${c.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')}</div>`
    )
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;width:1920px;height:1080px;font-family:'Noto Sans HK',sans-serif}
    .cue{position:absolute;left:50%;transform:translateX(-50%);${pos};
      max-width:80%;text-align:center;font-size:${fontSize}px;color:${color};
      text-shadow:0 2px 6px rgba(0,0,0,.9);opacity:0;transition:opacity .25s ease}
    .cue.active{opacity:1}
  </style></head><body>${cueEls}
  <script>
    // HyperFrames drives a seekable timeline; reveal cues by current time.
    window.__hyperframes_seek = function(t){
      document.querySelectorAll('.cue').forEach(function(el){
        var s=+el.dataset.start, e=+el.dataset.end;
        el.classList.toggle('active', t>=s && t<=e);
      });
    };
  </script></body></html>`;
}

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let err = '';
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${code}: ${err.slice(-600)}`))));
    p.on('error', reject);
  });

export async function renderAnimatedSubtitles({ videoPath, srt, style }) {
  if (!srt) throw new Error('srt required');
  const id = randomUUID();
  const htmlPath = path.join(os.tmpdir(), `${id}.html`);
  const overlayPath = path.join(os.tmpdir(), `${id}.overlay.mov`); // transparent overlay
  const outPath = path.join(os.tmpdir(), `${id}.out.mp4`);

  const cues = parseSrt(srt);
  await fs.promises.writeFile(htmlPath, buildHtml(cues, style), 'utf8');

  // Render the HTML timeline to a transparent overlay video via HyperFrames.
  const { render } = await import('@heygen/hyperframes');
  await render({
    input: htmlPath,
    output: overlayPath,
    width: 1920,
    height: 1080,
    fps: 30,
    transparent: true,
    seekFn: '__hyperframes_seek',
    duration: cues.length ? cues[cues.length - 1].end + 1 : 5,
  });

  // Composite the overlay onto the source video with FFmpeg.
  await run('ffmpeg', ['-y', '-i', videoPath, '-i', overlayPath,
    '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto',
    '-c:a', 'copy', '-preset', 'veryfast', outPath]);

  [htmlPath, overlayPath].forEach((f) => fs.promises.unlink(f).catch(() => {}));
  return outPath;
}
