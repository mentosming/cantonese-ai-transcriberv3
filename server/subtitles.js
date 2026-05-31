// Server-side subtitle burning with a template library + async render jobs.
//
//   GET  /api/subtitle-templates        → available animated/static templates
//   POST /api/subtitle-jobs             → create render job (video + srt + template) → { jobId }
//   GET  /api/subtitle-jobs/:id         → { status, progress, error }
//   GET  /api/subtitle-jobs/:id/download→ stream finished MP4
//
// Static templates burn via FFmpeg (needs libass). "Animated" templates use
// HyperFrames when ENABLE_HYPERFRAMES=true, else gracefully fall back to the
// closest static style. See SUBTITLES_SETUP.md.
import express from 'express';
import multer from 'multer';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

// --- Template library ---
// `style` → FFmpeg force_style fields; `animation` → HyperFrames preset name.
export const TEMPLATES = [
  { id: 'classic',     name: '經典白字',   animation: null,      style: { fontSize: 24, color: 'FFFFFF', outline: 2, position: 'bottom' } },
  { id: 'news',        name: '新聞黃字',   animation: null,      style: { fontSize: 28, color: 'FFE000', outline: 3, position: 'bottom', bold: true } },
  { id: 'cinema',      name: '電影置中',   animation: null,      style: { fontSize: 26, color: 'F5F5F5', outline: 2, position: 'bottom' } },
  { id: 'tiktok',      name: 'TikTok 大字', animation: 'pop',    style: { fontSize: 40, color: 'FFFFFF', outline: 4, position: 'middle', bold: true } },
  { id: 'karaoke',     name: 'Karaoke 逐字', animation: 'karaoke', style: { fontSize: 34, color: 'FFFFFF', outline: 3, position: 'bottom' } },
];

const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

// In-memory job store (fine for a single instance; use Redis for multi-instance).
const jobs = new Map();
const JOB_TTL_MS = 60 * 60 * 1000;

const run = (cmd, args, onStderr) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let err = '';
    p.stderr.on('data', (d) => { const s = d.toString(); err += s; onStderr?.(s); });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${code}: ${err.slice(-800)}`))));
    p.on('error', reject);
  });

const buildForceStyle = (style = {}) => {
  const fontSize = Math.max(8, Math.min(96, parseInt(style.fontSize) || 24));
  const color = (style.color || 'FFFFFF').replace('#', '');
  const rr = color.slice(0, 2), gg = color.slice(2, 4), bb = color.slice(4, 6);
  const assColor = `&H00${bb}${gg}${rr}`;
  const alignment = style.position === 'top' ? 8 : style.position === 'middle' ? 5 : 2;
  const bold = style.bold ? ',Bold=1' : '';
  // "Noto Sans CJK HK" matches the family installed by fonts-noto-cjk (see Dockerfile).
  return `FontName=Noto Sans CJK HK,FontSize=${fontSize},PrimaryColour=${assColor},Outline=${style.outline ?? 2},BorderStyle=1,MarginV=40,Alignment=${alignment}${bold}`;
};

// Probe duration (seconds) for progress estimation.
const probeDuration = (file) =>
  new Promise((resolve) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    let out = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.on('close', () => resolve(parseFloat(out) || 0));
    p.on('error', () => resolve(0));
  });

async function processJob(job, videoPath, srtPath, template) {
  job.status = 'processing';
  const total = await probeDuration(videoPath);

  try {
    if (template.animation && process.env.ENABLE_HYPERFRAMES === 'true') {
      const { renderAnimatedSubtitles } = await import('./hyperframesRenderer.js');
      const srt = await fs.promises.readFile(srtPath, 'utf8');
      job.outputPath = await renderAnimatedSubtitles({ videoPath, srt, style: { ...template.style, animation: template.animation } });
    } else {
      const force = buildForceStyle(template.style);
      const vf = `subtitles='${srtPath.replace(/([:\\])/g, '\\$1')}':force_style='${force}'`;
      await run('ffmpeg', ['-y', '-i', videoPath, '-vf', vf, '-c:a', 'copy', '-preset', 'veryfast', job.outputPath],
        (s) => {
          const m = s.match(/time=(\d{2}):(\d{2}):(\d{2})/);
          if (m && total > 0) {
            const done = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
            job.progress = Math.min(99, Math.round((done / total) * 100));
          }
        });
    }
    job.progress = 100;
    job.status = 'done';
  } catch (e) {
    job.status = 'error';
    job.error = e.message;
  } finally {
    [videoPath, srtPath].forEach((f) => fs.promises.unlink(f).catch(() => {}));
    setTimeout(() => {
      if (job.outputPath) fs.promises.unlink(job.outputPath).catch(() => {});
      jobs.delete(job.id);
    }, JOB_TTL_MS);
  }
}

export function createSubtitleRouter() {
  const router = express.Router();

  router.get('/api/subtitle-templates', (_req, res) => {
    res.json(TEMPLATES.map(({ id, name, animation }) => ({ id, name, animated: !!animation })));
  });

  router.post('/api/subtitle-jobs', upload.single('video'), async (req, res) => {
    const video = req.file;
    const srt = req.body?.srt;
    const template = TEMPLATE_BY_ID[req.body?.template] || TEMPLATES[0];
    if (!video || !srt) {
      if (video) fs.promises.unlink(video.path).catch(() => {});
      return res.status(400).json({ error: 'video file and srt are required' });
    }

    const id = randomUUID();
    const srtPath = path.join(os.tmpdir(), `${id}.srt`);
    await fs.promises.writeFile(srtPath, srt, 'utf8');

    const job = { id, status: 'queued', progress: 0, outputPath: path.join(os.tmpdir(), `${id}.out.mp4`), error: null, createdAt: Date.now() };
    jobs.set(id, job);
    processJob(job, video.path, srtPath, template); // fire and forget
    res.json({ jobId: id });
  });

  router.get('/api/subtitle-jobs/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'job not found' });
    res.json({ status: job.status, progress: job.progress, error: job.error });
  });

  router.get('/api/subtitle-jobs/:id/download', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job || job.status !== 'done') return res.status(409).json({ error: 'not ready' });
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="subtitled.mp4"');
    fs.createReadStream(job.outputPath).pipe(res);
  });

  return router;
}
