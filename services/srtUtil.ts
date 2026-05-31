// Convert the app's transcript text into SRT subtitle format.
// Lines look like: "[MM:SS - MM:SS] Speaker: content" or "[HH:MM:SS] content".

const parseTimeToSeconds = (t: string): number => {
  const p = t.split(':').map(Number);
  if (p.some(isNaN)) return 0;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return 0;
};

const fmtSrt = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  const pad = (n: number, l = 2) => n.toString().padStart(l, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
};

export interface Cue {
  start: number;   // seconds
  end: number;     // seconds
  speaker?: string;
  text: string;
  anim?: 'none' | 'fade' | 'pop' | 'slide'; // per-cue entrance animation (AI)
  emphasis?: string[];                       // key words to highlight (AI)
  translation?: string;                      // translated text (bilingual)
  charProgress?: number[];                   // per-(non-space)-char highlight fraction 0..1 (VAD word timing)
}

const fmtClock = (sec: number): string => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
};

// Serialize cues back into the app's transcript text ("[MM:SS - MM:SS] text"),
// so chunked results can be offset and re-parsed by transcriptToCues.
export const cuesToTranscript = (cues: Cue[]): string =>
  cues
    .map((c) => `[${fmtClock(c.start)} - ${fmtClock(c.end > c.start ? c.end : c.start + 1)}]${c.speaker ? ` ${c.speaker}:` : ''} ${c.text}`)
    .join('\n');

// Parse the app's transcript text into structured cues (for timeline/preview).
export const transcriptToCues = (text: string): Cue[] => {
  const lines = text.split('\n');
  const cues: Cue[] = [];
  for (const line of lines) {
    const m = line.match(
      /^\[(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?))?\]\s*(?:(.*?):)?\s*(.*)/
    );
    if (!m) continue;
    const start = parseTimeToSeconds(m[1]);
    const end = m[2] ? parseTimeToSeconds(m[2]) : start + 3;
    const content = (m[4] || '').trim();
    if (!content) continue;
    cues.push({ start, end: end > start ? end : start + 3, speaker: m[3]?.trim(), text: content });
  }
  for (let i = 0; i < cues.length - 1; i++) {
    if (cues[i].end > cues[i + 1].start) cues[i].end = cues[i + 1].start;
  }
  return cues;
};

// Build SRT directly from (possibly edited) cue objects.
export const cuesToSrt = (cues: Cue[], includeSpeaker = false, bilingual = false): string => {
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  return sorted
    .map((c, i) => {
      let text = includeSpeaker && c.speaker ? `${c.speaker}: ${c.text}` : c.text;
      if (bilingual && c.translation) text += `\n${c.translation}`;
      return `${i + 1}\n${fmtSrt(c.start)} --> ${fmtSrt(c.end > c.start ? c.end : c.start + 1)}\n${text}\n`;
    })
    .join('\n');
};

const fmtVtt = (sec: number): string => fmtSrt(sec).replace(',', '.');

// WebVTT export (browsers, <track>, web players). Optional second line = translation.
export const cuesToVtt = (cues: Cue[], bilingual = false): string => {
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  return 'WEBVTT\n\n' + sorted
    .map((c, i) => {
      const second = bilingual && c.translation ? `\n${c.translation}` : '';
      return `${i + 1}\n${fmtVtt(c.start)} --> ${fmtVtt(c.end > c.start ? c.end : c.start + 1)}\n${c.text}${second}\n`;
    })
    .join('\n');
};

// Plain transcript text (no timecodes). Optional translation lines.
export const cuesToPlainText = (cues: Cue[], bilingual = false): string =>
  [...cues]
    .sort((a, b) => a.start - b.start)
    .map((c) => (bilingual && c.translation ? `${c.text}\n${c.translation}` : c.text))
    .join('\n');

// Split long cues into short, one-line subtitle cues. Breaks on punctuation,
// then by max length, distributing each cue's time proportionally to text.
export const splitForSubtitles = (cues: Cue[], maxChars = 16): Cue[] => {
  const out: Cue[] = [];
  for (const c of cues) {
    const text = (c.text || '').trim();
    if (!text) continue;
    // Skip non-speech markers like [Silence] / [Music] / [靜音] / [音樂].
    if (/^\[[^\]]*\]$/.test(text)) continue;
    const dur = Math.max(0.3, c.end - c.start);

    const pieces: string[] = [];
    // Split after sentence/clause punctuation (CJK + latin), keep the mark.
    const parts = text.split(/(?<=[。！？!?，,；;、…])\s*/);
    for (let part of parts) {
      part = part.trim();
      if (!part) continue;
      if (part.length <= maxChars) { pieces.push(part); continue; }
      // Hard-wrap anything still too long.
      for (let i = 0; i < part.length; i += maxChars) pieces.push(part.slice(i, i + maxChars).trim());
    }
    if (!pieces.length) pieces.push(text);

    const totalLen = pieces.reduce((a, p) => a + p.length, 0) || 1;
    let t = c.start;
    pieces.forEach((p, i) => {
      const d = i === pieces.length - 1 ? c.end - t : dur * (p.length / totalLen);
      out.push({ start: t, end: t + d, speaker: c.speaker, text: p });
      t += d;
    });
  }
  return out;
};

export const transcriptToSrt = (text: string, includeSpeaker = false): string => {
  const lines = text.split('\n');
  const cues: { start: number; end: number; text: string }[] = [];

  for (const line of lines) {
    const m = line.match(
      /^\[(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?))?\]\s*(?:(.*?):)?\s*(.*)/
    );
    if (!m) continue;
    const start = parseTimeToSeconds(m[1]);
    const end = m[2] ? parseTimeToSeconds(m[2]) : start + 3;
    const speaker = m[3];
    const content = (m[4] || '').trim();
    if (!content) continue;
    cues.push({ start, end: end > start ? end : start + 3, text: includeSpeaker && speaker ? `${speaker}: ${content}` : content });
  }

  // Prevent overlaps: clamp each cue's end to the next cue's start.
  for (let i = 0; i < cues.length - 1; i++) {
    if (cues[i].end > cues[i + 1].start) cues[i].end = cues[i + 1].start;
  }

  return cues
    .map((c, i) => `${i + 1}\n${fmtSrt(c.start)} --> ${fmtSrt(c.end)}\n${c.text}\n`)
    .join('\n');
};
