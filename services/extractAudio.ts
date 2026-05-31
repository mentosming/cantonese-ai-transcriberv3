import { detectSpeechOnsets } from './vadAlign';

// Decode a video/audio file's audio track and re-encode it as a compact
// 16 kHz mono WAV — so we upload a small audio file (not a huge video) for
// transcription. Runs entirely in the browser via WebAudio.

const encodeWav = (samples: Float32Array, sampleRate: number): Blob => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);          // PCM
  view.setUint16(22, 1, true);          // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
};

// Decode any media file's audio to 16 kHz mono PCM samples.
const decodeMono16k = async (file: File): Promise<{ samples: Float32Array; sampleRate: number }> => {
  const arrayBuffer = await file.arrayBuffer();
  const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    ctx.close?.();
  }
  const targetRate = 16000;
  const length = Math.max(1, Math.ceil(audioBuffer.duration * targetRate));
  const offline = new (window as any).OfflineAudioContext(1, length, targetRate);
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(offline.destination);
  src.start();
  const rendered: AudioBuffer = await offline.startRendering();
  return { samples: rendered.getChannelData(0), sampleRate: targetRate };
};

/** A single 16 kHz mono WAV (whole file). Throws if no decodable audio. */
export const extractAudioWav = async (file: File): Promise<File> => {
  const { samples, sampleRate } = await decodeMono16k(file);
  const wav = encodeWav(samples, sampleRate);
  return new File([wav], `${file.name.replace(/\.[^.]+$/, "")}.wav`, { type: "audio/wav" });
};

/**
 * Split a media file's audio into ~chunkSec-long 16 kHz mono WAV chunks so long
 * videos can be transcribed reliably (each request returns quickly). Returns
 * each chunk's File plus its start offset (seconds) on the original timeline.
 */
const sliceToChunks = (samples: Float32Array, sampleRate: number, chunkSec: number) => {
  const chunkLen = Math.max(1, Math.floor(chunkSec * sampleRate));
  const out: { file: File; startSec: number }[] = [];
  for (let i = 0; i < samples.length; i += chunkLen) {
    const slice = samples.subarray(i, Math.min(i + chunkLen, samples.length));
    const wav = encodeWav(slice, sampleRate);
    out.push({ file: new File([wav], `chunk_${out.length}.wav`, { type: "audio/wav" }), startSec: i / sampleRate });
  }
  return out;
};

export const extractAudioChunks = async (
  file: File,
  chunkSec = 120
): Promise<{ file: File; startSec: number }[]> => {
  const { samples, sampleRate } = await decodeMono16k(file);
  return sliceToChunks(samples, sampleRate, chunkSec);
};

/**
 * One decode pass that yields both the transcription chunks and the speech
 * onset times (for VAD timing alignment) — avoids decoding the audio twice.
 */
export const extractForSubtitles = async (
  file: File,
  chunkSec = 120
): Promise<{ chunks: { file: File; startSec: number }[]; onsets: number[]; sampleRate: number; samples: Float32Array }> => {
  const { samples, sampleRate } = await decodeMono16k(file);
  const chunks = sliceToChunks(samples, sampleRate, chunkSec);
  const onsets = detectSpeechOnsets(samples, sampleRate);
  return { chunks, onsets, sampleRate, samples };
};
