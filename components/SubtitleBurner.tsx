import React, { useState, useRef, useEffect } from 'react';
import { Film, Lock, Loader2, Download, Upload, Sparkles, AlertCircle, Check } from 'lucide-react';
import Button from './Button';
import { transcriptToSrt } from '../services/srtUtil';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3001';

interface SubtitleBurnerProps {
  transcription: string;
  isPro: boolean;
  onRequestUnlock: () => void;
}

interface Template { id: string; name: string; animated: boolean; }

// Fallback list if the server template endpoint is unreachable.
const FALLBACK_TEMPLATES: Template[] = [
  { id: 'classic', name: '經典白字', animated: false },
  { id: 'news', name: '新聞黃字', animated: false },
  { id: 'tiktok', name: 'TikTok 大字', animated: true },
  { id: 'karaoke', name: 'Karaoke 逐字', animated: true },
];

const SubtitleBurner: React.FC<SubtitleBurnerProps> = ({ transcription, isPro, onRequestUnlock }) => {
  const [video, setVideo] = useState<File | null>(null);
  const [templates, setTemplates] = useState<Template[]>(FALLBACK_TEMPLATES);
  const [tpl, setTpl] = useState('classic');
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);

  const srt = transcriptToSrt(transcription);
  const cueCount = srt ? srt.split('\n\n').filter(Boolean).length : 0;

  useEffect(() => {
    fetch(`${API_BASE}/api/subtitle-templates`)
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => { if (Array.isArray(t) && t.length) setTemplates(t); })
      .catch(() => {});
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const downloadResult = async (jobId: string) => {
    const res = await fetch(`${API_BASE}/api/subtitle-jobs/${jobId}/download`);
    if (!res.ok) throw new Error('下載失敗');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subtitled_${(video?.name || 'video').replace(/\.[^.]+$/, '')}.mp4`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const poll = (jobId: string) => {
    pollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/subtitle-jobs/${jobId}`);
        const j = await res.json();
        if (j.status === 'processing' || j.status === 'queued') {
          setProgress(j.progress || 0);
        } else if (j.status === 'done') {
          clearInterval(pollRef.current!); pollRef.current = null;
          setProgress(100);
          await downloadResult(jobId);
          setPhase('done');
        } else if (j.status === 'error') {
          clearInterval(pollRef.current!); pollRef.current = null;
          setPhase('error'); setError(j.error || '渲染失敗');
        }
      } catch (e: any) {
        clearInterval(pollRef.current!); pollRef.current = null;
        setPhase('error'); setError('無法連接渲染伺服器');
      }
    }, 1500);
  };

  const handleSubmit = async () => {
    if (!isPro) { onRequestUnlock(); return; }
    if (!video) { setError('請先選擇影片檔'); return; }
    if (!srt) { setError('未有可用字幕。請先完成帶時間戳的轉錄。'); return; }

    setPhase('uploading'); setError(''); setProgress(0);
    try {
      const fd = new FormData();
      fd.append('video', video);
      fd.append('srt', srt);
      fd.append('template', tpl);
      const res = await fetch(`${API_BASE}/api/subtitle-jobs`, { method: 'POST', body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `伺服器錯誤 ${res.status}`);
      }
      const { jobId } = await res.json();
      setPhase('processing');
      poll(jobId);
    } catch (e: any) {
      setPhase('error'); setError(e?.message || '提交失敗');
    }
  };

  const busy = phase === 'uploading' || phase === 'processing';

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Film size={16} className="text-teal-500" /> 影片燒錄字幕
          {!isPro && <Lock size={12} className="text-amber-500" />}
        </h3>
        {cueCount > 0 && <span className="text-[11px] text-slate-400">{cueCount} 句就緒</span>}
      </div>

      {/* Video picker */}
      <input ref={fileRef} type="file" accept="video/*" className="sr-only" onChange={(e) => setVideo(e.target.files?.[0] || null)} />
      <button onClick={() => fileRef.current?.click()} disabled={busy}
        className="w-full mb-3 px-3 py-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-xs text-slate-500 dark:text-slate-400 hover:border-teal-400 flex items-center justify-center gap-2 disabled:opacity-50">
        <Upload size={14} /> {video ? video.name : '選擇影片檔 (MP4/MOV)'}
      </button>

      {/* Template gallery */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {templates.map((t) => (
          <button key={t.id} onClick={() => setTpl(t.id)} disabled={busy}
            className={`relative px-3 py-2 rounded-lg border text-xs font-medium text-left transition-colors ${tpl === t.id ? 'border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-teal-300'}`}>
            {tpl === t.id && <Check size={12} className="absolute top-1.5 right-1.5 text-teal-500" />}
            {t.name}
            {t.animated && <span className="block text-[9px] text-teal-400 mt-0.5 flex items-center gap-0.5"><Sparkles size={9} /> 動畫</span>}
          </button>
        ))}
      </div>

      {/* Progress */}
      {busy && (
        <div className="mb-3">
          <div className="flex justify-between text-[11px] text-slate-500 mb-1">
            <span>{phase === 'uploading' ? '上載中...' : '渲染中...'}</span><span>{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div className="h-full bg-teal-500 transition-all" style={{ width: `${phase === 'uploading' ? 5 : progress}%` }} />
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="mb-3 p-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-300 text-[11px] rounded flex items-center gap-1">
          <Check size={12} /> 完成並已下載
        </div>
      )}

      <Button onClick={handleSubmit} disabled={busy} className="w-full h-10 text-sm">
        {busy ? <><Loader2 size={16} className="mr-2 animate-spin" /> {phase === 'uploading' ? '上載中' : `渲染 ${progress}%`}</> : <><Download size={16} className="mr-2" /> 生成字幕影片</>}
      </Button>

      {error && (
        <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 text-[11px] rounded flex items-start gap-1">
          <AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}
    </div>
  );
};

export default SubtitleBurner;
