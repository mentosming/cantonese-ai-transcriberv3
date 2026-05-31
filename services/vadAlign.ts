// Lightweight VAD (voice-activity detection) to refine subtitle timing.
// Gemini gives approximate per-line timestamps; here we detect real speech
// onsets from the audio energy envelope and snap each cue's start to the
// nearest onset, tightening sync without a heavyweight forced aligner.

import { Cue } from './srtUtil';

/**
 * Detect speech onset times (seconds) from 16 kHz mono PCM samples.
 * An onset = energy rising above an adaptive threshold after a gap of silence.
 */
export const detectSpeechOnsets = (samples: Float32Array, sampleRate: number): number[] => {
  const frame = Math.max(1, Math.floor(sampleRate * 0.02)); // 20 ms frames
  const energies: number[] = [];
  for (let i = 0; i + frame <= samples.length; i += frame) {
    let sum = 0;
    for (let j = 0; j < frame; j++) { const s = samples[i + j]; sum += s * s; }
    energies.push(Math.sqrt(sum / frame));
  }
  if (energies.length < 3) return [0];

  // Adaptive threshold between the noise floor (20th pct) and loud peaks (95th).
  const sorted = [...energies].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.2)] || 0;
  const peak = sorted[Math.floor(sorted.length * 0.95)] || floor + 0.01;
  const thresh = floor + (peak - floor) * 0.15;

  const minSilenceFrames = 6; // ~120 ms of silence before a new onset counts
  const onsets: number[] = [];
  let inSpeech = false;
  let silenceRun = minSilenceFrames; // start "silent" so the first speech registers
  for (let k = 0; k < energies.length; k++) {
    if (energies[k] > thresh) {
      if (!inSpeech && silenceRun >= minSilenceFrames) onsets.push((k * frame) / sampleRate);
      inSpeech = true;
      silenceRun = 0;
    } else {
      silenceRun++;
      if (silenceRun >= minSilenceFrames) inSpeech = false;
    }
  }
  if (!onsets.length || onsets[0] > 0.15) onsets.unshift(0);
  return onsets;
};

/**
 * Per-character ("逐字") timing from the speech-energy envelope. For each cue,
 * place each non-space character at the point where the cue's cumulative voiced
 * energy reaches its share — so karaoke highlight follows the real speech
 * rhythm (clusters on syllables, skips silence) instead of linear interpolation.
 * Writes `charProgress` (fractions 0..1 within each cue).
 */
export const alignCharsToEnergy = (samples: Float32Array, sampleRate: number, cues: Cue[]): Cue[] => {
  const frame = Math.max(1, Math.floor(sampleRate * 0.02)); // 20 ms
  return cues.map((c) => {
    const n = (c.text.match(/\S/g) || []).length;
    if (n <= 1) return c;
    const i0 = Math.max(0, Math.floor(c.start * sampleRate));
    const i1 = Math.min(samples.length, Math.floor(c.end * sampleRate));
    const span = i1 - i0;
    if (span < frame * 3) return c;

    const energies: number[] = [];
    for (let i = i0; i + frame <= i1; i += frame) {
      let sum = 0;
      for (let j = 0; j < frame; j++) { const v = samples[i + j]; sum += v * v; }
      energies.push(Math.sqrt(sum / frame));
    }
    if (energies.length < 2) return c;

    const sorted = [...energies].sort((a, b) => a - b);
    const floor = sorted[Math.floor(sorted.length * 0.2)] || 0;
    const voiced = energies.map((e) => Math.max(0, e - floor));
    const total = voiced.reduce((a, b) => a + b, 0) || 1;

    const charProgress: number[] = [];
    let cum = 0, fi = 0;
    for (let k = 0; k < n; k++) {
      const target = ((k + 1) / n) * total;
      while (fi < voiced.length && cum < target) { cum += voiced[fi]; fi++; }
      charProgress.push(Math.min(1, (fi * frame) / span));
    }
    return { ...c, charProgress };
  });
};

/**
 * Snap each cue's start to the nearest detected speech onset within `maxShift`
 * seconds, keeping cues ordered and non-overlapping. Onsets must be sorted.
 */
export const alignCuesToOnsets = (cues: Cue[], onsets: number[], maxShift = 0.8): Cue[] => {
  if (!onsets.length || !cues.length) return cues;
  const out: Cue[] = [];
  let prevStart = -Infinity;
  for (const c of cues) {
    let best = c.start;
    let bestD = Infinity;
    for (const o of onsets) {
      if (o < prevStart) continue;        // never move before the previous cue
      const d = Math.abs(o - c.start);
      if (d < bestD) { bestD = d; best = o; }
      if (o > c.start && d > bestD) break; // onsets sorted: no closer ones ahead
    }
    const start = bestD <= maxShift ? best : Math.max(c.start, prevStart);
    const end = Math.max(start + 0.3, c.end);
    out.push({ ...c, start, end });
    prevStart = start;
  }
  // Clamp each end to the next start so adjacent lines don't overlap.
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].end > out[i + 1].start) out[i].end = out[i + 1].start;
  }
  return out;
};
