import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { X, Upload, Film, Image as ImageIcon, Music, Loader2, Download, Play, Pause, Square, Trash2, Plus, Lock, Unlock, Eye, EyeOff, Volume2, VolumeX, Scissors, Sparkles } from 'lucide-react';
import Button from './Button';
import { MTTrack, MTClip, clipDur, totalDuration, renderMultiTrack, clipAlpha } from '../services/mtRender';
import { secondsToBillableMinutes, checkEntitlement } from '../services/billingService';
import { transcribeLongMedia } from '../services/transcribeLong';
import { transcriptToCues, splitForSubtitles, cuesToSrt, cuesToVtt, cuesToPlainText, Cue } from '../services/srtUtil';
import { drawCaption, TEMPLATE_NAMES, TEMPLATE_ORDER, FONT_OPTIONS, SIZE_OPTIONS, fontStack, CaptionStyle, CaptionPos, CaptionAnim } from '../services/captionRenderer';
import { designCaptionStyle, designCueAnimations, translateCues, pickMusicForVibe, pickHighlights, aiCorrectCues } from '../services/geminiService';
import { extractForSubtitles } from '../services/extractAudio';
import { alignCuesToOnsets, alignCharsToEnergy } from '../services/vadAlign';
import { UserProfile, TranscriptionSettings } from '../types';
import { API_BASE } from '../services/apiBase';
type Aspect = 'original' | '9_16' | '1_1' | '16_9';

// Minimal SRT parser → cues.
const srtToCues = (text: string): Cue[] => {
  const out: Cue[] = [];
  const toSec = (s: string) => { const m = s.trim().replace(',', '.').split(':').map(Number); return m.length === 3 ? m[0] * 3600 + m[1] * 60 + m[2] : 0; };
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.trim().split('\n');
    const tl = lines.find((l) => l.includes('-->'));
    if (!tl) continue;
    const [a, b] = tl.split('-->');
    const txt = lines.slice(lines.indexOf(tl) + 1).join(' ').trim();
    if (txt) out.push({ start: toSec(a), end: toSec(b), text: txt });
  }
  return out;
};

const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
const TRACK_H = 60;

interface BinItem { id: string; type: 'video' | 'image' | 'audio'; url: string; name: string; dur: number; natW?: number; natH?: number; thumb?: string; }

interface Props {
  isPro: boolean;
  profile?: UserProfile | null;
  onConsume?: (m: number) => void;
  onRequestUnlock: () => void;
  onClose: () => void;
}

const MultiTrackEditor: React.FC<Props> = ({ isPro, profile, onConsume, onRequestUnlock, onClose }) => {
  const [bin, setBin] = useState<BinItem[]>([]);
  const [tracks, setTracks] = useState<MTTrack[]>([
    { id: uid(), kind: 'video', name: '影片 1', clips: [] },
    { id: uid(), kind: 'video', name: '影片 2', clips: [] },
    { id: uid(), kind: 'audio', name: '音訊 1', clips: [] },
  ]);
  const [pxPerSec, setPxPerSec] = useState(40);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  // Subtitles — up to 3 stacked layers, each with its own cues + style + position.
  interface SubLayer { id: string; cues: Cue[]; tpl: string; ov: Partial<CaptionStyle>; bilingual: boolean; }
  const [layers, setLayers] = useState<SubLayer[]>([{ id: uid(), cues: [], tpl: 'classic', ov: {}, bilingual: false }]);
  const [activeLayer, setActiveLayer] = useState(0);
  const al = Math.min(activeLayer, layers.length - 1);
  // The editing UI operates on the active layer (derived getters + setters).
  const cues = layers[al]?.cues ?? [];
  const capTpl = layers[al]?.tpl ?? 'classic';
  const ov = layers[al]?.ov ?? {};
  const bilingual = layers[al]?.bilingual ?? false;
  const patchLayer = (patch: Partial<SubLayer>) => setLayers((prev) => prev.map((l, i) => i === al ? { ...l, ...patch } : l));
  const setCues: React.Dispatch<React.SetStateAction<Cue[]>> = (u) => setLayers((prev) => prev.map((l, i) => i === al ? { ...l, cues: typeof u === 'function' ? (u as (c: Cue[]) => Cue[])(l.cues) : u } : l));
  const setCapTpl = (t: string) => patchLayer({ tpl: t });
  const setOv: React.Dispatch<React.SetStateAction<Partial<CaptionStyle>>> = (u) => setLayers((prev) => prev.map((l, i) => i === al ? { ...l, ov: typeof u === 'function' ? (u as (o: Partial<CaptionStyle>) => Partial<CaptionStyle>)(l.ov) : u } : l));
  const setOvKey = <K extends keyof CaptionStyle>(k: K, v: CaptionStyle[K]) => setOv((p) => ({ ...p, [k]: v }));
  const setBilingual = (b: boolean) => patchLayer({ bilingual: b });
  const addLayer = () => { if (layers.length >= 3) return; const pos = layers.length === 1 ? 'top' : 'middle'; setLayers((prev) => [...prev, { id: uid(), cues: [], tpl: 'classic', ov: { pos: pos as CaptionPos }, bilingual: false }]); setActiveLayer(layers.length); };
  const removeLayer = (i: number) => { if (layers.length <= 1) return; setLayers((prev) => prev.filter((_, idx) => idx !== i)); setActiveLayer(0); };
  const [capBusy, setCapBusy] = useState(false);
  const [capStatus, setCapStatus] = useState('');
  const [transLang, setTransLang] = useState('en');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [glossary, setGlossary] = useState('');
  const [topTab, setTopTab] = useState('媒體');
  const [aspect, setAspect] = useState<Aspect>('original');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elsRef = useRef<Map<string, HTMLVideoElement | HTMLImageElement | HTMLAudioElement>>(new Map());
  const rafRef = useRef(0);
  const playRef = useRef<{ t0: number; base: number } | null>(null);

  const total = useMemo(() => totalDuration(tracks), [tracks]);
  // Output canvas dims: chosen aspect ratio, else the first video clip's aspect.
  const dims = useMemo(() => {
    if (aspect === '9_16') return { W: 1080, H: 1920 };
    if (aspect === '1_1') return { W: 1080, H: 1080 };
    if (aspect === '16_9') return { W: 1920, H: 1080 };
    for (const t of tracks) for (const c of t.clips) if (c.natW && c.natH) { const s = 1280 / c.natW; return { W: 1280, H: Math.round(c.natH * s) & ~1 }; }
    return { W: 1280, H: 720 };
  }, [tracks, aspect]);

  // ---- Media import ----
  const videoThumb = (url: string): Promise<string> => new Promise((res) => {
    const v = document.createElement('video'); v.src = url; v.muted = true; v.preload = 'metadata';
    const grab = () => { try { const w = 96, h = Math.max(40, Math.round(96 * ((v.videoHeight || 9) / (v.videoWidth || 16)))); const c = document.createElement('canvas'); c.width = w; c.height = h; const cx = c.getContext('2d'); if (!cx) return res(''); cx.drawImage(v, 0, 0, w, h); res(c.toDataURL('image/jpeg', 0.6)); } catch { res(''); } };
    v.onloadeddata = () => { try { v.currentTime = Math.min(0.1, (v.duration || 1) / 2); } catch { grab(); } };
    v.onseeked = grab; v.onerror = () => res(''); setTimeout(() => res(''), 4000);
  });

  const importFiles = async (files: FileList | null) => {
    if (!files) return;
    const items: BinItem[] = [];
    for (const f of Array.from(files)) {
      const url = URL.createObjectURL(f);
      if (f.type.startsWith('video')) {
        const meta = await new Promise<{ d: number; w: number; h: number }>((r) => { const v = document.createElement('video'); v.preload = 'metadata'; v.src = url; v.onloadedmetadata = () => r({ d: v.duration || 5, w: v.videoWidth, h: v.videoHeight }); v.onerror = () => r({ d: 5, w: 1280, h: 720 }); });
        items.push({ id: uid(), type: 'video', url, name: f.name, dur: meta.d, natW: meta.w, natH: meta.h, thumb: await videoThumb(url) });
      } else if (f.type.startsWith('image')) {
        const meta = await new Promise<{ w: number; h: number }>((r) => { const i = new Image(); i.src = url; i.onload = () => r({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => r({ w: 1280, h: 720 }); });
        items.push({ id: uid(), type: 'image', url, name: f.name, dur: 3, natW: meta.w, natH: meta.h, thumb: url });
      } else if (f.type.startsWith('audio')) {
        const d = await new Promise<number>((r) => { const a = document.createElement('audio'); a.preload = 'metadata'; a.src = url; a.onloadedmetadata = () => r(a.duration || 10); a.onerror = () => r(10); });
        items.push({ id: uid(), type: 'audio', url, name: f.name, dur: d });
      }
    }
    setBin((p) => [...p, ...items]);
  };

  // ---- Add a bin item to a track at the playhead ----
  const addToTimeline = (b: BinItem) => {
    setTracks((prev) => {
      const want: 'video' | 'audio' = b.type === 'audio' ? 'audio' : 'video';
      let ti = prev.findIndex((t) => t.kind === want);
      const next = prev.map((t) => ({ ...t, clips: [...t.clips] }));
      if (ti < 0) { next.push({ id: uid(), kind: want, name: want === 'audio' ? `音訊 ${next.filter(t => t.kind === 'audio').length + 1}` : `影片 ${next.filter(t => t.kind === 'video').length + 1}`, clips: [] }); ti = next.length - 1; }
      // Auto-connect: append right after the last clip on the track.
      const trackEnd = next[ti].clips.reduce((m, c) => Math.max(m, c.start + clipDur(c)), 0);
      const clip: MTClip = { id: uid(), type: b.type, url: b.url, name: b.name, in: 0, out: b.dur, start: trackEnd, natW: b.natW, natH: b.natH, thumb: b.thumb };
      next[ti].clips.push(clip);
      return next;
    });
  };

  // ---- Subtitles ----
  const firstVideoClip = (): MTClip | undefined => { for (const t of tracks) if (t.kind === 'video') for (const c of t.clips) if (c.type === 'video') return c; return undefined; };
  // Transcribe one clip → cues mapped onto the timeline (relative to clip.start).
  const captionsForClip = async (clip: MTClip): Promise<Cue[]> => {
    const blob = await (await fetch(clip.url)).blob();
    const file = new File([blob], clip.name, { type: blob.type || 'video/mp4' });
    const settings: TranscriptionSettings = { language: ['yue'], enableDiarization: false, speakers: [], enableTimestamps: true, startTime: '00:00', subtitleMode: true, model: 'gemini-pro-latest' };
    // VAD onsets + samples for timing alignment (one extra decode).
    let onsets: number[] = [], samples: Float32Array | null = null, sr = 16000;
    try { const ex = await extractForSubtitles(file, 120); onsets = ex.onsets; samples = ex.samples; sr = ex.sampleRate; } catch {}
    const text = await transcribeLongMedia(file, settings, () => {}, new AbortController().signal, 0, (s) => setCapStatus(s));
    let base = splitForSubtitles(transcriptToCues(text));
    if (onsets.length) base = alignCuesToOnsets(base, onsets);  // VAD line-start align
    if (samples) base = alignCharsToEnergy(samples, sr, base);  // VAD 逐字 timing
    const speed = clip.speed || 1;
    return base
      .filter((c) => c.end > clip.in && c.start < clip.out)
      .map((c) => ({ ...c, start: clip.start + (Math.max(c.start, clip.in) - clip.in) / speed, end: clip.start + (Math.min(c.end, clip.out) - clip.in) / speed }));
  };
  // Merge new cues, replacing any existing cues that overlap [lo,hi].
  const mergeCues = (incoming: Cue[], lo: number, hi: number) =>
    setCues((prev) => [...prev.filter((c) => c.end <= lo + 0.05 || c.start >= hi - 0.05), ...incoming].sort((a, b) => a.start - b.start));

  // Generate from the selected video clip (or the first if none selected).
  const generateCaptions = async () => {
    const clip = (selected && tracks.flatMap((t) => t.clips).find((c) => c.id === selected && c.type === 'video')) || firstVideoClip();
    if (!clip) { setError('時間線未有影片片段'); return; }
    setCapBusy(true); setError(''); setCapStatus('抽取音軌中…');
    try { const mapped = await captionsForClip(clip); mergeCues(mapped, clip.start, clip.start + clipDur(clip)); }
    catch (e: any) { setError(e?.message || '字幕生成失敗'); }
    finally { setCapBusy(false); setCapStatus(''); }
  };
  // Generate from every video clip on the timeline.
  const generateAllCaptions = async () => {
    const vids = tracks.filter((t) => t.kind === 'video').flatMap((t) => t.clips).filter((c) => c.type === 'video').sort((a, b) => a.start - b.start);
    if (!vids.length) { setError('時間線未有影片片段'); return; }
    setCapBusy(true); setError('');
    try {
      let all: Cue[] = [];
      for (let i = 0; i < vids.length; i++) { setCapStatus(`轉錄第 ${i + 1}/${vids.length} 段…`); all = [...all, ...await captionsForClip(vids[i])]; }
      setCues(all.sort((a, b) => a.start - b.start));
    } catch (e: any) { setError(e?.message || '字幕生成失敗'); }
    finally { setCapBusy(false); setCapStatus(''); }
  };
  const importSRT = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    setCues(srtToCues(text));
  };
  const exportSubs = (fmt: 'srt' | 'vtt' | 'txt') => {
    if (!cues.length) return;
    const bi = bilingual && cues.some((c) => c.translation);
    const body = fmt === 'vtt' ? cuesToVtt(cues, bi) : fmt === 'txt' ? cuesToPlainText(cues, bi) : cuesToSrt(cues, false, bi);
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `subtitles.${fmt}`; a.click(); URL.revokeObjectURL(url);
  };

  // ---- Subtitle AI (ported from the studio) ----
  // Each AI styling/text action costs a small flat credit (積分 = 分鐘 unit).
  // Admins are exempt; free-tier users with no balance are gated to unlock.
  const AI_COST = 1;
  // Admins and active monthly subscribers use AI styling free of charge.
  const aiExempt = (): boolean =>
    !!profile && (profile.isAdmin || (profile.plan === 'monthly' && profile.subscriptionStatus === 'active'));
  const ensureAICredit = (): boolean => {
    if (!profile || aiExempt()) return true;
    const chk = checkEntitlement(profile, AI_COST);
    if (!chk.allowed) { setError(`AI 功能需 ${AI_COST} 分鐘額度。${chk.message || ''}`); onRequestUnlock(); return false; }
    return true;
  };
  const chargeAI = () => { if (profile && !aiExempt()) onConsume?.(AI_COST); };
  const aiCostTag = () => (profile && !aiExempt() ? `${aiCostTag()}` : '');

  const aiDesign = async () => {
    if (!cues.length) { setError('未有字幕'); return; }
    if (!ensureAICredit()) return;
    setAiBusy(true); setError(''); setAiNote('');
    try {
      const d = await designCaptionStyle(cues.slice(0, 80).map((c) => c.text).join(' '));
      setCapTpl(d.template);
      setOv({ fontFamily: fontStack(d.fontId), sizeFactor: (SIZE_OPTIONS.find((s) => s.id === d.sizeId) || SIZE_OPTIONS[1]).factor, color: d.color, strokeColor: d.strokeColor, pos: d.pos as CaptionPos, animation: d.animation as CaptionAnim });
      chargeAI();
      setAiNote(`${d.rationale}${aiCostTag()}`);
    } catch (e: any) { setError(e?.message || 'AI 設計失敗'); } finally { setAiBusy(false); }
  };
  const aiCueAnim = async () => {
    if (!cues.length) { setError('未有字幕'); return; }
    if (!ensureAICredit()) return;
    setAiBusy(true); setError('');
    try {
      const arr = await designCueAnimations(cues.map((c) => ({ text: c.text })));
      const byIdx = new Map(arr.map((a) => [a.i, a]));
      const titleCount = arr.filter((a) => a.title).length;
      setCues((prev) => prev.map((c, i) => {
        const m = byIdx.get(i);
        if (!m) return { ...c, anim: undefined, emphasis: undefined };
        // Title/金句 → emphasise the WHOLE line so it pops big (突出標題).
        if (m.title) return { ...c, anim: (m.anim && m.anim !== 'none' ? m.anim : 'zoom'), emphasis: [c.text.trim()] };
        return { ...c, anim: m.anim, emphasis: m.emph };
      }));
      // Make sure emphasis actually enlarges even on a plain template.
      if (titleCount) setOv((p) => (p.emphScale ? p : { ...p, emphScale: 1.5 }));
      chargeAI();
      setAiNote(`已為 ${arr.length} 句加動畫 / 重點字${titleCount ? `，當中 ${titleCount} 句標題放大` : ''}${aiCostTag()}`);
    } catch (e: any) { setError(e?.message || 'AI 動畫失敗'); } finally { setAiBusy(false); }
  };
  // One-click, layer-aware: design the dialogue look, then lift title/金句 cues
  // onto their OWN subtitle layer (big, centred) so they pop without overlapping
  // the running dialogue at the bottom.
  const aiAuto = async () => {
    if (!cues.length) { setError('未有字幕'); return; }
    if (!ensureAICredit()) return;
    setAiBusy(true); setError(''); setAiNote('');
    try {
      const baseCues = cues;
      // 1) Overall dialogue style.
      const d = await designCaptionStyle(baseCues.slice(0, 80).map((c) => c.text).join(' '));
      const baseOv: Partial<CaptionStyle> = {
        fontFamily: fontStack(d.fontId),
        sizeFactor: (SIZE_OPTIONS.find((s) => s.id === d.sizeId) || SIZE_OPTIONS[1]).factor,
        color: d.color, strokeColor: d.strokeColor, pos: 'bottom', animation: d.animation as CaptionAnim,
        emphScale: 1.4,
      };
      // 2) Per-line animation + emphasis + title flags.
      const arr = await designCueAnimations(baseCues.map((c) => ({ text: c.text })));
      const byIdx = new Map(arr.map((a) => [a.i, a]));
      const titleCues: Cue[] = [];
      const dialogCues: Cue[] = [];
      baseCues.forEach((c, i) => {
        const m = byIdx.get(i);
        if (m?.title) {
          titleCues.push({ ...c, anim: (m.anim && m.anim !== 'none' ? m.anim : 'zoom'), emphasis: [c.text.trim()] });
        } else {
          dialogCues.push(m ? { ...c, anim: m.anim, emphasis: m.emph } : { ...c, anim: undefined, emphasis: undefined });
        }
      });

      // Is there a slot for a dedicated title layer? (an empty non-active layer,
      // or room to add one — max 3 layers.)
      const emptyIdx = layers.findIndex((l, i) => i !== al && !l.cues.length);
      const hasRoom = emptyIdx >= 0 || layers.length < 3;
      const useTitleLayer = titleCues.length > 0 && hasRoom;

      setLayers((prev) => {
        // Base/active layer = dialogue. If no room for a title layer, fold titles
        // back into the dialogue inline (still emphasised + enlarged).
        const baseFinal = useTitleLayer
          ? dialogCues
          : [...dialogCues, ...titleCues].sort((a, b) => a.start - b.start);
        let next = prev.map((l, i) => (i === al ? { ...l, cues: baseFinal, tpl: d.template, ov: baseOv } : l));
        if (useTitleLayer) {
          const titleLayer: SubLayer = { id: uid(), cues: titleCues, tpl: 'titleBig', ov: { pos: 'middle' as CaptionPos }, bilingual: false };
          if (emptyIdx >= 0) next = next.map((l, i) => (i === emptyIdx ? { ...titleLayer, id: l.id } : l));
          else next = [...next, titleLayer];
        }
        return next;
      });
      chargeAI();
      setAiNote((useTitleLayer
        ? `已套用風格；${titleCues.length} 句標題已抽去獨立「標題」圖層放大置中`
        : titleCues.length
          ? `已套用風格 + ${titleCues.length} 句標題放大（圖層已滿，留喺同層）`
          : '已套用風格 + 逐句動畫 / 重點字') + `${aiCostTag()}`);
    } catch (e: any) { setError(e?.message || 'AI 一鍵字幕失敗'); } finally { setAiBusy(false); }
  };
  const aiCorrect = async () => {
    if (!cues.length) { setError('未有字幕'); return; }
    if (!ensureAICredit()) return;
    setAiBusy(true); setError('');
    try {
      const arr = await aiCorrectCues(cues.map((c) => ({ text: c.text })), glossary);
      setCues((prev) => prev.map((c, i) => ({ ...c, text: arr[i] || c.text })));
      chargeAI();
      setAiNote(`已 AI 校對修正字幕${aiCostTag()}`);
    } catch (e: any) { setError(e?.message || 'AI 校對失敗'); } finally { setAiBusy(false); }
  };
  const translate = async () => {
    if (!cues.length) { setError('未有字幕'); return; }
    if (!ensureAICredit()) return;
    setAiBusy(true); setError('');
    try {
      const label = ({ en: 'English', 'zh-Hans': '簡體中文', ja: '日本語', ko: '한국어' } as Record<string, string>)[transLang] || transLang;
      const arr = await translateCues(cues.map((c) => ({ text: c.text })), label);
      setCues((prev) => prev.map((c, i) => ({ ...c, translation: arr[i] || c.translation })));
      setBilingual(true);
      chargeAI();
      setAiNote(`已翻譯字幕${aiCostTag()}`);
    } catch (e: any) { setError(e?.message || '翻譯失敗'); } finally { setAiBusy(false); }
  };
  const aiMusic = async () => {
    if (!cues.length) { setError('需要字幕內容判斷氛圍'); return; }
    if (!ensureAICredit()) return;
    setAiBusy(true); setError('');
    try {
      const lib = await (await fetch(`${API_BASE}/api/music`)).json();
      const pick = await pickMusicForVibe(cues.slice(0, 60).map((c) => c.text).join(' '), lib);
      const blob = await (await fetch(`${API_BASE}/api/music/${pick.id}`)).blob();
      const url = URL.createObjectURL(blob);
      const t = lib.find((x: any) => x.id === pick.id);
      const d = await new Promise<number>((r) => { const a = document.createElement('audio'); a.preload = 'metadata'; a.src = url; a.onloadedmetadata = () => r(a.duration || 60); a.onerror = () => r(60); });
      setTracks((prev) => {
        const next = prev.map((tr) => ({ ...tr, clips: [...tr.clips] }));
        let ai = next.findIndex((tr) => tr.kind === 'audio');
        if (ai < 0) { next.push({ id: uid(), kind: 'audio', name: '音訊 1', clips: [] }); ai = next.length - 1; }
        next[ai].clips.push({ id: uid(), type: 'audio', url, name: t?.title || 'BGM', in: 0, out: d, start: 0, volume: 0.25 });
        return next;
      });
      chargeAI();
      setAiNote(`已加背景音樂：${t?.title || ''} — ${pick.reason}${aiCostTag()}`);
    } catch (e: any) { setError(e?.message || 'AI 配樂失敗'); } finally { setAiBusy(false); }
  };

  // Inline cue editing
  const updateCueText = (i: number, text: string) => setCues((prev) => prev.map((c, idx) => idx === i ? { ...c, text } : c));
  const deleteCue = (i: number) => setCues((prev) => prev.filter((_, idx) => idx !== i));
  const splitCue = (i: number) => setCues((prev) => {
    const c = prev[i]; if (!c) return prev;
    const mid = c.start + (c.end - c.start) / 2;
    const half = Math.max(1, Math.round(c.text.length / 2));
    const sp = c.text.lastIndexOf(' ', half); const cut = sp > 0 ? sp : half;
    return [...prev.slice(0, i), { ...c, end: mid, text: c.text.slice(0, cut).trim() }, { ...c, start: mid, text: c.text.slice(cut).trim() }, ...prev.slice(i + 1)];
  });
  const mergeCueDown = (i: number) => setCues((prev) => {
    if (i >= prev.length - 1) return prev;
    const a = prev[i], b = prev[i + 1];
    return [...prev.slice(0, i), { ...a, end: b.end, text: `${a.text} ${b.text}`.replace(/\s+/g, ' ').trim() }, ...prev.slice(i + 2)];
  });
  // Drag a cue on the subtitle track to retime it.
  const startCueDrag = (e: React.MouseEvent, i: number, mode: 'move' | 'l' | 'r') => {
    e.preventDefault(); e.stopPropagation(); setSelected(null);
    const c = cues[i]; const s0 = c.start, e0 = c.end; const startX = e.clientX; let moved = false;
    const move = (ev: MouseEvent) => {
      const dt = (ev.clientX - startX) / pxPerSec;
      if (Math.abs(ev.clientX - startX) > 2) { moved = true; dragRef.current = true; }
      setCues((prev) => prev.map((cc, idx) => {
        if (idx !== i) return cc;
        if (mode === 'move') { const ns = Math.max(0, s0 + dt); return { ...cc, start: ns, end: ns + (e0 - s0) }; }
        if (mode === 'l') return { ...cc, start: Math.max(0, Math.min(e0 - 0.2, s0 + dt)) };
        return { ...cc, end: Math.max(s0 + 0.2, e0 + dt) };
      }));
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); setTimeout(() => { dragRef.current = false; }, 0); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };

  // AI highlights
  const [highlights, setHighlights] = useState<{ start: number; end: number; label: string }[]>([]);
  const aiHighlight = async () => {
    if (!cues.length) { setError('需要字幕內容'); return; }
    if (!ensureAICredit()) return;
    setAiBusy(true); setError('');
    try { const segs = await pickHighlights(cues, 60); if (!segs.length) { setError('AI 揀唔到精華'); } else { chargeAI(); setAiNote(`已揀 ${segs.length} 段精華${aiCostTag()}`); } setHighlights(segs); }
    catch (e: any) { setError(e?.message || 'AI 精華失敗'); } finally { setAiBusy(false); }
  };
  // Ripple-keep only the highlight ranges across all tracks + cues; close gaps.
  const applyHighlights = () => {
    const ranges = [...highlights].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
    if (!ranges.length) return;
    const mapTime = (t: number) => { let acc = 0; for (const r of ranges) { if (t < r.start) return acc; if (t <= r.end) return acc + (t - r.start); acc += r.end - r.start; } return acc; };
    setTracks((prev) => prev.map((tr) => ({
      ...tr,
      clips: tr.clips.flatMap((c) => {
        const dur = clipDur(c), sp = c.speed || 1; const out: MTClip[] = [];
        for (const r of ranges) {
          const a = Math.max(c.start, r.start), b = Math.min(c.start + dur, r.end);
          if (b - a > 0.1) out.push({ ...c, id: uid(), start: mapTime(a), in: c.in + (a - c.start) * sp, out: c.in + (b - c.start) * sp });
        }
        return out;
      }),
    })));
    setCues((prev) => prev.flatMap((c) => {
      for (const r of ranges) { const a = Math.max(c.start, r.start), b = Math.min(c.end, r.end); if (b > a) return [{ ...c, start: mapTime(a), end: mapTime(b) }]; }
      return [];
    }));
    setHighlights([]); setPlayhead(0);
  };

  // Music library
  const [musicLib, setMusicLib] = useState<{ id: string; title: string; moods: string[] }[]>([]);
  const [showMusic, setShowMusic] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewId, setPreviewId] = useState('');
  const loadMusicLib = async () => { if (musicLib.length) return; try { const r = await fetch(`${API_BASE}/api/music`); if (r.ok) setMusicLib(await r.json()); } catch {} };
  const previewTrack = (id: string) => { const a = previewAudioRef.current; if (!a) return; if (previewId === id && !a.paused) { a.pause(); setPreviewId(''); return; } a.src = `${API_BASE}/api/music/${id}`; a.play().catch(() => {}); setPreviewId(id); };
  const addMusicTrack = async (id: string, title: string) => {
    const blob = await (await fetch(`${API_BASE}/api/music/${id}`)).blob();
    const url = URL.createObjectURL(blob);
    const d = await new Promise<number>((r) => { const a = document.createElement('audio'); a.preload = 'metadata'; a.src = url; a.onloadedmetadata = () => r(a.duration || 60); a.onerror = () => r(60); });
    setTracks((prev) => { const next = prev.map((t) => ({ ...t, clips: [...t.clips] })); let ai = next.findIndex((t) => t.kind === 'audio'); if (ai < 0) { next.push({ id: uid(), kind: 'audio', name: '音訊 1', clips: [] }); ai = next.length - 1; } next[ai].clips.push({ id: uid(), type: 'audio', url, name: title, in: 0, out: d, start: 0, volume: 0.25 }); return next; });
  };

  const updateClip = (id: string, patch: Partial<MTClip>) => setTracks((prev) => prev.map((t) => ({ ...t, clips: t.clips.map((c) => c.id === id ? { ...c, ...patch } : c) })));
  const selectedClip = useMemo(() => { for (const t of tracks) for (const c of t.clips) if (c.id === selected) return c; return undefined; }, [tracks, selected]);
  const deleteClip = (id: string) => setTracks((prev) => prev.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== id) })));
  const moveClipToTrack = (id: string, toTrack: number) => setTracks((prev) => {
    let clip: MTClip | undefined;
    const stripped = prev.map((t) => ({ ...t, clips: t.clips.filter((c) => { if (c.id === id) { clip = c; return false; } return true; }) }));
    if (!clip || toTrack < 0 || toTrack >= stripped.length) return prev;
    if (stripped[toTrack].kind !== (clip.type === 'audio' ? 'audio' : 'video')) return prev; // type must match
    stripped[toTrack] = { ...stripped[toTrack], clips: [...stripped[toTrack].clips, clip] };
    return stripped;
  });
  const addTrack = (kind: 'video' | 'audio') => setTracks((prev) => {
    const n = prev.filter((t) => t.kind === kind).length + 1;
    const tr: MTTrack = { id: uid(), kind, name: `${kind === 'video' ? '影片' : '音訊'} ${n}`, clips: [] };
    return kind === 'video' ? [...prev.slice(0, prev.findIndex(t => t.kind === 'audio') < 0 ? prev.length : prev.findIndex(t => t.kind === 'audio')), tr, ...prev.slice(prev.findIndex(t => t.kind === 'audio') < 0 ? prev.length : prev.findIndex(t => t.kind === 'audio'))] : [...prev, tr];
  });
  const setTrackFlag = (id: string, patch: Partial<MTTrack>) => setTracks((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t));

  // ---- Preview compositing ----
  const drawAt = useCallback((t: number) => {
    const cv = canvasRef.current; if (!cv) return;
    cv.width = dims.W; cv.height = dims.H;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, dims.W, dims.H);
    for (const track of tracks) {
      if (track.kind !== 'video' || track.hidden) continue;
      for (const c of track.clips) {
        if (t < c.start || t >= c.start + clipDur(c)) continue;
        const el = elsRef.current.get(c.id); if (!el) continue;
        const sw = el instanceof HTMLImageElement ? el.naturalWidth : (el as HTMLVideoElement).videoWidth;
        const sh = el instanceof HTMLImageElement ? el.naturalHeight : (el as HTMLVideoElement).videoHeight;
        if (!sw || !sh) continue;
        ctx.globalAlpha = clipAlpha(c, t);
        if (!c.scale || c.scale >= 0.999) { const s = Math.max(dims.W / sw, dims.H / sh); ctx.drawImage(el, (dims.W - sw * s) / 2, (dims.H - sh * s) / 2, sw * s, sh * s); }
        else { const w = c.scale * dims.W, h = w * (sh / sw); ctx.drawImage(el, (c.x ?? 0.5) * dims.W - w / 2, (c.y ?? 0.5) * dims.H - h / 2, w, h); }
        ctx.globalAlpha = 1;
      }
    }
    // Caption layers
    for (const layer of layers) {
      const cue = layer.cues.find((c) => t >= c.start && t <= c.end);
      if (cue) drawCaption(ctx, cue.text, layer.tpl, (t - cue.start) / Math.max(0.1, cue.end - cue.start), dims.W, dims.H,
        cue.anim ? { ...layer.ov, animation: cue.anim } : layer.ov, cue.emphasis, layer.bilingual ? cue.translation : undefined, cue.charProgress);
    }
  }, [tracks, dims, layers]);

  // Scrub: seek active video elements then draw.
  useEffect(() => {
    if (playing) return;
    for (const track of tracks) for (const c of track.clips) {
      if (c.type === 'image') continue;
      const el = elsRef.current.get(c.id) as HTMLMediaElement | undefined; if (!el) continue;
      const within = playhead >= c.start && playhead < c.start + clipDur(c);
      if (within) { try { (el as HTMLMediaElement).playbackRate = c.speed || 1; el.currentTime = c.in + (playhead - c.start) * (c.speed || 1); } catch {} }
    }
    const id = requestAnimationFrame(() => drawAt(playhead));
    return () => cancelAnimationFrame(id);
  }, [playhead, playing, drawAt, tracks]);

  // Playback loop (visual + audio via element default output).
  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
      elsRef.current.forEach((el) => { if (!(el instanceof HTMLImageElement)) (el as HTMLMediaElement).pause(); });
      playRef.current = null;
      return;
    }
    if (total <= 0) return;
    setPlaying(true);
    playRef.current = { t0: performance.now(), base: playhead >= total ? 0 : playhead };
    const loop = () => {
      const pr = playRef.current; if (!pr) return;
      const t = pr.base + (performance.now() - pr.t0) / 1000;
      if (t >= total) { setPlayhead(total); setPlaying(false); elsRef.current.forEach((el) => { if (!(el instanceof HTMLImageElement)) (el as HTMLMediaElement).pause(); }); return; }
      for (const track of tracks) for (const c of track.clips) {
        if (c.type === 'image') continue;
        const el = elsRef.current.get(c.id) as HTMLMediaElement | undefined; if (!el) continue;
        const within = t >= c.start && t < c.start + clipDur(c);
        if (within) { if (el.paused) { try { el.playbackRate = c.speed || 1; el.currentTime = c.in + (t - c.start) * (c.speed || 1); } catch {} el.muted = !!track.muted; el.play().catch(() => {}); } }
        else if (!el.paused) el.pause();
      }
      setPlayhead(t); drawAt(t);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  };
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);
  const stop = () => {
    setPlaying(false);
    cancelAnimationFrame(rafRef.current);
    elsRef.current.forEach((el) => { if (!(el instanceof HTMLImageElement)) { const m = el as HTMLMediaElement; m.pause(); try { m.currentTime = 0; } catch {} } });
    playRef.current = null;
    setPlayhead(0);
  };
  // Redraw immediately when the visual output changes (aspect / captions / style).
  useEffect(() => { if (!playing) { const id = requestAnimationFrame(() => drawAt(playhead)); return () => cancelAnimationFrame(id); } }, [dims, drawAt]);

  // ---- Clip drag (move / trim / cross-track) ----
  const dragRef = useRef(false);
  const startClipDrag = (e: React.MouseEvent, clip: MTClip, trackIdx: number, mode: 'move' | 'l' | 'r') => {
    e.preventDefault(); e.stopPropagation(); setSelected(clip.id);
    const startX = e.clientX, startY = e.clientY;
    const s0 = clip.start, in0 = clip.in, out0 = clip.out;
    let moved = false;
    const move = (ev: MouseEvent) => {
      const dt = (ev.clientX - startX) / pxPerSec;
      if (Math.abs(ev.clientX - startX) > 2 || Math.abs(ev.clientY - startY) > 2) { moved = true; dragRef.current = true; }
      if (mode === 'move') {
        let ns = Math.max(0, s0 + dt);
        const dur = out0 - in0;
        // Snap the clip's start or end to nearby edges / playhead / 0 (auto-connect).
        const thresh = 12 / pxPerSec;
        const pts: number[] = [0, playhead];
        tracks.forEach((t) => t.clips.forEach((c) => { if (c.id !== clip.id) pts.push(c.start, c.start + clipDur(c)); }));
        for (const p of pts) {
          if (Math.abs(ns - p) < thresh) { ns = p; break; }
          if (Math.abs((ns + dur) - p) < thresh) { ns = Math.max(0, p - dur); break; }
        }
        const dRow = Math.round((ev.clientY - startY) / TRACK_H);
        updateClip(clip.id, { start: ns });
        if (dRow !== 0) { moveClipToTrack(clip.id, trackIdx + dRow); }
      } else if (mode === 'l') {
        const ni = Math.max(0, Math.min(out0 - 0.3, in0 + dt));
        updateClip(clip.id, { in: ni, start: Math.max(0, s0 + (ni - in0)) });
      } else {
        updateClip(clip.id, { out: Math.max(in0 + 0.3, out0 + dt) });
      }
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); setTimeout(() => { dragRef.current = false; }, 0); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };

  const onRulerClick = (e: React.MouseEvent) => {
    if (dragRef.current) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPlayhead(Math.max(0, (e.clientX - rect.left + (e.currentTarget as HTMLElement).scrollLeft) / pxPerSec));
  };

  const handleExport = async () => {
    if (!isPro) { onRequestUnlock(); return; }
    if (total <= 0) { setError('時間線冇片段'); return; }
    const mins = secondsToBillableMinutes(total);
    if (profile && !profile.isAdmin) { const chk = checkEntitlement(profile, mins); if (!chk.allowed) { setError(`匯出需 ${mins} 分鐘額度。${chk.message || ''}`); onRequestUnlock(); return; } }
    setBusy(true); setError(''); setProgress(0);
    try {
      const r = await renderMultiTrack(tracks, dims.W & ~1, dims.H & ~1, (p) => setProgress(Math.round(p * 100)),
        layers.filter((l) => l.cues.length).map((l) => ({ cues: l.cues, styleId: l.tpl, overrides: l.ov, bilingual: l.bilingual })));
      const url = URL.createObjectURL(r.blob); const a = document.createElement('a'); a.href = url; a.download = `multitrack_${Date.now()}.${r.ext}`; a.click(); URL.revokeObjectURL(url);
      if (profile && !profile.isAdmin) onConsume?.(mins);
    } catch (e: any) { setError(e?.message || '匯出失敗'); }
    finally { setBusy(false); }
  };

  const tlWidth = Math.max(600, (total + 10) * pxPerSec);

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0F0D] flex flex-col text-paper animate-fade-in">
      {/* Hidden media pool for preview */}
      <div className="hidden">
        {tracks.flatMap((t) => t.clips).map((c) => c.type === 'image'
          ? <img key={c.id} src={c.url} ref={(el) => { if (el) elsRef.current.set(c.id, el); }} alt="" />
          : c.type === 'audio'
            ? <audio key={c.id} src={c.url} ref={(el) => { if (el) elsRef.current.set(c.id, el); }} preload="auto" />
            : <video key={c.id} src={c.url} ref={(el) => { if (el) elsRef.current.set(c.id, el); }} muted preload="auto" playsInline />)}
      </div>

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 h-12 border-b border-white/10 shrink-0">
        <h3 className="font-bold text-white flex items-center gap-2 text-sm"><Film size={16} className="text-teal-400" /> 多軌剪輯 <span className="text-[10px] text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded">BETA</span></h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-white/40">{fmt(total)}</span>
          <Button onClick={handleExport} disabled={busy || total <= 0} className="h-8 text-xs px-3">
            {busy ? <><Loader2 size={14} className="mr-1.5 animate-spin" /> {progress}%</> : <><Download size={14} className="mr-1.5" /> 匯出</>}
          </Button>
          <button onClick={onClose} className="text-white/50 hover:text-white p-1.5"><X size={18} /></button>
        </div>
      </div>

      {/* Feature toolbar (guide to where each tool lives) */}
      <div className="h-11 shrink-0 border-b border-white/10 bg-black/20 flex items-center gap-1 px-3 overflow-x-auto">
        {([
          ['媒體', Film, '左邊媒體庫：匯入影片/相片/音訊，撳一下加落軌'],
          ['字幕', Sparkles, '右邊：生成字幕（選中/全部）、AI 校對、逐句編輯、模板'],
          ['效果', Sparkles, '右邊「字幕外觀」：字體/大小/顏色/動畫、AI 設計、逐句動畫'],
          ['音訊', Music, '左邊匯入音訊 / 右邊 AI 配樂 + 音樂庫；時間線音訊軌'],
          ['比例', Square, '右邊「畫面比例」：原片 / 9:16 / 1:1 / 16:9'],
          ['剪輯', Scissors, '下方時間線：拖放、修剪、分割、速度、轉場、PiP'],
        ] as [string, any, string][]).map(([id, Icon, hint]) => (
          <button key={id} onClick={() => setTopTab(id)}
            className={`flex flex-col items-center justify-center gap-0.5 px-3 h-full text-[10px] shrink-0 border-b-2 transition-colors ${topTab === id ? 'border-teal-400 text-teal-300' : 'border-transparent text-white/50 hover:text-white'}`}
            title={hint}>
            <Icon size={15} /> {id}
          </button>
        ))}
        <span className="ml-2 text-[10px] text-white/35 truncate hidden lg:block">
          {({ 媒體: '左邊匯入素材 → 加落軌', 字幕: '右邊生成 / AI 校對 / 編輯字幕', 效果: '右邊調字幕外觀 + AI 動畫', 音訊: 'AI 配樂 / 音樂庫 / 音訊軌', 比例: '右邊揀畫面比例', 剪輯: '下方時間線剪片' } as Record<string, string>)[topTab]}
        </span>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Media bin */}
        <div className="w-56 shrink-0 border-r border-white/10 bg-black/30 flex flex-col">
          <div className="px-3 h-9 flex items-center justify-between border-b border-white/5">
            <span className="text-[11px] text-white/40 uppercase tracking-wider">媒體庫</span>
            <label className="text-[11px] px-2 py-0.5 rounded bg-teal-500/80 hover:bg-teal-500 text-white cursor-pointer flex items-center gap-1"><Upload size={11} /> 匯入
              <input type="file" accept="video/*,image/*,audio/*" multiple className="sr-only" onChange={(e) => { importFiles(e.target.files); e.currentTarget.value = ''; }} />
            </label>
          </div>
          <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2 content-start">
            {bin.length === 0 && <div className="col-span-2 text-[11px] text-white/30 text-center mt-6">匯入影片 / 相片 / 音訊<br />再撳加入軌道</div>}
            {bin.map((b) => (
              <button key={b.id} onClick={() => addToTimeline(b)} title={`加入：${b.name}`}
                className="rounded-lg border border-white/10 bg-white/5 hover:border-teal-400 overflow-hidden text-left">
                <div className="h-14 bg-black/40 bg-cover bg-center flex items-center justify-center" style={b.thumb ? { backgroundImage: `url(${b.thumb})` } : undefined}>
                  {!b.thumb && (b.type === 'audio' ? <Music size={18} className="text-teal-300" /> : <Film size={18} className="text-white/30" />)}
                </div>
                <div className="px-1.5 py-1">
                  <div className="text-[10px] text-white/70 truncate">{b.name}</div>
                  <div className="text-[9px] text-white/35">{b.type === 'image' ? '相片' : fmt(b.dur)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 min-w-0 flex flex-col bg-black/20">
          <div className="flex-1 min-h-0 flex items-center justify-center p-4">
            <canvas ref={canvasRef} className="max-h-full max-w-full rounded-lg shadow-2xl bg-black" />
          </div>
          <div className="shrink-0 h-14 flex items-center justify-center gap-3 border-t border-white/5">
            <button onClick={togglePlay} className="w-10 h-10 rounded-full bg-teal-500 hover:bg-teal-600 text-white flex items-center justify-center shrink-0">{playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}</button>
            <button onClick={stop} title="停止（回到開頭）" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center shrink-0"><Square size={14} fill="currentColor" /></button>
            <span className="font-mono text-xs text-teal-300 tnum">{fmt(playhead)} / {fmt(total)}</span>
            {error && <span className="text-[11px] text-red-300 truncate max-w-[40%]">{error}</span>}
          </div>
        </div>

        {/* Inspector: subtitles + selected clip (PiP / transition) */}
        <div className="w-60 shrink-0 border-l border-white/10 bg-black/30 overflow-y-auto p-3 space-y-4 scrollbar-thin">
          {/* Aspect ratio */}
          <div>
            <div className="text-[11px] text-white/40 uppercase tracking-wider mb-2">畫面比例</div>
            <div className="grid grid-cols-4 gap-1">
              {([['original', '原片'], ['9_16', '9:16'], ['1_1', '1:1'], ['16_9', '16:9']] as [Aspect, string][]).map(([a, l]) => (
                <button key={a} onClick={() => setAspect(a)} className={`py-1.5 rounded border text-[11px] ${aspect === a ? 'border-teal-500 bg-teal-500/15 text-teal-200' : 'border-white/10 text-white/60 hover:border-teal-500/50'}`}>{l}</button>
              ))}
            </div>
          </div>

          {/* Subtitles */}
          <div>
            <div className="text-[11px] text-white/40 uppercase tracking-wider mb-2 flex items-center justify-between">字幕 <span className="text-white/30">{cues.length} 句</span></div>
            {/* Subtitle layer selector (up to 3) */}
            <div className="flex items-center gap-1 mb-2">
              {layers.map((l, i) => (
                <button key={l.id} onClick={() => setActiveLayer(i)}
                  className={`group relative px-2 py-1 rounded text-[11px] flex items-center gap-1 ${i === al ? 'bg-teal-500/30 text-teal-200 ring-1 ring-teal-400/50' : 'bg-white/5 text-white/50 hover:text-white'}`}>
                  圖層{i + 1}{l.cues.length ? <span className="text-[9px] text-white/40">·{l.cues.length}</span> : ''}
                  {layers.length > 1 && <span onClick={(e) => { e.stopPropagation(); removeLayer(i); }} className="text-white/30 hover:text-red-400">×</span>}
                </button>
              ))}
              {layers.length < 3 && <button onClick={addLayer} title="加字幕圖層" className="px-1.5 py-1 rounded bg-white/5 text-white/50 hover:text-teal-300"><Plus size={12} /></button>}
            </div>
            <p className="text-[10px] text-white/30 mb-2">每層可獨立內容/模板/位置（建議設唔同位置：上/中/下）避免重疊。</p>
            <button onClick={generateCaptions} disabled={capBusy}
              className="w-full h-9 rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 hover:opacity-90 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">
              {capBusy ? <><Loader2 size={14} className="animate-spin" /> {capStatus || '生成中…'}</> : (selected && tracks.flatMap((t) => t.clips).some((c) => c.id === selected && c.type === 'video') ? '由選中片段生成字幕' : '由首段影片生成字幕')}
            </button>
            <button onClick={generateAllCaptions} disabled={capBusy}
              className="w-full h-7 mt-1.5 rounded-lg border border-teal-400/40 text-teal-200 text-[11px] hover:bg-teal-500/10 disabled:opacity-50">由全部影片生成（整條時間線）</button>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <label className="text-[11px] px-2 py-1.5 rounded border border-white/15 text-white/60 hover:border-teal-400 hover:text-teal-300 flex items-center justify-center gap-1 cursor-pointer">匯入 SRT
                <input type="file" accept=".srt,text/plain" className="sr-only" onChange={(e) => { importSRT(e.target.files?.[0]); e.currentTarget.value = ''; }} />
              </label>
              {cues.length > 0 && <button onClick={() => setCues([])} className="text-[11px] px-2 py-1.5 rounded border border-white/15 text-white/50 hover:text-red-400">清除</button>}
            </div>

            {cues.length > 0 && (
              <div className="mt-3 space-y-3">
                {/* AI */}
                <div className="space-y-1.5">
                  <button onClick={aiAuto} disabled={aiBusy} className="w-full h-9 rounded-lg bg-gradient-to-r from-amber-400 via-fuchsia-500 to-teal-500 hover:opacity-90 text-white text-[12px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-lg shadow-fuchsia-500/20">{aiBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} AI 一鍵字幕（風格＋突出標題）{profile && !aiExempt() && <span className="text-[10px] font-normal opacity-80">· {AI_COST}分</span>}</button>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button onClick={aiDesign} disabled={aiBusy} className="h-8 rounded-lg bg-white/5 border border-white/10 hover:border-fuchsia-400/50 text-white/70 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-50"><Sparkles size={11} /> 只設計風格</button>
                    <button onClick={aiCueAnim} disabled={aiBusy} className="h-8 rounded-lg bg-white/5 border border-white/10 hover:border-fuchsia-400/50 text-white/70 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-50"><Sparkles size={11} /> 只逐句動畫</button>
                  </div>
                  {/* AI proofread / correction */}
                  <div className="rounded-lg border border-white/10 p-1.5 space-y-1">
                    <input value={glossary} onChange={(e) => setGlossary(e.target.value)} placeholder="正確人名/專名（例：何Sir、陳大文）"
                      className="w-full bg-black/30 border border-white/10 rounded px-1.5 py-1 text-white text-[11px] placeholder:text-white/30" />
                    <button onClick={aiCorrect} disabled={aiBusy} className="w-full h-7 rounded bg-amber-500/80 hover:bg-amber-500 text-white text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-50"><Sparkles size={11} /> AI 一鍵校對修正</button>
                  </div>
                  <div className="flex items-center gap-1">
                    <select value={transLang} onChange={(e) => setTransLang(e.target.value)} className="flex-1 bg-black/30 border border-white/10 rounded px-1.5 py-1 text-white text-[11px]">
                      {[['en', 'English'], ['zh-Hans', '簡體中文'], ['ja', '日本語'], ['ko', '한국어']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <button onClick={translate} disabled={aiBusy} className="px-2 h-7 rounded bg-teal-500/80 hover:bg-teal-500 text-white text-[11px] disabled:opacity-50">翻譯</button>
                  </div>
                  {cues.some((c) => c.translation) && <label className="flex items-center gap-2 text-[11px] text-white/60"><input type="checkbox" checked={bilingual} onChange={(e) => setBilingual(e.target.checked)} className="accent-teal-500" /> 雙語字幕</label>}
                  <button onClick={aiHighlight} disabled={aiBusy} className="w-full h-7 rounded-lg border border-white/15 text-white/70 text-[11px] flex items-center justify-center gap-1 hover:border-teal-400"><Sparkles size={11} /> AI 自動剪重點</button>
                  {highlights.length > 0 && (
                    <div className="rounded-lg bg-teal-500/10 border border-teal-500/30 p-1.5 text-[10px] text-teal-200">
                      AI 揀咗 {highlights.length} 段精華（共 {fmt(highlights.reduce((a, h) => a + (h.end - h.start), 0))}）
                      <div className="flex gap-1 mt-1"><button onClick={applyHighlights} className="flex-1 py-1 rounded bg-teal-500 text-white">只保留精華</button><button onClick={() => setHighlights([])} className="px-2 py-1 rounded bg-white/10">取消</button></div>
                    </div>
                  )}
                  <div className="flex gap-1">
                    <button onClick={aiMusic} disabled={aiBusy} className="flex-1 h-7 rounded-lg border border-white/15 text-white/70 text-[11px] flex items-center justify-center gap-1 hover:border-teal-400"><Music size={11} /> AI 配樂</button>
                    <button onClick={() => { const n = !showMusic; setShowMusic(n); if (n) loadMusicLib(); }} className="flex-1 h-7 rounded-lg border border-white/15 text-white/70 text-[11px] flex items-center justify-center gap-1 hover:border-teal-400">音樂庫</button>
                  </div>
                  {showMusic && (
                    <div className="max-h-36 overflow-y-auto space-y-1">
                      {musicLib.map((t) => (
                        <div key={t.id} className="flex items-center gap-1.5 rounded bg-white/5 p-1">
                          <button onClick={() => previewTrack(t.id)} className="w-5 h-5 rounded-full bg-teal-500/80 text-white flex items-center justify-center">{previewId === t.id ? <Pause size={10} /> : <Play size={10} className="ml-0.5" />}</button>
                          <span className="text-[10px] text-white/70 truncate flex-1">{t.title}</span>
                          <button onClick={() => addMusicTrack(t.id, t.title)} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 hover:bg-teal-500/30">加入</button>
                        </div>
                      ))}
                      <audio ref={previewAudioRef} onEnded={() => setPreviewId('')} className="hidden" />
                    </div>
                  )}
                  {aiNote && <p className="text-[10px] text-teal-300/90 flex items-start gap-1"><Sparkles size={10} className="shrink-0 mt-0.5" /> {aiNote}</p>}
                </div>

                {/* Template */}
                <div>
                  <div className="text-[10px] text-white/45 mb-1">模板 <span className="text-white/25">({TEMPLATE_ORDER.length} 款)</span></div>
                  <div className="grid grid-cols-2 gap-1">
                    {TEMPLATE_ORDER.map((id) => (
                      <button key={id} onClick={() => setCapTpl(id)} className={`px-2 py-1 rounded border text-[11px] text-center truncate ${capTpl === id ? 'border-teal-500 bg-teal-500/15 text-teal-200' : 'border-white/10 text-white/60 hover:border-teal-500/50'}`}>{TEMPLATE_NAMES[id] || id}</button>
                    ))}
                  </div>
                </div>

                {/* Appearance overrides */}
                <div className="space-y-2">
                  <div className="text-[10px] text-white/45 flex items-center justify-between">字幕外觀 {Object.keys(ov).length > 0 && <button onClick={() => setOv({})} className="text-white/40 hover:text-teal-300">重設</button>}</div>
                  <div className="grid grid-cols-2 gap-1">{FONT_OPTIONS.map((f) => <button key={f.id} onClick={() => setOvKey('fontFamily', f.stack)} style={{ fontFamily: f.stack }} className={`px-1 py-1 rounded border text-[11px] ${ov.fontFamily === f.stack ? 'border-teal-500 bg-teal-500/15 text-teal-200' : 'border-white/10 text-white/60'}`}>{f.name}</button>)}</div>
                  <div className="grid grid-cols-4 gap-1">{SIZE_OPTIONS.map((s) => <button key={s.id} onClick={() => setOvKey('sizeFactor', s.factor)} className={`py-1 rounded border text-[11px] ${ov.sizeFactor === s.factor ? 'border-teal-500 bg-teal-500/15 text-teal-200' : 'border-white/10 text-white/60'}`}>{s.name}</button>)}</div>
                  <div className="grid grid-cols-3 gap-1">{([['top', '上'], ['middle', '中'], ['bottom', '下']] as [CaptionPos, string][]).map(([p, l]) => <button key={p} onClick={() => setOvKey('pos', p)} className={`py-1 rounded border text-[11px] ${ov.pos === p ? 'border-teal-500 bg-teal-500/15 text-teal-200' : 'border-white/10 text-white/60'}`}>{l}</button>)}</div>
                  <div className="grid grid-cols-4 gap-1">{([['none', '無'], ['fade', '淡入'], ['pop', '彈出'], ['slide', '上移'], ['zoom', '放大'], ['bounce', '彈跳'], ['drop', '掉落'], ['rise', '升起']] as [CaptionAnim, string][]).map(([a, l]) => <button key={a} onClick={() => setOvKey('animation', a)} className={`py-1 rounded border text-[11px] ${ov.animation === a ? 'border-teal-500 bg-teal-500/15 text-teal-200' : 'border-white/10 text-white/60'}`}>{l}</button>)}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] text-white/45 flex items-center justify-between">文字<input type="color" value={(ov.color as string) || '#FFFFFF'} onChange={(e) => setOvKey('color', e.target.value)} className="w-7 h-6 rounded bg-transparent border border-white/10" /></label>
                    <label className="text-[10px] text-white/45 flex items-center justify-between">描邊<input type="color" value={(ov.strokeColor as string)?.startsWith('#') ? (ov.strokeColor as string) : '#000000'} onChange={(e) => setOvKey('strokeColor', e.target.value)} className="w-7 h-6 rounded bg-transparent border border-white/10" /></label>
                  </div>
                </div>

                {/* Cue list (edit / delete) */}
                <div>
                  <div className="text-[10px] text-white/45 mb-1">逐句編輯</div>
                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                    {cues.map((c, i) => (
                      <div key={i} className="rounded bg-white/5 p-1.5">
                        <div className="flex items-center gap-1 mb-0.5">
                          <button onClick={() => setPlayhead(c.start)} className="font-mono text-[9px] text-teal-300">{fmt(c.start)}</button>
                          <div className="ml-auto flex items-center gap-1">
                            <button onClick={() => splitCue(i)} title="拆成兩句" className="text-white/40 hover:text-teal-300"><Scissors size={10} /></button>
                            <button onClick={() => mergeCueDown(i)} disabled={i >= cues.length - 1} title="同下句合併" className="text-white/40 hover:text-teal-300 disabled:opacity-30"><Plus size={10} /></button>
                            <button onClick={() => deleteCue(i)} className="text-white/40 hover:text-red-400"><Trash2 size={10} /></button>
                          </div>
                        </div>
                        <textarea value={c.text} rows={1} onChange={(e) => updateCueText(i, e.target.value)} className="w-full bg-black/30 rounded px-1.5 py-1 text-[11px] text-white resize-none outline-none focus:ring-1 focus:ring-teal-400/50" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Subtitle file export */}
                <div className="grid grid-cols-3 gap-1.5">
                  {(['srt', 'vtt', 'txt'] as const).map((f) => <button key={f} onClick={() => exportSubs(f)} className="py-1.5 rounded border border-white/10 text-white/60 text-[11px] uppercase hover:border-teal-500/60 hover:text-teal-200">{f}</button>)}
                </div>
              </div>
            )}
          </div>

          {/* Selected clip inspector */}
          {selectedClip ? (
            <div className="pt-3 border-t border-white/10 space-y-3">
              <div className="text-[11px] text-white/40 uppercase tracking-wider truncate">片段：{selectedClip.name}</div>
              {selectedClip.type !== 'audio' && (
                <>
                  <label className="block text-[10px] text-white/45">畫面縮放（畫中畫）{Math.round((selectedClip.scale ?? 1) * 100)}%
                    <input type="range" min={0.2} max={1} step={0.05} value={selectedClip.scale ?? 1} onChange={(e) => updateClip(selectedClip.id, { scale: +e.target.value })} className="w-full accent-teal-500" />
                  </label>
                  {(selectedClip.scale ?? 1) < 0.999 && (
                    <div>
                      <div className="text-[10px] text-white/45 mb-1">位置</div>
                      <div className="grid grid-cols-5 gap-1">
                        {([['↖', 0.18, 0.18], ['↗', 0.82, 0.18], ['◎', 0.5, 0.5], ['↙', 0.18, 0.82], ['↘', 0.82, 0.82]] as [string, number, number][]).map(([l, x, y]) => (
                          <button key={l} onClick={() => updateClip(selectedClip.id, { x, y })} className="py-1 rounded bg-white/5 hover:bg-teal-500/20 text-white/60 text-[12px]">{l}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              {selectedClip.type !== 'image' && (
                <div>
                  <div className="text-[10px] text-white/45 mb-1">速度 {(selectedClip.speed ?? 1).toFixed(2)}×</div>
                  <div className="grid grid-cols-5 gap-1">
                    {[0.5, 1, 1.5, 2, 3].map((s) => (
                      <button key={s} onClick={() => updateClip(selectedClip.id, { speed: s })} className={`py-1 rounded border text-[11px] ${(selectedClip.speed ?? 1) === s ? 'border-teal-500 bg-teal-500/15 text-teal-200' : 'border-white/10 text-white/60'}`}>{s}×</button>
                    ))}
                  </div>
                  <input type="range" min={0.25} max={4} step={0.05} value={selectedClip.speed ?? 1} onChange={(e) => updateClip(selectedClip.id, { speed: +e.target.value })} className="w-full mt-1 accent-teal-500" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] text-white/45">淡入秒
                  <input type="number" min={0} step={0.1} value={selectedClip.transIn ?? 0} onChange={(e) => updateClip(selectedClip.id, { transIn: Math.max(0, +e.target.value) })} className="w-full mt-0.5 bg-black/30 border border-white/10 rounded px-1 py-0.5 text-white text-[11px]" />
                </label>
                <label className="text-[10px] text-white/45">淡出秒
                  <input type="number" min={0} step={0.1} value={selectedClip.transOut ?? 0} onChange={(e) => updateClip(selectedClip.id, { transOut: Math.max(0, +e.target.value) })} className="w-full mt-0.5 bg-black/30 border border-white/10 rounded px-1 py-0.5 text-white text-[11px]" />
                </label>
              </div>
              <label className="block text-[10px] text-white/45">音量 {Math.round((selectedClip.volume ?? 1) * 100)}%
                <input type="range" min={0} max={1} step={0.05} value={selectedClip.volume ?? 1} onChange={(e) => updateClip(selectedClip.id, { volume: +e.target.value })} className="w-full accent-teal-500" />
              </label>
              <button onClick={() => { deleteClip(selectedClip.id); setSelected(null); }} className="text-[11px] text-red-300 hover:text-red-200 flex items-center gap-1"><Trash2 size={12} /> 刪除片段</button>
              <p className="text-[10px] text-white/30">提示：兩段重疊 + 各設淡入/淡出 = 疊化轉場。</p>
            </div>
          ) : (
            <p className="text-[10px] text-white/30 pt-3 border-t border-white/10">撳時間線上嘅片段，可調畫中畫縮放/位置、淡入淡出轉場、音量。</p>
          )}
        </div>
      </div>

      {/* Multi-track timeline */}
      <div className="h-[280px] shrink-0 border-t border-white/10 bg-[#0E1412] flex flex-col">
        {/* toolbar */}
        <div className="h-9 shrink-0 border-b border-white/5 flex items-center gap-2 px-3">
          <span className="text-[11px] text-white/40">時間線</span>
          <div className="ml-auto flex items-center gap-2 text-white/50">
            <button onClick={() => addTrack('video')} className="text-[11px] flex items-center gap-1 hover:text-teal-300"><Plus size={12} /> 影片軌</button>
            <button onClick={() => addTrack('audio')} className="text-[11px] flex items-center gap-1 hover:text-teal-300"><Plus size={12} /> 音訊軌</button>
            <button onClick={() => setPxPerSec((z) => Math.max(8, z - 8))} className="hover:text-white">−</button>
            <input type="range" min={8} max={160} step={4} value={pxPerSec} onChange={(e) => setPxPerSec(+e.target.value)} className="w-20 accent-teal-500" />
            <button onClick={() => setPxPerSec((z) => Math.min(160, z + 8))} className="hover:text-white">+</button>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex">
          {/* track headers */}
          <div className="w-28 shrink-0 border-r border-white/10">
            <div className="h-6 border-b border-white/5" />
            {cues.length > 0 && <div className="border-b border-white/5 px-2 flex items-center gap-1 text-[11px] text-white/70" style={{ height: 26 }}><Sparkles size={11} className="text-teal-400" /> 字幕</div>}
            {tracks.map((t) => (
              <div key={t.id} className="border-b border-white/5 px-2 flex flex-col justify-center gap-1" style={{ height: TRACK_H }}>
                <div className="flex items-center gap-1 text-[11px] text-white/70">
                  {t.kind === 'video' ? <Film size={11} className="text-teal-400" /> : <Music size={11} className="text-purple-400" />}
                  <span className="truncate">{t.name}</span>
                </div>
                <div className="flex items-center gap-1.5 text-white/40">
                  <button onClick={() => setTrackFlag(t.id, { locked: !t.locked })} title="鎖定">{t.locked ? <Lock size={11} className="text-amber-400" /> : <Unlock size={11} />}</button>
                  <button onClick={() => setTrackFlag(t.id, { muted: !t.muted })} title="靜音">{t.muted ? <VolumeX size={11} className="text-red-400" /> : <Volume2 size={11} />}</button>
                  {t.kind === 'video' && <button onClick={() => setTrackFlag(t.id, { hidden: !t.hidden })} title="隱藏">{t.hidden ? <EyeOff size={11} className="text-red-400" /> : <Eye size={11} />}</button>}
                </div>
              </div>
            ))}
          </div>
          {/* tracks + clips (scrollable) */}
          <div className="flex-1 overflow-auto relative">
            <div style={{ width: tlWidth }}>
              {/* ruler */}
              <div className="h-6 relative border-b border-white/5 cursor-text" onClick={onRulerClick}>
                {Array.from({ length: Math.ceil(total + 10) }).filter((_, i) => i % 5 === 0).map((_, i) => (
                  <span key={i} className="absolute top-0.5 text-[9px] text-white/30 font-mono -translate-x-1/2" style={{ left: i * 5 * pxPerSec }}>{fmt(i * 5)}</span>
                ))}
              </div>
              {/* Subtitle track — drag to retime, double-edge to trim */}
              {cues.length > 0 && (
                <div className="relative border-b border-white/5 bg-teal-500/5" style={{ height: 26 }}>
                  {cues.map((c, i) => {
                    const left = c.start * pxPerSec, width = Math.max(6, (c.end - c.start) * pxPerSec);
                    return (
                      <div key={i} onMouseDown={(e) => startCueDrag(e, i, 'move')} title={c.text}
                        className="group absolute top-0.5 bottom-0.5 rounded bg-teal-600/50 ring-1 ring-teal-400/40 overflow-hidden cursor-grab active:cursor-grabbing" style={{ left, width }}>
                        <span className="text-[8px] text-white/90 px-1 truncate leading-none block mt-0.5 pointer-events-none">{c.text}</span>
                        <div onMouseDown={(e) => startCueDrag(e, i, 'l')} className="absolute left-0 inset-y-0 w-1.5 z-10 bg-white/0 group-hover:bg-teal-300 cursor-ew-resize" />
                        <div onMouseDown={(e) => startCueDrag(e, i, 'r')} className="absolute right-0 inset-y-0 w-1.5 z-10 bg-white/0 group-hover:bg-teal-300 cursor-ew-resize" />
                      </div>
                    );
                  })}
                </div>
              )}
              {tracks.map((track, ti) => (
                <div key={track.id} className={`relative border-b border-white/5 ${track.kind === 'audio' ? 'bg-purple-500/5' : 'bg-white/2'}`} style={{ height: TRACK_H }}>
                  {track.clips.map((c) => {
                    const left = c.start * pxPerSec, width = Math.max(8, clipDur(c) * pxPerSec);
                    const sel = selected === c.id;
                    return (
                      <div key={c.id} onMouseDown={(e) => !track.locked && startClipDrag(e, c, ti, 'move')}
                        className={`group absolute top-1 bottom-1 rounded-md overflow-hidden cursor-grab active:cursor-grabbing ${sel ? 'ring-2 ring-teal-300 z-10' : 'ring-1 ring-white/15'} ${track.kind === 'audio' ? 'bg-purple-600/40' : 'bg-teal-600/40'}`}
                        style={{ left, width }} title={c.name}>
                        {c.thumb && track.kind === 'video' && <div className="absolute inset-0 bg-cover bg-center opacity-60" style={{ backgroundImage: `url(${c.thumb})` }} />}
                        <span className="relative text-[9px] text-white/90 px-1 truncate leading-none block mt-0.5">{c.name}</span>
                        <div onMouseDown={(e) => !track.locked && startClipDrag(e, c, ti, 'l')} className="absolute left-0 inset-y-0 w-1.5 z-20 bg-white/0 group-hover:bg-teal-300 cursor-ew-resize" />
                        <div onMouseDown={(e) => !track.locked && startClipDrag(e, c, ti, 'r')} className="absolute right-0 inset-y-0 w-1.5 z-20 bg-white/0 group-hover:bg-teal-300 cursor-ew-resize" />
                        {sel && <button onClick={(e) => { e.stopPropagation(); deleteClip(c.id); }} className="absolute top-0.5 right-1 z-30 text-white/70 hover:text-red-400"><Trash2 size={11} /></button>}
                      </div>
                    );
                  })}
                </div>
              ))}
              {/* playhead */}
              <div className="absolute top-0 bottom-0 w-px bg-red-400 pointer-events-none z-20" style={{ left: playhead * pxPerSec }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiTrackEditor;
