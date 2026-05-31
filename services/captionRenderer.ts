// Shared caption drawing logic — used by BOTH the live studio preview and the
// local (canvas) MP4/WebM exporter, so "what you see is what you render".

export type CaptionPos = "bottom" | "middle" | "top";
export type CaptionAnim = "none" | "fade" | "pop" | "slide";

export interface CaptionStyle {
  color: string;
  highlight: string;
  strokeColor: string;
  bgColor?: string;        // optional translucent pill behind the text
  fontWeight: number;
  fontFamily: string;      // CSS font stack
  pos: CaptionPos;
  sizeFactor: number;      // font size as a fraction of canvas height
  karaoke?: boolean;
  animation?: CaptionAnim;
}

// Selectable fonts (loaded via index.html web-font links; degrade gracefully).
export const FONT_OPTIONS: { id: string; name: string; stack: string }[] = [
  { id: "sans", name: "黑體", stack: '"Noto Sans HK", system-ui, sans-serif' },
  { id: "serif", name: "宋體", stack: '"Noto Serif HK", "Noto Sans HK", serif' },
  { id: "round", name: "圓體", stack: '"Chiron Hei HK", "PingFang HK", "Noto Sans HK", sans-serif' },
  { id: "hand", name: "手寫", stack: '"LXGW WenKai TC", "Noto Serif HK", cursive' },
];
export const fontStack = (id: string) => FONT_OPTIONS.find((f) => f.id === id)?.stack || FONT_OPTIONS[0].stack;

// Size presets as a fraction of canvas height (user can also fine-tune).
export const SIZE_OPTIONS: { id: string; name: string; factor: number }[] = [
  { id: "s", name: "細", factor: 0.045 },
  { id: "m", name: "中", factor: 0.058 },
  { id: "l", name: "大", factor: 0.072 },
  { id: "xl", name: "特大", factor: 0.09 },
];

const SANS = '"Noto Sans HK", system-ui, sans-serif';
const STROKE = "rgba(0,0,0,0.92)";

export const TEMPLATE_STYLES: Record<string, CaptionStyle> = {
  classic: { color: "#FFFFFF", highlight: "#34C3AC", strokeColor: STROKE, fontWeight: 600, fontFamily: SANS, pos: "bottom", sizeFactor: 0.055, animation: "none" },
  news:    { color: "#FFE000", highlight: "#FFFFFF", strokeColor: STROKE, fontWeight: 800, fontFamily: SANS, pos: "bottom", sizeFactor: 0.06, bgColor: "rgba(0,0,0,0.55)", animation: "none" },
  cinema:  { color: "#F5F5F5", highlight: "#34C3AC", strokeColor: "rgba(0,0,0,0.7)", fontWeight: 600, fontFamily: '"Noto Serif HK", serif', pos: "bottom", sizeFactor: 0.05, animation: "fade" },
  tiktok:  { color: "#FFFFFF", highlight: "#34C3AC", strokeColor: STROKE, fontWeight: 800, fontFamily: SANS, pos: "middle", sizeFactor: 0.075, animation: "pop" },
  karaoke: { color: "#FFFFFF", highlight: "#34C3AC", strokeColor: STROKE, fontWeight: 700, fontFamily: SANS, pos: "bottom", sizeFactor: 0.07, karaoke: true, animation: "none" },
};

// Ensure selected web fonts are ready before rendering frames (avoids fallback
// glyphs being baked into the exported video).
export const loadCaptionFonts = async (): Promise<void> => {
  try {
    const fonts: any = (document as any).fonts;
    if (!fonts?.load) return;
    const families = ['"Noto Sans HK"', '"Noto Serif HK"'];
    await Promise.all(families.map((f) => fonts.load(`700 48px ${f}`).catch(() => {})));
    await fonts.ready;
  } catch { /* fonts are best-effort */ }
};

interface Glyph { ch: string; emph: boolean }

// Mark which character indices fall inside an emphasis word/substring.
const emphasisMask = (text: string, words?: string[]): boolean[] => {
  const mask = new Array(text.length).fill(false);
  if (!words?.length) return mask;
  for (const raw of words) {
    const w = (raw || "").trim();
    if (!w) continue;
    let from = 0;
    while (from <= text.length - w.length) {
      const idx = text.indexOf(w, from);
      if (idx < 0) break;
      for (let i = idx; i < idx + w.length; i++) mask[i] = true;
      from = idx + w.length;
    }
  }
  return mask;
};

// Greedy wrap (CJK per-character + spaced scripts), carrying emphasis flags.
const wrapGlyphLines = (ctx: CanvasRenderingContext2D, text: string, maxW: number, mask: boolean[]): Glyph[][] => {
  const lines: Glyph[][] = [];
  let line: Glyph[] = [];
  let lineStr = "";
  let gi = 0;
  for (const ch of text) {
    const emph = mask[gi] || false;
    gi += ch.length;
    const test = lineStr + ch;
    if (ctx.measureText(test).width > maxW && line.length) {
      lines.push(line);
      line = [{ ch, emph }];
      lineStr = ch;
    } else {
      line.push({ ch, emph });
      lineStr = test;
    }
  }
  if (line.length) lines.push(line);
  return lines.slice(0, 3); // cap at 3 lines
};

/**
 * Draw a caption onto a 2D context sized W×H.
 * @param progress 0..1 position within the current cue (karaoke + animations).
 * @param overrides per-project style tweaks (font/size/colour/position/anim).
 */
export const drawCaption = (
  ctx: CanvasRenderingContext2D,
  text: string,
  styleId: string,
  progress: number,
  W: number,
  H: number,
  overrides?: Partial<CaptionStyle>,
  emphasis?: string[],
  subText?: string,
  charProgress?: number[]   // VAD per-char timing (karaoke); else linear
): void => {
  if (!text) return;
  const base = TEMPLATE_STYLES[styleId] || TEMPLATE_STYLES.classic;
  const s: CaptionStyle = { ...base, ...(overrides || {}) };

  const fontSize = Math.max(14, Math.round(H * s.sizeFactor));
  ctx.font = `${s.fontWeight} ${fontSize}px ${s.fontFamily}`;
  ctx.textBaseline = "middle";

  const mask = emphasisMask(text, emphasis);
  const lines = wrapGlyphLines(ctx, text, W * 0.86, mask);
  const lineStrs = lines.map((ln) => ln.map((g) => g.ch).join(""));
  const lineH = fontSize * 1.28;

  // Optional translated second line (bilingual), drawn smaller below the main.
  const subFontSize = Math.round(fontSize * 0.62);
  const subLineH = subFontSize * 1.25;
  let subLines: string[] = [];
  if (subText) {
    ctx.font = `500 ${subFontSize}px ${s.fontFamily}`;
    subLines = wrapGlyphLines(ctx, subText, W * 0.86, emphasisMask(subText, [])).map((l) => l.map((g) => g.ch).join(""));
    ctx.font = `${s.fontWeight} ${fontSize}px ${s.fontFamily}`;
  }
  const subBlock = subLines.length ? subLines.length * subLineH + fontSize * 0.22 : 0;
  const totalH = lines.length * lineH + subBlock;
  const cx = W / 2;
  let cy: number;
  if (s.pos === "top") cy = H * 0.1 + lineH / 2;
  else if (s.pos === "middle") cy = H * 0.5 - totalH / 2 + lineH / 2;
  else cy = H - H * 0.08 - totalH + lineH / 2;

  // Entrance animation transforms (applied around the caption centre).
  const p = Math.max(0, Math.min(1, progress));
  let alpha = 1, scale = 1, dy = 0;
  const anim = s.animation || "none";
  if (anim === "fade") alpha = Math.min(p / 0.12, (1 - p) / 0.12, 1);
  else if (anim === "pop") scale = 0.85 + 0.15 * Math.min(p / 0.15, 1);
  else if (anim === "slide") dy = (1 - Math.min(p / 0.15, 1)) * H * 0.04;
  alpha = Math.max(0, Math.min(1, alpha));

  ctx.save();
  ctx.globalAlpha = alpha;
  if (scale !== 1 || dy !== 0) {
    const midY = cy + totalH / 2 - lineH / 2;
    ctx.translate(cx, midY + dy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -midY);
  }

  ctx.lineJoin = "round";
  ctx.strokeStyle = s.strokeColor;
  ctx.lineWidth = Math.max(2, fontSize * 0.14);
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = fontSize * 0.18;

  const totalChars = text.replace(/\s/g, "").length;
  // Karaoke highlight count: use VAD per-char timing if available, else linear.
  const hlCount = s.karaoke
    ? (charProgress && charProgress.length ? charProgress.filter((cp) => cp <= p).length : Math.floor(p * totalChars))
    : 0;
  let drawn = 0;

  const hasEmph = mask.some(Boolean);

  lines.forEach((ln, i) => {
    const lnStr = lineStrs[i];
    const y = cy + i * lineH;
    // Optional background pill behind the line.
    if (s.bgColor) {
      const lw = ctx.measureText(lnStr).width;
      const padX = fontSize * 0.4, padY = fontSize * 0.18;
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.fillStyle = s.bgColor;
      const rx = cx - lw / 2 - padX, ry = y - lineH / 2 - padY + lineH * 0.1;
      const rw = lw + padX * 2, rh = lineH + padY;
      const r = Math.min(rh / 2, 14);
      ctx.beginPath();
      ctx.moveTo(rx + r, ry);
      ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, r);
      ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, r);
      ctx.arcTo(rx, ry + rh, rx, ry, r);
      ctx.arcTo(rx, ry, rx + rw, ry, r);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (s.karaoke || hasEmph) {
      // Per-character draw: karaoke fills by progress; emphasis words use the
      // highlight colour. Emphasis takes priority when both apply.
      const lineW = ctx.measureText(lnStr).width;
      let x = cx - lineW / 2;
      ctx.textAlign = "left";
      for (const g of ln) {
        const cw = ctx.measureText(g.ch).width;
        ctx.strokeText(g.ch, x, y);
        const karaHl = s.karaoke && g.ch.trim() !== "" && drawn < hlCount;
        ctx.fillStyle = (g.emph || karaHl) ? s.highlight : s.color;
        ctx.fillText(g.ch, x, y);
        x += cw;
        if (g.ch.trim() !== "") drawn++;
      }
    } else {
      ctx.textAlign = "center";
      ctx.strokeText(lnStr, cx, y);
      ctx.fillStyle = s.color;
      ctx.fillText(lnStr, cx, y);
    }
  });

  // Translated line(s) below the main caption.
  if (subLines.length) {
    ctx.font = `500 ${subFontSize}px ${s.fontFamily}`;
    ctx.textAlign = "center";
    ctx.lineWidth = Math.max(1.5, subFontSize * 0.14);
    const baseY = cy + lines.length * lineH + fontSize * 0.22;
    subLines.forEach((sl, i) => {
      const y = baseY + i * subLineH;
      ctx.strokeText(sl, cx, y);
      ctx.fillStyle = s.color;
      ctx.fillText(sl, cx, y);
    });
  }

  ctx.shadowBlur = 0;
  ctx.restore();
};

// True when the browser can render+encode locally (canvas capture + recorder).
// We exclude native iOS (Capacitor) where we prefer the server path.
export const canRenderLocally = (): boolean => {
  try {
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.() && cap?.getPlatform?.() === "ios") return false;
    const canvas = document.createElement("canvas");
    const hasCapture = typeof (canvas as any).captureStream === "function";
    const hasRecorder = typeof (window as any).MediaRecorder !== "undefined";
    return hasCapture && hasRecorder;
  } catch {
    return false;
  }
};

// Pick the best recorder mime type the browser supports (prefer MP4).
export const pickRecorderMime = (): { mime: string; ext: string } => {
  const MR: any = (window as any).MediaRecorder;
  const candidates = [
    { mime: "video/mp4;codecs=h264,aac", ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
    { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ];
  for (const c of candidates) {
    if (MR?.isTypeSupported?.(c.mime)) return c;
  }
  return { mime: "", ext: "webm" };
};

export interface CaptionStyleOverrides extends Partial<CaptionStyle> {}
