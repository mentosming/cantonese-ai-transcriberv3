import { pickRecorderMime, drawCaption, loadCaptionFonts, CaptionStyle } from "./captionRenderer";
import { Cue } from "./srtUtil";

// Optional subtitle overlay burned over the whole composed sequence.
export interface CaptionOverlay {
  cues: Cue[];
  styleId: string;
  overrides?: Partial<CaptionStyle>;
  bilingual?: boolean;
}

// A single item on the media timeline.
export interface TimelineClip {
  id: string;
  type: "video" | "image";
  url: string;          // object URL
  name: string;
  inSec: number;        // video: trim start (0 for image)
  outSec: number;       // video: trim end
  duration: number;     // effective seconds on the timeline
  natW?: number;
  natH?: number;
  thumb?: string;       // small preview image (data URL)
  srcDur?: number;      // original source duration (for trim bounds)
}

// Fit a source into the canvas. "contain" letterboxes; "cover" fills + crops
// (used to reframe e.g. landscape → vertical for social).
const drawFit = (ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, W: number, H: number, cover = false) => {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (!sw || !sh) return;
  const s = cover ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
  const dw = sw * s, dh = sh * s;
  ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
};

// A picture-in-picture overlay shown on top of the base video for the whole
// duration, positioned by a corner/centre preset and sized as a width fraction.
export interface OverlayLayer {
  type: "video" | "image";
  file: File;
  natW?: number;
  natH?: number;
  pos: "tl" | "tr" | "bl" | "br" | "c";
  size: number;   // width as a fraction of the canvas (0..1)
  start?: number; // seconds on the timeline (default 0)
  end?: number;   // seconds; <=0 or undefined = until the end
}

export const overlayActive = (o: OverlayLayer, t: number): boolean =>
  t >= (o.start || 0) && (!o.end || o.end <= 0 || t <= o.end);

export interface TimelineOpts {
  fit?: "contain" | "cover";
  bgm?: { file: File; volume?: number };
  // Voiceover/narration: becomes the main voice; optionally mute the original.
  voiceover?: { file: File; muteOriginal: boolean };
  // Up to a few PiP overlay layers drawn on top.
  overlays?: OverlayLayer[];
}

// Pixel rect for an overlay on a W×H canvas (matches the CSS preview).
export const overlayRect = (o: OverlayLayer, W: number, H: number) => {
  const w = Math.max(1, o.size * W);
  const aspect = o.natW && o.natH ? o.natH / o.natW : 9 / 16;
  const h = w * aspect;
  const mx = 0.03 * W, my = 0.03 * H;
  let x: number, y: number;
  if (o.pos === "tl") { x = mx; y = my; }
  else if (o.pos === "tr") { x = W - mx - w; y = my; }
  else if (o.pos === "bl") { x = mx; y = H - my - h; }
  else if (o.pos === "br") { x = W - mx - w; y = H - my - h; }
  else { x = (W - w) / 2; y = (H - h) / 2; }
  return { x, y, w, h };
};

// Draw a source cover-cropped into a destination rect (clipped).
const drawCover = (ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) => {
  if (!sw || !sh) return;
  const s = Math.max(dw / sw, dh / sh);
  const rw = sw * s, rh = sh * s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();
  ctx.drawImage(src, dx + (dw - rw) / 2, dy + (dh - rh) / 2, rw, rh);
  ctx.restore();
};

/**
 * Render a sequence of video/image clips into one recorded file. Plays each
 * clip in order onto a canvas; video audio is routed through a WebAudio graph
 * into a single recorded audio track. Real-time. Local, no server.
 */
export const renderTimeline = async (
  clips: TimelineClip[],
  W: number,
  H: number,
  onProgress: (p: number) => void,
  captions?: CaptionOverlay,
  opts?: TimelineOpts
): Promise<{ blob: Blob; ext: string }> => {
  if (!clips.length) throw new Error("時間線冇片段");

  if (captions?.cues.length) await loadCaptionFonts();
  const cover = opts?.fit === "cover";

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");

  // Draw the active caption (if any) for a given global timeline position.
  const drawSub = (gt: number) => {
    if (!captions?.cues.length) return;
    const cue = captions.cues.find((c) => gt >= c.start && gt <= c.end);
    if (!cue) return;
    const prog = (gt - cue.start) / Math.max(0.1, cue.end - cue.start);
    drawCaption(ctx, cue.text, captions.styleId, prog, W, H, cue.anim ? { ...captions.overrides, animation: cue.anim } : captions.overrides, cue.emphasis, captions.bilingual ? cue.translation : undefined);
  };

  const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
  const actx = new AC();
  await actx.resume?.();
  const dest = actx.createMediaStreamDestination();

  // Preload media elements.
  const loaded = await Promise.all(
    clips.map(
      (c) =>
        new Promise<{ c: TimelineClip; v?: HTMLVideoElement; img?: HTMLImageElement }>((res) => {
          if (c.type === "video") {
            const v = document.createElement("video");
            v.src = c.url; v.muted = false; v.playsInline = true;
            v.onloadedmetadata = () => res({ c, v });
            v.onerror = () => res({ c });
          } else {
            const img = new Image();
            img.src = c.url;
            img.onload = () => res({ c, img });
            img.onerror = () => res({ c });
          }
        })
    )
  );

  // Route each video's audio into the destination — through a gain node so a
  // voiceover can mute the original ("replace" mode).
  const origGain = actx.createGain();
  origGain.gain.value = opts?.voiceover?.muteOriginal ? 0 : 1;
  origGain.connect(dest);
  for (const e of loaded) {
    if (e.v) {
      try { actx.createMediaElementSource(e.v).connect(origGain); } catch { /* already connected */ }
    }
  }

  // Voiceover/narration: full volume, plays once from the start.
  let voiceEl: HTMLAudioElement | undefined;
  if (opts?.voiceover) {
    voiceEl = document.createElement("audio");
    voiceEl.src = URL.createObjectURL(opts.voiceover.file);
    try { actx.createMediaElementSource(voiceEl).connect(dest); } catch { /* ignore */ }
  }

  // Preload overlay layers (PiP). Overlay video is muted + looped.
  const overlayEls = await Promise.all(
    (opts?.overlays || []).map((o) =>
      new Promise<{ o: OverlayLayer; v?: HTMLVideoElement; img?: HTMLImageElement }>((res) => {
        const url = URL.createObjectURL(o.file);
        if (o.type === "video") {
          const v = document.createElement("video");
          v.src = url; v.muted = true; v.loop = true; v.playsInline = true;
          v.onloadeddata = () => res({ o, v });
          v.onerror = () => res({ o });
        } else {
          const img = new Image();
          img.src = url;
          img.onload = () => res({ o, img });
          img.onerror = () => res({ o });
        }
      })
    )
  );
  const drawOverlays = (gt: number) => {
    for (const e of overlayEls) {
      if (!overlayActive(e.o, gt)) continue;
      const src = e.v || e.img;
      if (!src) continue;
      const sw = e.v ? e.v.videoWidth : e.img?.naturalWidth || 0;
      const sh = e.v ? e.v.videoHeight : e.img?.naturalHeight || 0;
      const r = overlayRect(e.o, W, H);
      drawCover(ctx, src, sw, sh, r.x, r.y, r.w, r.h);
    }
  };

  // Background music: loop under the clip audio at a (lower) fixed volume so the
  // voice stays clear. Mixed into the same destination track.
  let bgmEl: HTMLAudioElement | undefined;
  if (opts?.bgm) {
    bgmEl = document.createElement("audio");
    bgmEl.src = URL.createObjectURL(opts.bgm.file);
    bgmEl.loop = true;
    try {
      const g = actx.createGain();
      g.gain.value = Math.max(0, Math.min(1, opts.bgm.volume ?? 0.25));
      actx.createMediaElementSource(bgmEl).connect(g);
      g.connect(dest);
    } catch { /* ignore */ }
  }

  const cstream = (canvas as any).captureStream(30) as MediaStream;
  const tracks = [...cstream.getVideoTracks(), ...dest.stream.getAudioTracks()];
  const { mime, ext } = pickRecorderMime();
  const rec = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  const totalDur = clips.reduce((a, c) => a + c.duration, 0);

  return new Promise<{ blob: Blob; ext: string }>((resolve, reject) => {
    rec.onstop = () => { try { bgmEl?.pause(); voiceEl?.pause(); overlayEls.forEach((e) => e.v?.pause()); } catch {} actx.close?.(); onProgress(1); resolve({ blob: new Blob(chunks, { type: mime || "video/webm" }), ext }); };
    rec.onerror = () => reject(new Error("錄製失敗"));

    (async () => {
      try {
        rec.start(100);
        bgmEl?.play().catch(() => {});
        voiceEl?.play().catch(() => {});
        overlayEls.forEach((e) => e.v?.play().catch(() => {}));
        let elapsed = 0;
        for (const e of loaded) {
          const c = e.c;
          if (e.v) {
            const v = e.v;
            v.currentTime = c.inSec || 0;
            await new Promise((r) => { v.onseeked = () => r(null); setTimeout(r, 400); });
            await v.play().catch(() => {});
            await new Promise<void>((done) => {
              const loop = () => {
                const t = v.currentTime;
                if (v.ended || t >= (c.outSec || v.duration) - 0.03) { v.pause(); done(); return; }
                const local = t - (c.inSec || 0);
                drawFit(ctx, v, v.videoWidth, v.videoHeight, W, H, cover);
                drawOverlays(elapsed + local);
                drawSub(elapsed + local);
                onProgress(Math.min(0.99, (elapsed + local) / totalDur));
                requestAnimationFrame(loop);
              };
              requestAnimationFrame(loop);
            });
          } else if (e.img) {
            const img = e.img;
            const startT = performance.now();
            await new Promise<void>((done) => {
              const loop = () => {
                const dt = (performance.now() - startT) / 1000;
                if (dt >= c.duration) { done(); return; }
                drawFit(ctx, img, img.naturalWidth, img.naturalHeight, W, H, cover);
                drawOverlays(elapsed + dt);
                drawSub(elapsed + dt);
                onProgress(Math.min(0.99, (elapsed + dt) / totalDur));
                requestAnimationFrame(loop);
              };
              requestAnimationFrame(loop);
            });
          }
          elapsed += c.duration;
        }
        rec.stop();
      } catch (err) {
        try { rec.stop(); } catch {}
        reject(err);
      }
    })();
  });
};
