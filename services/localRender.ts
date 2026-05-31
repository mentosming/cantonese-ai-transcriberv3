import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { drawCaption, pickRecorderMime, CaptionStyle } from "./captionRenderer";
import { Cue } from "./srtUtil";

type Ov = Partial<CaptionStyle> | undefined;

export interface Segment { start: number; end: number; label?: string }

/**
 * Render an AI highlight reel: plays only the given segments in order while
 * capturing canvas (frame + caption) + audio to a recorded file. Real-time;
 * brief seams at segment boundaries. Works locally (no server/libass).
 */
export const renderHighlights = async (
  videoFile: File,
  segments: Segment[],
  cues: Cue[],
  template: string,
  onProgress: (p: number) => void,
  overrides?: Ov,
  bilingual?: boolean
): Promise<{ blob: Blob; ext: string }> => {
  const segs = [...segments].filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  if (!segs.length) throw new Error('沒有精華片段');
  const totalDur = segs.reduce((a, s) => a + (s.end - s.start), 0);

  const url = URL.createObjectURL(videoFile);
  const video = document.createElement('video');
  video.src = url; video.playsInline = true; video.muted = false; video.volume = 1;
  await new Promise<void>((res, rej) => { video.onloadedmetadata = () => res(); video.onerror = () => rej(new Error('影片載入失敗')); });

  const W = video.videoWidth || 1280, H = video.videoHeight || 720;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas 不可用');

  const cstream = (canvas as any).captureStream(30) as MediaStream;
  let audioTrack: MediaStreamTrack | undefined;
  try { audioTrack = (video as any).captureStream?.().getAudioTracks?.()[0]; } catch {}
  const tracks = [...cstream.getVideoTracks()]; if (audioTrack) tracks.push(audioTrack);
  const { mime, ext } = pickRecorderMime();
  const rec = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  let segIdx = 0, elapsedBefore = 0, raf = 0, stopped = false;

  return new Promise<{ blob: Blob; ext: string }>((resolve, reject) => {
    const finish = () => {
      if (stopped) return; stopped = true;
      cancelAnimationFrame(raf);
      try { rec.stop(); } catch {}
    };
    rec.onstop = () => { video.pause(); URL.revokeObjectURL(url); onProgress(1); resolve({ blob: new Blob(chunks, { type: mime || 'video/webm' }), ext }); };
    rec.onerror = () => reject(new Error('錄製失敗'));

    const loop = () => {
      if (stopped) return;
      const seg = segs[segIdx];
      const t = video.currentTime;
      if (t >= seg.end - 0.03) {
        elapsedBefore += seg.end - seg.start;
        segIdx++;
        if (segIdx >= segs.length) { finish(); return; }
        video.currentTime = segs[segIdx].start;
        raf = requestAnimationFrame(loop);
        return;
      }
      ctx.drawImage(video, 0, 0, W, H);
      const cue = cues.find((c) => t >= c.start && t <= c.end);
      if (cue) drawCaption(ctx, cue.text, template, (t - cue.start) / Math.max(0.1, cue.end - cue.start), W, H, cue.anim ? { ...overrides, animation: cue.anim } : overrides, cue.emphasis, bilingual ? cue.translation : undefined);
      onProgress(Math.min(0.99, (elapsedBefore + Math.max(0, t - seg.start)) / totalDur));
      raf = requestAnimationFrame(loop);
    };

    video.currentTime = segs[0].start;
    const startWhenReady = () => {
      video.play().then(() => { rec.start(100); raf = requestAnimationFrame(loop); }).catch(reject);
    };
    // wait for the initial seek to land
    if (video.readyState >= 2 && Math.abs(video.currentTime - segs[0].start) < 0.3) startWhenReady();
    else video.onseeked = () => { video.onseeked = null; startWhenReady(); };
  });
};

// True MP4 export needs WebCodecs encoders + a frame source we can pull from.
export const canUseWebCodecs = (): boolean =>
  typeof (window as any).VideoEncoder !== "undefined" &&
  typeof (window as any).VideoFrame !== "undefined" &&
  typeof (window as any).MediaStreamTrackProcessor !== "undefined";

/**
 * Render to a real .mp4 (H.264 + AAC) in-browser via WebCodecs + mp4-muxer.
 * Draws video frame + caption onto a canvas, encodes each frame, and passes the
 * original audio through an AAC encoder. Runs at playback speed.
 */
export const renderLocallyMp4 = async (
  videoFile: File,
  cues: Cue[],
  template: string,
  onProgress: (p: number) => void,
  overrides?: Ov,
  bilingual?: boolean
): Promise<{ blob: Blob; ext: string }> => {
  const url = URL.createObjectURL(videoFile);
  const video = document.createElement("video");
  video.src = url; video.playsInline = true; video.muted = false; video.volume = 1;
  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error("影片載入失敗"));
  });

  const W = (video.videoWidth || 1280) & ~1;   // H.264 needs even dimensions
  const H = (video.videoHeight || 720) & ~1;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 不可用");
  const dur = video.duration || (cues.length ? cues[cues.length - 1].end : 1);

  // Optional original audio.
  let audioTrack: MediaStreamTrack | undefined;
  try { audioTrack = (video as any).captureStream?.().getAudioTracks?.()[0]; } catch {}
  const aSettings: any = audioTrack?.getSettings?.() || {};
  const sampleRate = aSettings.sampleRate || 48000;
  const channels = aSettings.channelCount || 2;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: W, height: H, frameRate: 30 },
    ...(audioTrack ? { audio: { codec: "aac", numberOfChannels: channels, sampleRate } } : {}),
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  const videoEncoder = new (window as any).VideoEncoder({
    output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
    error: (e: any) => console.error("VideoEncoder", e),
  });
  videoEncoder.configure({ codec: "avc1.640028", width: W, height: H, bitrate: 8_000_000, framerate: 30 });

  let audioEncoder: any;
  let audioReader: any;
  if (audioTrack) {
    audioEncoder = new (window as any).AudioEncoder({
      output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
      error: (e: any) => console.error("AudioEncoder", e),
    });
    audioEncoder.configure({ codec: "mp4a.40.2", numberOfChannels: channels, sampleRate, bitrate: 128_000 });
    const processor = new (window as any).MediaStreamTrackProcessor({ track: audioTrack });
    audioReader = processor.readable.getReader();
  }

  const pumpAudio = async () => {
    if (!audioReader) return;
    try {
      while (true) {
        const { done, value } = await audioReader.read();
        if (done) break;
        try { audioEncoder.encode(value); } catch {}
        value.close();
      }
    } catch { /* stream ended */ }
  };

  let frameCount = 0;
  const encodeAt = (tSec: number) => {
    ctx.drawImage(video, 0, 0, W, H);
    const cue = cues.find((c) => tSec >= c.start && tSec <= c.end);
    if (cue) drawCaption(ctx, cue.text, template, (tSec - cue.start) / Math.max(0.1, cue.end - cue.start), W, H, cue.anim ? { ...overrides, animation: cue.anim } : overrides, cue.emphasis, bilingual ? cue.translation : undefined);
    const vf = new (window as any).VideoFrame(canvas, { timestamp: Math.max(0, Math.round(tSec * 1e6)) });
    videoEncoder.encode(vf, { keyFrame: frameCount % 60 === 0 });
    vf.close();
    frameCount++;
    onProgress(Math.min(0.99, tSec / dur));
  };

  return new Promise<{ blob: Blob; ext: string }>((resolve, reject) => {
    const finish = async () => {
      try {
        await videoEncoder.flush();
        if (audioReader) { try { await audioReader.cancel(); } catch {} }
        if (audioEncoder) { try { await audioEncoder.flush(); } catch {} }
        muxer.finalize();
        const buffer = (muxer.target as ArrayBufferTarget).buffer;
        URL.revokeObjectURL(url);
        onProgress(1);
        resolve({ blob: new Blob([buffer], { type: "video/mp4" }), ext: "mp4" });
      } catch (e) { reject(e); }
    };
    video.onended = finish;
    video.onerror = () => reject(new Error("render 失敗"));
    const rvfc = (video as any).requestVideoFrameCallback?.bind(video);
    video.play().then(() => {
      if (audioTrack) pumpAudio();
      if (rvfc) {
        const cb = (_n: number, meta: any) => { encodeAt(meta?.mediaTime ?? video.currentTime); if (!video.ended) rvfc(cb); };
        rvfc(cb);
      } else {
        const id = setInterval(() => { if (video.ended) { clearInterval(id); return; } encodeAt(video.currentTime); }, 1000 / 30);
      }
    }).catch(reject);
  });
};

/**
 * Render subtitles into the video entirely in-browser: draw each played frame
 * + caption onto a canvas, capture it as a stream, mux with the original audio,
 * and record to a file. Real-time (runs at playback speed). Chrome/desktop.
 */
export const renderLocally = async (
  videoFile: File,
  cues: Cue[],
  template: string,
  onProgress: (p: number) => void,
  overrides?: Ov,
  bilingual?: boolean
): Promise<{ blob: Blob; ext: string }> => {
  const url = URL.createObjectURL(videoFile);
  const video = document.createElement("video");
  video.src = url;
  video.playsInline = true;
  // Audio must be audible for captureStream to include the audio track.
  video.muted = false;
  video.volume = 1;

  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error("影片載入失敗"));
  });

  const W = video.videoWidth || 1280;
  const H = video.videoHeight || 720;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");

  const fps = 30;
  const cstream = (canvas as any).captureStream(fps) as MediaStream;

  // Pull the audio track off the source video.
  let audioTrack: MediaStreamTrack | undefined;
  try {
    const vstream = (video as any).captureStream?.() as MediaStream | undefined;
    audioTrack = vstream?.getAudioTracks?.()[0];
  } catch {
    /* no audio capture support */
  }

  const tracks: MediaStreamTrack[] = [...cstream.getVideoTracks()];
  if (audioTrack) tracks.push(audioTrack);
  const mixed = new MediaStream(tracks);

  const { mime, ext } = pickRecorderMime();
  const rec = new MediaRecorder(
    mixed,
    mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined
  );
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  const dur = video.duration || (cues.length ? cues[cues.length - 1].end : 1);
  let raf = 0;

  const draw = () => {
    ctx.drawImage(video, 0, 0, W, H);
    const t = video.currentTime;
    const cue = cues.find((c) => t >= c.start && t <= c.end);
    if (cue) {
      const prog = (t - cue.start) / Math.max(0.1, cue.end - cue.start);
      drawCaption(ctx, cue.text, template, prog, W, H, cue.anim ? { ...overrides, animation: cue.anim } : overrides, cue.emphasis, bilingual ? cue.translation : undefined);
    }
    onProgress(Math.min(0.99, t / dur));
    raf = requestAnimationFrame(draw);
  };

  return new Promise<{ blob: Blob; ext: string }>((resolve, reject) => {
    rec.onstop = () => {
      cancelAnimationFrame(raf);
      video.pause();
      URL.revokeObjectURL(url);
      onProgress(1);
      resolve({ blob: new Blob(chunks, { type: mime || "video/webm" }), ext });
    };
    video.onended = () => { try { rec.stop(); } catch {} };
    rec.onerror = () => reject(new Error("錄製失敗"));
    rec.start(100);
    video.play().then(draw).catch((e) => reject(e));
  });
};
