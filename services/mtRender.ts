import { pickRecorderMime, drawCaption, loadCaptionFonts, CaptionStyle } from "./captionRenderer";
import { Cue } from "./srtUtil";

// === Free-form multi-track model ===
// Tracks are layered bottom→top (tracks[0] = bottom). Each track holds clips at
// arbitrary positions; the renderer composites them per frame.
export interface MTClip {
  id: string;
  type: "video" | "image" | "audio";
  url: string;
  name: string;
  in: number;       // source trim in (sec)  — for image: 0
  out: number;      // source trim out (sec) — for image: chosen duration
  start: number;    // position on the output timeline (sec)
  natW?: number;
  natH?: number;
  thumb?: string;
  // Optional transform (normalized). Undefined/scale≥1 → full-frame cover.
  scale?: number;   // width fraction of canvas
  x?: number;       // centre x (0..1)
  y?: number;       // centre y (0..1)
  volume?: number;  // 0..1
  speed?: number;   // playback speed (1 = normal, 2 = 2× faster, 0.5 = slow-mo)
  transIn?: number;  // fade-in seconds
  transOut?: number; // fade-out seconds
}

// Opacity for a clip at time t (transitions). 1 = fully opaque.
export const clipAlpha = (c: MTClip, t: number): number => {
  const s = c.start, e = c.start + clipDur(c);
  let a = 1;
  if (c.transIn && c.transIn > 0 && t < s + c.transIn) a = Math.min(a, (t - s) / c.transIn);
  if (c.transOut && c.transOut > 0 && t > e - c.transOut) a = Math.min(a, (e - t) / c.transOut);
  return Math.max(0, Math.min(1, a));
};

export interface MTTrack {
  id: string;
  kind: "video" | "audio";
  name: string;
  clips: MTClip[];
  muted?: boolean;
  hidden?: boolean;
  locked?: boolean;
  volume?: number;
}

export interface MTCaptions {
  cues: Cue[];
  styleId: string;
  overrides?: Partial<CaptionStyle>;
  bilingual?: boolean;
}

// Effective length on the timeline (source length ÷ speed).
export const clipDur = (c: MTClip) => Math.max(0.1, (c.out - c.in) / (c.type === 'image' ? 1 : (c.speed || 1)));
export const totalDuration = (tracks: MTTrack[]): number =>
  tracks.reduce((m, t) => t.clips.reduce((mm, c) => Math.max(mm, c.start + clipDur(c)), m), 0);

// Draw a source into the canvas: full-frame cover, or scaled PiP if scale<1.
const drawClip = (ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, c: MTClip, W: number, H: number) => {
  if (!sw || !sh) return;
  if (!c.scale || c.scale >= 0.999) {
    const s = Math.max(W / sw, H / sh);
    const dw = sw * s, dh = sh * s;
    ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
    return;
  }
  const w = c.scale * W, h = w * (sh / sw);
  const cx = (c.x ?? 0.5) * W, cy = (c.y ?? 0.5) * H;
  ctx.drawImage(src, cx - w / 2, cy - h / 2, w, h);
};

interface Loaded { el: HTMLVideoElement | HTMLImageElement | HTMLAudioElement; track: MTTrack; clip: MTClip; gain?: GainNode; playing: boolean; }

/**
 * Render all tracks into one recorded file. Real-time, layered compositing:
 * per frame, each video track's active clip is drawn bottom→top; all video/audio
 * clip audio is mixed through a WebAudio graph. Captions burned on top.
 */
export const renderMultiTrack = async (
  tracks: MTTrack[],
  W: number,
  H: number,
  onProgress: (p: number) => void,
  captionLayers?: MTCaptions[],   // up to a few stacked subtitle layers
): Promise<{ blob: Blob; ext: string }> => {
  const total = totalDuration(tracks);
  if (total <= 0) throw new Error("時間線冇片段");
  const layers = (captionLayers || []).filter((l) => l.cues.length);
  if (layers.length) await loadCaptionFonts();

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");

  const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
  const actx = new AC();
  await actx.resume?.();
  const dest = actx.createMediaStreamDestination();

  // Preload every clip + wire audio.
  const media: Loaded[] = [];
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.type === "image") {
        const img = new Image();
        img.src = clip.url;
        await new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); });
        media.push({ el: img, track, clip, playing: false });
      } else {
        const el = document.createElement(clip.type === "audio" ? "audio" : "video") as HTMLMediaElement;
        el.src = clip.url; (el as any).playsInline = true; el.muted = false;
        await new Promise<void>((r) => { el.onloadedmetadata = () => r(); el.onerror = () => r(); });
        let gain: GainNode | undefined;
        try { gain = actx.createGain(); gain.gain.value = 0; actx.createMediaElementSource(el).connect(gain); gain.connect(dest); } catch {}
        media.push({ el, track, clip, gain, playing: false });
      }
    }
  }

  const cstream = (canvas as any).captureStream(30) as MediaStream;
  const mixTracks = [...cstream.getVideoTracks(), ...dest.stream.getAudioTracks()];
  const { mime, ext } = pickRecorderMime();
  const rec = new MediaRecorder(new MediaStream(mixTracks), mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  return new Promise<{ blob: Blob; ext: string }>((resolve, reject) => {
    rec.onstop = () => {
      media.forEach((m) => { if (!(m.el instanceof HTMLImageElement)) (m.el as HTMLMediaElement).pause(); });
      actx.close?.();
      onProgress(1);
      resolve({ blob: new Blob(chunks, { type: mime || "video/webm" }), ext });
    };
    rec.onerror = () => reject(new Error("錄製失敗"));
    rec.start(100);

    const t0 = performance.now();
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      if (t >= total) { try { rec.stop(); } catch {} return; }

      // Sync each media element's playback/volume to the timeline.
      for (const m of media) {
        if (m.el instanceof HTMLImageElement) continue;
        const c = m.clip, el = m.el as HTMLMediaElement;
        const within = t >= c.start && t < c.start + clipDur(c);
        if (within) {
          if (!m.playing) { el.playbackRate = c.speed || 1; el.currentTime = c.in + (t - c.start) * (c.speed || 1); el.play().catch(() => {}); m.playing = true; }
          if (m.gain) m.gain.gain.value = m.track.muted ? 0 : (c.volume ?? m.track.volume ?? 1);
        } else if (m.playing) {
          el.pause(); m.playing = false; if (m.gain) m.gain.gain.value = 0;
        }
      }

      // Composite video tracks bottom→top; all active clips drawn with their
      // transition alpha (overlapping clips on a track = cross-dissolve).
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      for (const track of tracks) {
        if (track.kind !== "video" || track.hidden) continue;
        for (const c of track.clips) {
          if (t < c.start || t >= c.start + clipDur(c)) continue;
          const m = media.find((x) => x.clip.id === c.id);
          if (!m) continue;
          ctx.globalAlpha = clipAlpha(c, t);
          if (m.el instanceof HTMLImageElement) drawClip(ctx, m.el, m.el.naturalWidth, m.el.naturalHeight, c, W, H);
          else { const v = m.el as HTMLVideoElement; drawClip(ctx, v, v.videoWidth, v.videoHeight, c, W, H); }
          ctx.globalAlpha = 1;
        }
      }

      // Caption layers on top (each its own style/position).
      for (const layer of layers) {
        const cue = layer.cues.find((c) => t >= c.start && t <= c.end);
        if (cue) drawCaption(ctx, cue.text, layer.styleId, (t - cue.start) / Math.max(0.1, cue.end - cue.start), W, H,
          cue.anim ? { ...layer.overrides, animation: cue.anim } : layer.overrides, cue.emphasis, layer.bilingual ? cue.translation : undefined, cue.charProgress);
      }

      onProgress(Math.min(0.99, t / total));
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
};
