import React, { useState, useRef, useMemo } from 'react';
import { X, Upload, Film, Image as ImageIcon, Loader2, Download, Play, Pause, Trash2, ChevronUp, ChevronDown, Clapperboard } from 'lucide-react';
import Button from './Button';
import { renderTimeline, TimelineClip } from '../services/timelineRender';
import { secondsToBillableMinutes, checkEntitlement } from '../services/billingService';
import { UserProfile } from '../types';

interface MediaStudioProps {
  isPro: boolean;
  profile?: UserProfile | null;
  onConsume?: (minutes: number) => void;
  onRequestUnlock: () => void;
  onClose: () => void;
  tabs?: React.ReactNode;
}

const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

const MediaStudio: React.FC<MediaStudioProps> = ({ isPro, profile, onConsume, onRequestUnlock, onClose, tabs }) => {
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [phase, setPhase] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stopPreviewRef = useRef(false);

  const totalDur = useMemo(() => clips.reduce((a, c) => a + c.duration, 0), [clips]);
  // Output canvas dims: use the first clip's aspect, default 1280×720.
  const dims = useMemo(() => {
    const v = clips.find((c) => c.natW && c.natH);
    if (v?.natW && v?.natH) { const s = 1280 / v.natW; return { W: 1280, H: Math.round(v.natH * s) & ~1 }; }
    return { W: 1280, H: 720 };
  }, [clips]);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: TimelineClip[] = [];
    for (const f of Array.from(files)) {
      const url = URL.createObjectURL(f);
      if (f.type.startsWith('video')) {
        const meta = await new Promise<{ d: number; w: number; h: number }>((res) => {
          const v = document.createElement('video'); v.preload = 'metadata'; v.src = url;
          v.onloadedmetadata = () => res({ d: v.duration || 5, w: v.videoWidth, h: v.videoHeight });
          v.onerror = () => res({ d: 5, w: 1280, h: 720 });
        });
        next.push({ id: uid(), type: 'video', url, name: f.name, inSec: 0, outSec: meta.d, duration: meta.d, natW: meta.w, natH: meta.h });
      } else if (f.type.startsWith('image')) {
        const meta = await new Promise<{ w: number; h: number }>((res) => {
          const img = new Image(); img.src = url; img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => res({ w: 1280, h: 720 });
        });
        next.push({ id: uid(), type: 'image', url, name: f.name, inSec: 0, outSec: 3, duration: 3, natW: meta.w, natH: meta.h });
      }
    }
    setClips((prev) => [...prev, ...next]);
  };

  const move = (i: number, dir: -1 | 1) => setClips((prev) => {
    const j = i + dir; if (j < 0 || j >= prev.length) return prev;
    const n = [...prev]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const remove = (id: string) => setClips((prev) => prev.filter((c) => c.id !== id));
  const setImgDur = (id: string, d: number) => setClips((prev) => prev.map((c) => c.id === id ? { ...c, duration: Math.max(0.5, d), outSec: Math.max(0.5, d) } : c));

  // Lightweight muted preview: play clips in sequence onto the canvas.
  const preview = async () => {
    if (playing) { stopPreviewRef.current = true; setPlaying(false); return; }
    if (!clips.length) return;
    const cv = canvasRef.current; if (!cv) return;
    cv.width = dims.W; cv.height = dims.H;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const fit = (src: CanvasImageSource, sw: number, sh: number) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, dims.W, dims.H);
      if (!sw || !sh) return; const s = Math.min(dims.W / sw, dims.H / sh);
      ctx.drawImage(src, (dims.W - sw * s) / 2, (dims.H - sh * s) / 2, sw * s, sh * s);
    };
    setPlaying(true); stopPreviewRef.current = false;
    for (const c of clips) {
      if (stopPreviewRef.current) break;
      if (c.type === 'video') {
        const v = document.createElement('video'); v.src = c.url; v.muted = true; v.currentTime = c.inSec;
        await new Promise((r) => { v.onseeked = () => r(null); v.onloadeddata = () => r(null); });
        await v.play().catch(() => {});
        await new Promise<void>((done) => {
          const loop = () => {
            if (stopPreviewRef.current || v.ended || v.currentTime >= c.outSec - 0.03) { v.pause(); done(); return; }
            fit(v, v.videoWidth, v.videoHeight); requestAnimationFrame(loop);
          }; requestAnimationFrame(loop);
        });
      } else {
        const img = new Image(); img.src = c.url; await new Promise((r) => { img.onload = () => r(null); });
        const t0 = performance.now();
        await new Promise<void>((done) => {
          const loop = () => {
            if (stopPreviewRef.current || (performance.now() - t0) / 1000 >= c.duration) { done(); return; }
            fit(img, img.naturalWidth, img.naturalHeight); requestAnimationFrame(loop);
          }; requestAnimationFrame(loop);
        });
      }
    }
    setPlaying(false);
  };

  const handleExport = async () => {
    if (!isPro) { onRequestUnlock(); return; }
    if (!clips.length) { setError('請先匯入影片或相片'); return; }
    setError(''); stopPreviewRef.current = true; setPlaying(false);
    const costMin = secondsToBillableMinutes(totalDur);
    if (profile && !profile.isAdmin) {
      const chk = checkEntitlement(profile, costMin);
      if (!chk.allowed) { setError(`匯出需 ${costMin} 分鐘額度。${chk.message || ''}`); onRequestUnlock(); return; }
    }
    setPhase('processing'); setProgress(0);
    try {
      const r = await renderTimeline(clips, dims.W, dims.H, (p) => setProgress(Math.round(p * 100)));
      const url = URL.createObjectURL(r.blob);
      const a = document.createElement('a'); a.href = url; a.download = `timeline_${Date.now()}.${r.ext}`; a.click(); URL.revokeObjectURL(url);
      if (profile && !profile.isAdmin) onConsume?.(costMin);
      setPhase('done');
    } catch (e: any) { setPhase('error'); setError(e?.message || '匯出失敗'); }
  };

  const busy = phase === 'processing';

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0F0D] flex flex-col animate-fade-in text-paper">
      <div className="flex items-center justify-between px-5 h-12 border-b border-white/10 shrink-0">
        {tabs || <h3 className="font-display font-bold text-white flex items-center gap-2 text-sm"><Clapperboard size={16} className="text-teal-400" /> 剪片工作室</h3>}
        <div className="flex items-center gap-2">
          <Button onClick={handleExport} disabled={busy || !clips.length} className="h-8 text-xs px-3">
            {busy ? <><Loader2 size={14} className="mr-1.5 animate-spin" /> {progress}%</> : <><Download size={14} className="mr-1.5" /> 匯出影片</>}
          </Button>
          <button onClick={onClose} className="text-white/50 hover:text-white p-1.5"><X size={18} /></button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {/* Preview */}
        <div className="flex-1 min-h-0 flex items-center justify-center p-6 relative">
          {clips.length ? (
            <canvas ref={canvasRef} className="max-h-full max-w-full rounded-lg shadow-2xl bg-black" />
          ) : (
            <label htmlFor="ms-input" className="flex flex-col items-center gap-3 text-white/40 hover:text-teal-300 cursor-pointer">
              <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-white/15 flex items-center justify-center"><Upload size={28} /></div>
              <span className="text-sm">匯入影片 / 相片開始剪片</span>
            </label>
          )}
          {clips.length > 0 && (
            <button onClick={preview} className="absolute bottom-8 left-1/2 -translate-x-1/2 w-11 h-11 rounded-full bg-teal-500 hover:bg-teal-600 text-white flex items-center justify-center shadow-lg">
              {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
            </button>
          )}
        </div>

        {/* Timeline / clip list */}
        <div className="h-44 shrink-0 border-t border-white/10 bg-[#0E1412] flex flex-col">
          <div className="flex items-center justify-between px-4 h-9 border-b border-white/5">
            <span className="text-[11px] text-white/40 uppercase tracking-wider flex items-center gap-1.5"><Clapperboard size={12} /> 時間線 · {clips.length} 段 · {fmt(totalDur)}</span>
            <input id="ms-input" ref={fileRef} type="file" accept="video/*,image/*" multiple className="sr-only" onChange={(e) => addFiles(e.target.files)} />
            <label htmlFor="ms-input" className="text-[11px] px-2.5 py-1 rounded-md bg-teal-500 hover:bg-teal-600 text-white cursor-pointer flex items-center gap-1"><Upload size={12} /> 匯入</label>
          </div>
          <div className="flex-1 overflow-x-auto flex items-stretch gap-2 p-2 scrollbar-thin">
            {clips.map((c, i) => (
              <div key={c.id} className="shrink-0 w-40 bg-white/5 rounded-lg border border-white/10 p-2 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-[11px] text-white/70">
                  {c.type === 'video' ? <Film size={12} className="text-teal-400 shrink-0" /> : <ImageIcon size={12} className="text-amber-400 shrink-0" />}
                  <span className="truncate flex-1">{c.name}</span>
                </div>
                <div className="text-[10px] text-white/40">{c.type === 'video' ? `${fmt(c.duration)}` : '相片'}</div>
                {c.type === 'image' && (
                  <label className="text-[10px] text-white/50 flex items-center gap-1">秒數
                    <input type="number" min={0.5} step={0.5} value={c.duration} onChange={(e) => setImgDur(c.id, +e.target.value)}
                      className="w-12 bg-black/30 border border-white/10 rounded px-1 py-0.5 text-white text-[10px]" />
                  </label>
                )}
                <div className="flex items-center gap-1 mt-auto">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-white/40 hover:text-white disabled:opacity-20"><ChevronUp size={13} className="rotate-[-90deg]" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === clips.length - 1} className="p-1 text-white/40 hover:text-white disabled:opacity-20"><ChevronDown size={13} className="rotate-[-90deg]" /></button>
                  <button onClick={() => remove(c.id)} className="p-1 text-white/40 hover:text-red-400 ml-auto"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
            {!clips.length && <div className="flex-1 flex items-center justify-center text-[11px] text-white/30">未有片段，按「匯入」加入影片或相片</div>}
          </div>
          {(busy || error || phase === 'done') && (
            <div className="px-4 py-1.5 border-t border-white/5">
              {busy && <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-teal-500 transition-all" style={{ width: `${progress}%` }} /></div>}
              {error && <p className="text-[11px] text-red-300">{error}</p>}
              {phase === 'done' && <p className="text-[11px] text-teal-300">✅ 完成並已下載</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MediaStudio;
