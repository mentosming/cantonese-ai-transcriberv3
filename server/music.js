import express from 'express';

// Curated royalty-free background-music library. Seeded with SoundHelix
// (free-to-use instrumental tracks). Swap `src` for your own licensed tracks
// in production. Served through this server so the browser can fetch them
// same-origin (needed for WebAudio mixing + preview without CORS issues).
export const MUSIC_LIBRARY = [
  { id: 'mb-upbeat',   title: '輕快律動',  moods: ['輕快', '活力', 'Vlog', '旅行', '正能量'], src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 'mb-warm',     title: '溫柔旋律',  moods: ['溫暖', '感性', '溫馨', '流行'],         src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { id: 'mb-steady',   title: '沉穩節拍',  moods: ['沉穩', '專業', '商務', '科技'],         src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' },
  { id: 'mb-chill',    title: '放鬆氛圍',  moods: ['放鬆', '平靜', 'Lo-fi', '沉思'],         src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
  { id: 'mb-cinema',   title: '電影史詩',  moods: ['電影', '史詩', '激昂', '感動'],         src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3' },
  { id: 'mb-happy',    title: '歡樂明亮',  moods: ['歡樂', '可愛', '派對', '活潑'],         src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3' },
];

export const createMusicRouter = () => {
  const r = express.Router();

  // List the library (no raw source URLs exposed to the client).
  r.get('/api/music', (_req, res) => {
    res.json(MUSIC_LIBRARY.map(({ id, title, moods }) => ({ id, title, moods })));
  });

  // Proxy/stream a track so the browser gets it same-origin (CORS-safe).
  r.get('/api/music/:id', async (req, res) => {
    const t = MUSIC_LIBRARY.find((m) => m.id === req.params.id);
    if (!t) return res.status(404).json({ error: '找不到此音樂' });
    try {
      const up = await fetch(t.src);
      if (!up.ok) return res.status(502).json({ error: '音樂來源暫時無法取得' });
      res.setHeader('Content-Type', up.headers.get('content-type') || 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(Buffer.from(await up.arrayBuffer()));
    } catch {
      res.status(502).json({ error: '音樂下載失敗' });
    }
  });

  return r;
};
