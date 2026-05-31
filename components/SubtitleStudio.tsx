import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { X, Upload, Film, Loader2, Download, Sparkles, Check, AlertCircle, Play, Pause, Type, SkipBack, SkipForward, Scissors, Combine, Trash2, Image as ImageIcon, ChevronUp, ChevronDown, Palette, Lock, Music, Mic, Minus, Plus, MousePointer2, SeparatorVertical } from 'lucide-react';
import Button from './Button';
import { transcriptToCues, cuesToSrt, cuesToVtt, cuesToPlainText, cuesToTranscript, splitForSubtitles, Cue } from '../services/srtUtil';
import { drawCaption, canRenderLocally, FONT_OPTIONS, SIZE_OPTIONS, fontStack, CaptionStyle, CaptionPos, CaptionAnim } from '../services/captionRenderer';
import { renderLocally, renderLocallyMp4, renderHighlights, canUseWebCodecs, Segment } from '../services/localRender';
import { renderTimeline, TimelineClip, OverlayLayer } from '../services/timelineRender';
import { pickHighlights, transcribeMedia, designCaptionStyle, designCueAnimations, translateCues, pickMusicForVibe } from '../services/geminiService';
import { extractForSubtitles } from '../services/extractAudio';
import { alignCuesToOnsets } from '../services/vadAlign';
import { checkEntitlement, secondsToBillableMinutes } from '../services/billingService';
import { logUsage } from '../services/adminService';
import { DEFAULT_MODEL, MODELS, LANGUAGES } from '../constants';
import { UserProfile } from '../types';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3001';

interface SubtitleStudioProps {
  transcription: string;
  isPro: boolean;
  profile?: UserProfile | null;
  onConsume?: (minutes: number) => void;
  onRequestUnlock: () => void;
  onClose: () => void;
  tabs?: React.ReactNode; // shared 字幕/剪片 switcher injected by the parent suite
}

interface Template { id: string; name: string; animated: boolean; }
interface Thumb { t: number; url: string; }

const FALLBACK_TEMPLATES: Template[] = [
  { id: 'classic', name: '經典白字', animated: false },
  { id: 'news', name: '新聞黃字', animated: false },
  { id: 'cinema', name: '電影置中', animated: false },
  { id: 'tiktok', name: 'TikTok 大字', animated: true },
  { id: 'karaoke', name: 'Karaoke 逐字', animated: true },
];

const tc = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), f = Math.floor((s % 1) * 30);
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
};

const SubtitleStudio: React.FC<SubtitleStudioProps> = ({ transcription, isPro, profile, onConsume, onRequestUnlock, onClose, tabs }) => {
  const [video, setVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [templates, setTemplates] = useState<Template[]>(FALLBACK_TEMPLATES);
  const [tpl, setTpl] = useState('classic');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [thumbBusy, setThumbBusy] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [highlights, setHighlights] = useState<Segment[]>([]);
  const [hlLoading, setHlLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const thumbVideoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const consumeRef = useRef(0);

  const local = useMemo(() => canRenderLocally(), []);
  const webcodecs = useMemo(() => canUseWebCodecs(), []);
  const [renderMode, setRenderMode] = useState<'local' | 'server'>(local ? 'local' : 'server');

  // Subtitle source: starts from the main transcript, but can be (re)generated
  // from the loaded video right here in the studio.
  const [studioTranscript, setStudioTranscript] = useState(transcription);
  useEffect(() => { if (transcription) setStudioTranscript(transcription); }, [transcription]);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeStatus, setTranscribeStatus] = useState('');
  // Default subtitle generation to the high-accuracy engine (better timestamps).
  const [studioModel, setStudioModel] = useState((MODELS.find((m) => /pro/.test(m.id))?.id) || DEFAULT_MODEL);
  const [studioLang, setStudioLang] = useState('yue');
  // Split long speaker turns into short one-line subtitle cues.
  const baseCues = useMemo(() => splitForSubtitles(transcriptToCues(studioTranscript)), [studioTranscript]);
  const [cues, setCues] = useState<Cue[]>(baseCues);
  useEffect(() => { setCues(baseCues); }, [baseCues]);
  const srt = useMemo(() => cuesToSrt(cues), [cues]);

  // Caption style overrides (font / size / colour / stroke / position / anim),
  // layered on top of the chosen template. Applied to BOTH preview and export.
  const [ov, setOv] = useState<Partial<CaptionStyle>>({});
  const setOvKey = <K extends keyof CaptionStyle>(k: K, v: CaptionStyle[K]) => setOv((p) => ({ ...p, [k]: v }));

  // Extra clips/photos appended after the main video on the timeline.
  const [extraClips, setExtraClips] = useState<TimelineClip[]>([]);
  const clipInputRef = useRef<HTMLInputElement>(null);
  // Output aspect ratio (social reframe) + background music.
  const [aspect, setAspect] = useState<'original' | '9_16' | '1_1' | '16_9'>('original');
  const [bgm, setBgm] = useState<File | null>(null);
  const [bgmVolume, setBgmVolume] = useState(0.25);
  // Voiceover/narration: imported audio that becomes the main voice + subtitle source.
  const [voiceover, setVoiceover] = useState<File | null>(null);
  const [muteOriginal, setMuteOriginal] = useState(true);
  // Overlay (picture-in-picture) layers, max 2 on top of the base video.
  type StudioOverlay = OverlayLayer & { id: string; url: string };
  const [overlays, setOverlays] = useState<StudioOverlay[]>([]);
  // Resizable timeline panel height (px) + horizontal zoom (1 = fit width).
  const [timelineHeight, setTimelineHeight] = useState(132);
  const [zoom, setZoom] = useState(1);
  // Main video as kept segments [{in,out}] (enables razor split + delete-middle).
  const [segments, setSegments] = useState<{ in: number; out: number }[]>([]);
  const [selectedSeg, setSelectedSeg] = useState<number | null>(null);
  const [tool, setTool] = useState<'select' | 'razor'>('select');
  const [topTab, setTopTab] = useState('媒體');
  const mainStripRef = useRef<HTMLDivElement>(null);
  // Initialise / reset segments to the full clip when a video loads.
  useEffect(() => {
    if (duration > 0 && segments.length === 0) setSegments([{ in: 0, out: duration }]);
  }, [duration]);
  const isTrimmed = segments.length > 1 || (segments[0] && (segments[0].in > 0.05 || segments[0].out < duration - 0.05));
  const [voiceUrl, setVoiceUrl] = useState('');
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!voiceover) { setVoiceUrl(''); return; }
    const u = URL.createObjectURL(voiceover); setVoiceUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [voiceover]);
  // Royalty-free music library (server-proxied) + AI vibe pick.
  type Track = { id: string; title: string; moods: string[] };
  const [musicLib, setMusicLib] = useState<Track[]>([]);
  const [showMusic, setShowMusic] = useState(false);
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicNote, setMusicNote] = useState('');
  const [previewId, setPreviewId] = useState('');
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  // Bilingual display toggle (shows translation as a 2nd line in preview/export).
  const [bilingual, setBilingual] = useState(false);
  const [transLang, setTransLang] = useState('en');
  const [translating, setTranslating] = useState(false);

  const end = duration || (cues.length ? cues[cues.length - 1].end + 2 : 0);

  // Output canvas dimensions for the chosen aspect ratio (social reframe).
  const outputDims = (): { W: number; H: number } => {
    const vw = videoRef.current?.videoWidth || 1280;
    const vh = videoRef.current?.videoHeight || 720;
    if (aspect === '9_16') return { W: 1080, H: 1920 };
    if (aspect === '1_1') return { W: 1080, H: 1080 };
    if (aspect === '16_9') return { W: 1920, H: 1080 };
    return { W: vw, H: vh };
  };
  const aspectCss = aspect === '9_16' ? '9 / 16' : aspect === '1_1' ? '1 / 1' : aspect === '16_9' ? '16 / 9' : undefined;
  const activeIdx = cues.findIndex((c) => currentTime >= c.start && currentTime <= c.end);
  const activeCue = activeIdx >= 0 ? cues[activeIdx] : undefined;

  useEffect(() => {
    fetch(`${API_BASE}/api/subtitle-templates`).then((r) => (r.ok ? r.json() : null))
      .then((t) => { if (Array.isArray(t) && t.length) setTemplates(t); }).catch(() => {});
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Generate filmstrip thumbnails from a hidden video element by seeking.
  const buildThumbs = useCallback(async () => {
    const v = thumbVideoRef.current;
    if (!v || !v.duration || !isFinite(v.duration)) return;
    setThumbBusy(true); setThumbs([]);
    const dur = v.duration;
    const count = Math.min(30, Math.max(10, Math.round(dur / 4)));
    const tw = 100, th = Math.max(40, Math.round(100 * (v.videoHeight || 9) / (v.videoWidth || 16)));
    const canvas = document.createElement('canvas'); canvas.width = tw; canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setThumbBusy(false); return; }
    const out: Thumb[] = [];
    for (let i = 0; i < count; i++) {
      const t = ((i + 0.5) / count) * dur;
      await new Promise<void>((res) => {
        const h = () => { v.removeEventListener('seeked', h); res(); };
        v.addEventListener('seeked', h); v.currentTime = t;
      });
      try { ctx.drawImage(v, 0, 0, tw, th); out.push({ t, url: canvas.toDataURL('image/jpeg', 0.5) }); } catch {}
      setThumbs([...out]);
    }
    setThumbBusy(false);
  }, []);

  // Live preview: continuously draw the active caption (with karaoke highlight)
  // onto an overlay canvas sized to the displayed video — same drawCaption used
  // by the local exporter, so preview == output.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const v = videoRef.current, c = previewCanvasRef.current;
      if (v && c) {
        const w = v.clientWidth, h = v.clientHeight;
        if (w && h) {
          if (c.width !== w) c.width = w;
          if (c.height !== h) c.height = h;
          const ctx = c.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, w, h);
            const t = v.currentTime;
            const cue = cues.find((cc) => t >= cc.start && t <= cc.end);
            if (cue) drawCaption(ctx, cue.text, tpl, (t - cue.start) / Math.max(0.1, cue.end - cue.start), w, h, cue.anim ? { ...ov, animation: cue.anim } : ov, cue.emphasis, bilingual ? cue.translation : undefined);
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [cues, tpl, ov, bilingual]);

  const pickVideo = (f: File | null) => {
    if (!f) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(f);
    setVideo(f); setVideoUrl(url); setThumbs([]); setPhase('idle'); setError(''); setCurrentTime(0);
    setSegments([]); setSelectedSeg(null);
  };

  // One button, multi-select: first file = main video, the rest = appended clips.
  const pickVideos = (files: FileList | null) => {
    if (!files || !files.length) return;
    const arr = Array.from(files);
    pickVideo(arr[0]);
    if (arr.length > 1) {
      const dt = new DataTransfer();
      arr.slice(1).forEach((f) => dt.items.add(f));
      addClips(dt.files);
    }
  };

  const seekTo = useCallback((t: number) => {
    const clamped = Math.max(0, Math.min(end || t, t));
    if (videoRef.current) { videoRef.current.currentTime = clamped; setCurrentTime(clamped); }
    if (voiceAudioRef.current) voiceAudioRef.current.currentTime = clamped;
  }, [end]);

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    const a = voiceAudioRef.current;
    if (v.paused) {
      v.play(); setPlaying(true);
      if (a && voiceover) { a.currentTime = v.currentTime; a.play().catch(() => {}); }
    } else {
      v.pause(); setPlaying(false); a?.pause();
    }
  };
  const stepCue = (dir: 1 | -1) => {
    if (!cues.length) return;
    if (dir === 1) { const n = cues.find((c) => c.start > currentTime + 0.05); if (n) seekTo(n.start + 0.01); }
    else { const prev = [...cues].reverse().find((c) => c.start < currentTime - 0.05); if (prev) seekTo(prev.start + 0.01); }
  };

  // ---- Render job ----
  const downloadResult = async (jobId: string) => {
    const res = await fetch(`${API_BASE}/api/subtitle-jobs/${jobId}/download`);
    if (!res.ok) throw new Error('下載失敗');
    const blob = await res.blob(); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `subtitled_${(video?.name || 'video').replace(/\.[^.]+$/, '')}.mp4`; a.click(); URL.revokeObjectURL(url);
  };
  const poll = (jobId: string) => {
    pollRef.current = window.setInterval(async () => {
      try {
        const j = await (await fetch(`${API_BASE}/api/subtitle-jobs/${jobId}`)).json();
        if (j.status === 'processing' || j.status === 'queued') setProgress(j.progress || 0);
        else if (j.status === 'done') { clearInterval(pollRef.current!); pollRef.current = null; setProgress(100); await downloadResult(jobId); onConsume?.(consumeRef.current); setPhase('done'); }
        else if (j.status === 'error') { clearInterval(pollRef.current!); pollRef.current = null; setPhase('error'); setError(j.error || '渲染失敗'); }
      } catch { clearInterval(pollRef.current!); pollRef.current = null; setPhase('error'); setError('無法連接渲染伺服器'); }
    }, 1500);
  };
  // --- Generate subtitles by transcribing the loaded video here in the studio ---
  const handleTranscribeVideo = async () => {
    if (!isPro) { onRequestUnlock(); return; }
    if (!video) { setError('請先選擇影片檔'); return; }
    setError('');
    const mins = secondsToBillableMinutes(duration || 0);
    if (profile && !profile.isAdmin) {
      const chk = checkEntitlement(profile, mins);
      if (!chk.allowed) { setError(`生成字幕需 ${mins} 分鐘額度。${chk.message || ''}`); onRequestUnlock(); return; }
    }
    setTranscribing(true);
    try {
      // Extract the audio and split it into ~2-min chunks. Long single requests
      // make Google reset the connection ("fetch failed"); short chunks each
      // return quickly and reliably. We offset each chunk's timestamps back
      // onto the original timeline and merge the results live.
      setTranscribeStatus(voiceover ? '處理旁白音軌中…' : '抽取音軌中…');
      let chunks: { file: File; startSec: number }[];
      let onsets: number[] = [];
      try {
        // If a voiceover is imported, subtitles come from the voiceover, not
        // the video's own audio.
        const ex = await extractForSubtitles(voiceover || video, 120);
        chunks = ex.chunks;
        onsets = ex.onsets;
      } catch {
        chunks = [{ file: voiceover || video, startSec: 0 }];
      }
      const ctrl = new AbortController();
      const allCues: Cue[] = [];
      let produced = false;
      for (let ci = 0; ci < chunks.length; ci++) {
        const { file, startSec } = chunks[ci];
        setTranscribeStatus(chunks.length > 1 ? `AI 轉錄中… (${ci + 1}/${chunks.length})` : 'AI 轉錄中…');
        let chunkText = '';
        const offset = (c: Cue): Cue => ({ ...c, start: c.start + startSec, end: c.end + startSec });
        await transcribeMedia(
          file,
          { language: [studioLang], enableDiarization: false, enableTimestamps: true, subtitleMode: true, speakers: [], startTime: '00:00', model: studioModel },
          (textChunk) => {
            chunkText += textChunk;
            const live = transcriptToCues(chunkText).map(offset);
            setStudioTranscript(cuesToTranscript([...allCues, ...live]));
          },
          ctrl.signal
        );
        const cues = transcriptToCues(chunkText).map(offset);
        allCues.push(...cues);
        if (cues.length) produced = true;
        setStudioTranscript(cuesToTranscript(allCues));
      }
      // VAD pass: snap each line's start to the nearest real speech onset.
      if (onsets.length) {
        setTranscribeStatus('校準時間中…');
        const aligned = alignCuesToOnsets(allCues, onsets);
        allCues.length = 0;
        allCues.push(...aligned);
        setStudioTranscript(cuesToTranscript(allCues));
      }
      if (produced) {
        if (profile && !profile.isAdmin) onConsume?.(mins);
        // Record the studio subtitle job in history (same store as transcription).
        const fullText = cuesToTranscript(allCues);
        logUsage({
          uid: profile?.uid || 'anonymous',
          email: profile?.email,
          fileName: video.name,
          durationMinutes: mins,
          model: studioModel,
          languages: [studioLang],
          charCount: fullText.length,
          transcript: fullText,
        });
      }
    } catch (e: any) {
      if (e?.message !== 'Transcription stopped by user.') setError(e?.message || '字幕生成失敗');
    } finally {
      setTranscribing(false);
      setTranscribeStatus('');
    }
  };

  // --- AI auto-highlight ---
  const handleAiHighlight = async () => {
    if (!cues.length) { setError('未有逐字稿，請先完成轉錄。'); return; }
    setHlLoading(true); setError('');
    try {
      const segs = await pickHighlights(cues, 60);
      if (!segs.length) throw new Error('AI 揀唔到精華片段');
      setHighlights(segs);
      seekTo(segs[0].start + 0.01);
    } catch (e: any) { setError(e?.message || 'AI 精華失敗'); }
    finally { setHlLoading(false); }
  };

  const handleExportHighlights = async () => {
    if (!isPro) { onRequestUnlock(); return; }
    if (!video) { setError('請先選擇影片檔'); return; }
    if (!highlights.length) { setError('請先用 AI 揀精華'); return; }
    setError('');
    const total = highlights.reduce((a, s) => a + (s.end - s.start), 0);
    const costMin = secondsToBillableMinutes(total);
    if (profile && !profile.isAdmin) {
      const chk = checkEntitlement(profile, costMin);
      if (!chk.allowed) { setError(`精華片需 ${costMin} 分鐘額度。${chk.message || ''}`); onRequestUnlock(); return; }
    }
    setPhase('processing'); setProgress(0);
    videoRef.current?.pause();
    try {
      const r = await renderHighlights(video, highlights, cues, tpl, (p) => setProgress(Math.round(p * 100)), ov, bilingual);
      const url = URL.createObjectURL(r.blob);
      const a = document.createElement('a');
      a.href = url; a.download = `highlights_${video.name.replace(/\.[^.]+$/, '')}.${r.ext}`; a.click();
      URL.revokeObjectURL(url);
      if (profile && !profile.isAdmin) onConsume?.(costMin);
      setPhase('done');
    } catch (e: any) { setPhase('error'); setError(e?.message || '精華輸出失敗'); }
  };

  const renderViaServer = async () => {
    setPhase('uploading'); setProgress(0);
    try {
      const fd = new FormData(); fd.append('video', video!); fd.append('srt', srt); fd.append('template', tpl);
      const res = await fetch(`${API_BASE}/api/subtitle-jobs`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `伺服器錯誤 ${res.status}`);
      const { jobId } = await res.json(); setPhase('processing'); poll(jobId);
    } catch (e: any) { setPhase('error'); setError(e?.message || '提交失敗'); }
  };

  const handleRender = async () => {
    if (!isPro) { onRequestUnlock(); return; }
    if (!video) { setError('請先選擇影片檔'); return; }
    if (!cues.length) { setError('未有可用字幕，請先完成帶時間戳的轉錄。'); return; }
    setError('');
    // Credit check by video length (admin/subscription exempt inside checkEntitlement).
    const costMin = secondsToBillableMinutes(duration || (cues.length ? cues[cues.length - 1].end : 0));
    if (profile && !profile.isAdmin) {
      const chk = checkEntitlement(profile, costMin);
      if (!chk.allowed) { setError(`字幕影片需 ${costMin} 分鐘額度。${chk.message || ''}`); onRequestUnlock(); return; }
    }
    consumeRef.current = (profile && !profile.isAdmin) ? costMin : 0;
    {
      // In-browser render (real-time). Prefer true-MP4 via WebCodecs; fall back
      // to MediaRecorder (webm) if the encoder pipeline isn't available/fails.
      setPhase('processing'); setProgress(0);
      videoRef.current?.pause();
      const save = (blob: Blob, ext: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `subtitled_${video.name.replace(/\.[^.]+$/, '')}.${ext}`; a.click();
        URL.revokeObjectURL(url);
      };
      const onP = (p: number) => setProgress(Math.round(p * 100));
      try {
        // Compose path needed when there are extra clips, a non-original aspect
        // (reframe), background music, voiceover, overlays, or a trimmed main
        // video. Pure subtitle-burn keeps WebCodecs MP4.
        const mainDur = duration || (cues.length ? cues[cues.length - 1].end : 5);
        const segs = segments.length ? segments : [{ in: 0, out: mainDur }];
        const needCompose = extraClips.length > 0 || aspect !== 'original' || !!bgm || !!voiceover || overlays.length > 0 || isTrimmed;
        if (needCompose) {
          const { W, H } = outputDims();
          // Each kept segment of the main video becomes a clip on the timeline.
          const mainClips: TimelineClip[] = segs.map((s, i) => ({
            id: `main-${i}`, type: 'video', url: videoUrl, name: video.name,
            inSec: s.in, outSec: s.out, duration: s.out - s.in,
            natW: videoRef.current?.videoWidth, natH: videoRef.current?.videoHeight,
          }));
          const outCues = isTrimmed ? remapCues(cues) : cues;
          const r = await renderTimeline([...mainClips, ...extraClips], W & ~1, H & ~1, onP,
            { cues: outCues, styleId: tpl, overrides: ov, bilingual },
            { fit: aspect === 'original' ? 'contain' : 'cover',
              bgm: bgm ? { file: bgm, volume: bgmVolume } : undefined,
              voiceover: voiceover ? { file: voiceover, muteOriginal } : undefined,
              overlays: overlays.map(({ type, file, natW, natH, pos, size, start, end }) => ({ type, file, natW, natH, pos, size, start, end })) });
          save(r.blob, r.ext); onConsume?.(consumeRef.current); setPhase('done'); return;
        }
        if (canUseWebCodecs()) {
          try {
            const r = await renderLocallyMp4(video, cues, tpl, onP, ov, bilingual);
            save(r.blob, r.ext); onConsume?.(consumeRef.current); setPhase('done'); return;
          } catch (e) {
            console.warn('WebCodecs MP4 失敗，改用 MediaRecorder：', e);
            setProgress(0);
          }
        }
        const r = await renderLocally(video, cues, tpl, onP, ov, bilingual);
        save(r.blob, r.ext); onConsume?.(consumeRef.current); setPhase('done');
      } catch (e: any) {
        setPhase('error'); setError(e?.message || '本地輸出失敗');
      }
    }
  };

  const busy = phase === 'uploading' || phase === 'processing';

  const onTimelineScrub = (e: React.MouseEvent) => {
    if (!end || draggingRef.current) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    seekTo(((e.clientX - rect.left) / rect.width) * end);
  };

  // Wheel over the timeline = quick zoom in/out, centred on the cursor.
  const onTimelineWheel = (e: React.WheelEvent) => {
    const el = e.currentTarget as HTMLDivElement;
    const rect = el.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const ratio = el.scrollWidth ? (cursorX + el.scrollLeft) / el.scrollWidth : 0;
    const dir = e.deltaY < 0 ? 1 : -1;
    const nz = Math.max(1, Math.min(16, +(zoom + dir * 0.5).toFixed(1)));
    if (nz === zoom) return;
    setZoom(nz);
    requestAnimationFrame(() => { el.scrollLeft = ratio * el.scrollWidth - cursorX; });
  };

  // --- Main-video segment editing (razor / trim / delete) ---
  // Split the segment under time t into two.
  const splitAt = (t: number) => setSegments((prev) => {
    const i = prev.findIndex((s) => t > s.in + 0.1 && t < s.out - 0.1);
    if (i < 0) return prev;
    const s = prev[i];
    return [...prev.slice(0, i), { in: s.in, out: t }, { in: t, out: s.out }, ...prev.slice(i + 1)];
  });
  const deleteSeg = (i: number) => setSegments((prev) => prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i));

  // Drag a segment edge to trim it.
  const startSegTrim = (e: React.MouseEvent, segIdx: number, edge: 'in' | 'out') => {
    e.preventDefault(); e.stopPropagation();
    const strip = mainStripRef.current;
    if (!strip || !duration) return;
    draggingRef.current = true;
    const width = strip.getBoundingClientRect().width;
    const startX = e.clientX;
    const seg = segments[segIdx];
    const lo = segIdx > 0 ? segments[segIdx - 1].out : 0;
    const hi = segIdx < segments.length - 1 ? segments[segIdx + 1].in : duration;
    const move = (ev: MouseEvent) => {
      const dt = ((ev.clientX - startX) / width) * duration;
      setSegments((prev) => prev.map((s, idx) => {
        if (idx !== segIdx) return s;
        if (edge === 'in') return { ...s, in: Math.max(lo, Math.min(s.out - 0.3, seg.in + dt)) };
        return { ...s, out: Math.min(hi, Math.max(s.in + 0.3, seg.out + dt)) };
      }));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setTimeout(() => { draggingRef.current = false; }, 0);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // Click on the video track: razor splits at the click; otherwise selects a seg.
  const onVideoTrackClick = (e: React.MouseEvent) => {
    if (draggingRef.current) return;
    const strip = mainStripRef.current; if (!strip || !duration) return;
    const rect = strip.getBoundingClientRect();
    const t = ((e.clientX - rect.left) / rect.width) * duration;
    if (tool === 'razor') { splitAt(t); return; }
    const i = segments.findIndex((s) => t >= s.in && t <= s.out);
    setSelectedSeg(i >= 0 ? i : null);
  };

  // Map original main-video cue times onto the trimmed output timeline.
  const remapCues = (src: Cue[]): Cue[] => {
    const out: Cue[] = [];
    for (const c of src) {
      let acc = 0;
      for (const s of segments) {
        const a = Math.max(c.start, s.in), b = Math.min(c.end, s.out);
        if (b > a) { out.push({ ...c, start: acc + (a - s.in), end: acc + (b - s.in) }); break; }
        acc += s.out - s.in;
      }
    }
    return out;
  };

  // Drop video/image files anywhere on the timeline to add clips (multi at once).
  const [dragOver, setDragOver] = useState(false);
  const onTimelineDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files?.length) addClips(e.dataTransfer.files);
  };

  // Drag the handle to resize the timeline panel (up = taller).
  const resizeTimeline = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY, startH = timelineHeight;
    const move = (ev: MouseEvent) => {
      const dy = startY - ev.clientY;
      setTimelineHeight(Math.max(96, Math.min(window.innerHeight - 220, startH + dy)));
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // Drag a subtitle block to retime it: 'move' shifts both ends, 'l'/'r' trim.
  const startDrag = (e: React.MouseEvent, index: number, mode: 'move' | 'l' | 'r') => {
    e.preventDefault(); e.stopPropagation();
    const track = trackRef.current;
    if (!track || !end) return;
    const width = track.getBoundingClientRect().width;
    const startX = e.clientX;
    const o = cues[index];
    const s0 = o.start, e0 = o.end, dur = e0 - s0;
    let moved = false;
    const move = (ev: MouseEvent) => {
      const dt = ((ev.clientX - startX) / width) * end;
      if (Math.abs(ev.clientX - startX) > 2) { moved = true; draggingRef.current = true; }
      setCues((prev) => prev.map((c, i) => {
        if (i !== index) return c;
        if (mode === 'move') { const ns = Math.max(0, Math.min(end - dur, s0 + dt)); return { ...c, start: ns, end: ns + dur }; }
        if (mode === 'l') { const ns = Math.max(0, Math.min(e0 - 0.2, s0 + dt)); return { ...c, start: ns }; }
        const ne = Math.max(s0 + 0.2, Math.min(end, e0 + dt)); return { ...c, end: ne };
      }));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (!moved) seekTo(o.start + 0.01);          // a click (no drag) seeks
      setTimeout(() => { draggingRef.current = false; }, 0);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // --- Inline subtitle editing (text / split / merge / delete) ---
  const updateCueText = (i: number, text: string) =>
    setCues((prev) => prev.map((c, idx) => (idx === i ? { ...c, text } : c)));

  const deleteCue = (i: number) => setCues((prev) => prev.filter((_, idx) => idx !== i));

  const splitCue = (i: number) =>
    setCues((prev) => {
      const c = prev[i];
      if (!c) return prev;
      const mid = c.start + (c.end - c.start) / 2;
      // Split text near the middle, preferring a space boundary.
      const half = Math.max(1, Math.round(c.text.length / 2));
      const sp = c.text.lastIndexOf(' ', half);
      const cut = sp > 0 ? sp : half;
      const a = { ...c, end: mid, text: c.text.slice(0, cut).trim() };
      const b = { ...c, start: mid, text: c.text.slice(cut).trim() };
      return [...prev.slice(0, i), a, b, ...prev.slice(i + 1)];
    });

  const mergeCueDown = (i: number) =>
    setCues((prev) => {
      if (i >= prev.length - 1) return prev;
      const a = prev[i], b = prev[i + 1];
      const merged = { ...a, end: b.end, text: `${a.text} ${b.text}`.replace(/\s+/g, ' ').trim() };
      return [...prev.slice(0, i), merged, ...prev.slice(i + 2)];
    });

  // --- AI caption design: let the AI pick a style that suits the content ---
  const [designing, setDesigning] = useState(false);
  const [designNote, setDesignNote] = useState('');
  const handleAiDesign = async () => {
    if (!cues.length) { setError('未有字幕，請先生成或載入字幕。'); return; }
    setDesigning(true); setError(''); setDesignNote('');
    try {
      const sample = cues.slice(0, 80).map((c) => c.text).join(' ');
      const d = await designCaptionStyle(sample);
      setTpl(d.template);
      setOv({
        fontFamily: fontStack(d.fontId),
        sizeFactor: (SIZE_OPTIONS.find((s) => s.id === d.sizeId) || SIZE_OPTIONS[1]).factor,
        color: d.color,
        strokeColor: d.strokeColor,
        pos: d.pos,
        animation: d.animation,
      });
      setDesignNote(d.rationale);
    } catch (e: any) {
      setError(e?.message || 'AI 設計失敗');
    } finally {
      setDesigning(false);
    }
  };

  const TRANS_LANGS: { id: string; label: string }[] = [
    { id: 'en', label: 'English' }, { id: 'zh-Hans', label: '簡體中文' },
    { id: 'ja', label: '日本語' }, { id: 'ko', label: '한국어' },
    { id: 'es', label: 'Español' }, { id: 'fr', label: 'Français' },
  ];
  const handleTranslate = async () => {
    if (!cues.length) { setError('未有字幕'); return; }
    setTranslating(true); setError('');
    try {
      const label = TRANS_LANGS.find((l) => l.id === transLang)?.label || transLang;
      const arr = await translateCues(cues.map((c) => ({ text: c.text })), label);
      setCues((prev) => prev.map((c, i) => ({ ...c, translation: arr[i] || c.translation })));
      setBilingual(true);
    } catch (e: any) {
      setError(e?.message || '翻譯失敗');
    } finally {
      setTranslating(false);
    }
  };

  // --- Royalty-free music library ---
  const loadMusicLib = async () => {
    if (musicLib.length) return;
    try {
      const r = await fetch(`${API_BASE}/api/music`);
      if (r.ok) setMusicLib(await r.json());
    } catch { /* offline: library stays empty */ }
  };
  const toggleMusicLib = () => { const n = !showMusic; setShowMusic(n); if (n) loadMusicLib(); };
  const previewTrack = (id: string) => {
    const a = previewAudioRef.current;
    if (!a) return;
    if (previewId === id && !a.paused) { a.pause(); setPreviewId(''); return; }
    a.src = `${API_BASE}/api/music/${id}`; a.volume = 0.6; a.play().catch(() => {}); setPreviewId(id);
  };
  const useTrack = async (t: Track) => {
    setMusicBusy(true); setError('');
    try {
      const r = await fetch(`${API_BASE}/api/music/${t.id}`);
      if (!r.ok) throw new Error('音樂下載失敗');
      const blob = await r.blob();
      setBgm(new File([blob], `${t.title}.mp3`, { type: blob.type || 'audio/mpeg' }));
      previewAudioRef.current?.pause(); setPreviewId('');
    } catch (e: any) { setError(e?.message || '無法載入音樂'); }
    finally { setMusicBusy(false); }
  };
  const handleAiMusic = async () => {
    if (!cues.length) { setError('未有字幕，AI 需要內容嚟判斷氛圍。'); return; }
    setMusicBusy(true); setError(''); setMusicNote('');
    try {
      await loadMusicLib();
      const lib = musicLib.length ? musicLib : await (await fetch(`${API_BASE}/api/music`)).json();
      const sample = cues.slice(0, 60).map((c) => c.text).join(' ');
      const pick = await pickMusicForVibe(sample, lib);
      const t = lib.find((x: Track) => x.id === pick.id);
      if (t) { await useTrack(t); setMusicNote(`${t.title} — ${pick.reason}`); setShowMusic(true); }
    } catch (e: any) { setError(e?.message || 'AI 配樂失敗'); }
    finally { setMusicBusy(false); }
  };

  // Download the subtitle file in a chosen format (SRT / VTT / TXT).
  const exportSubs = (fmt: 'srt' | 'vtt' | 'txt') => {
    if (!cues.length) { setError('未有字幕'); return; }
    const bi = bilingual && cues.some((c) => c.translation);
    const body = fmt === 'srt' ? cuesToSrt(cues, false, bi) : fmt === 'vtt' ? cuesToVtt(cues, bi) : cuesToPlainText(cues, bi);
    const mime = fmt === 'vtt' ? 'text/vtt' : 'text/plain';
    const blob = new Blob([body], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${(video?.name || 'subtitles').replace(/\.[^.]+$/, '')}.${fmt}`; a.click();
    URL.revokeObjectURL(url);
  };

  // AI per-line animation + keyword emphasis (one call; applies to each cue).
  const [animating, setAnimating] = useState(false);
  const handleAiCueAnim = async () => {
    if (!cues.length) { setError('未有字幕，請先生成或載入字幕。'); return; }
    setAnimating(true); setError('');
    try {
      const arr = await designCueAnimations(cues.map((c) => ({ text: c.text })));
      const byIdx = new Map(arr.map((a) => [a.i, a]));
      setCues((prev) => prev.map((c, i) => {
        const m = byIdx.get(i);
        return m ? { ...c, anim: m.anim, emphasis: m.emph } : { ...c, anim: undefined, emphasis: undefined };
      }));
      setDesignNote(`已為 ${arr.length} 句加上動畫 / 重點字`);
    } catch (e: any) {
      setError(e?.message || 'AI 動畫失敗');
    } finally {
      setAnimating(false);
    }
  };

  // --- Media library: extra clips/photos appended after the main video ---
  const cuid = () => Math.random().toString(36).slice(2, 9);
  // Grab a small first-frame thumbnail from a video object URL.
  const videoThumb = (url: string): Promise<string> => new Promise((res) => {
    const v = document.createElement('video'); v.src = url; v.muted = true; v.preload = 'metadata'; v.crossOrigin = 'anonymous';
    const grab = () => {
      try {
        const w = 120, h = Math.max(40, Math.round(120 * ((v.videoHeight || 9) / (v.videoWidth || 16))));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d'); if (!ctx) return res('');
        ctx.drawImage(v, 0, 0, w, h); res(c.toDataURL('image/jpeg', 0.6));
      } catch { res(''); }
    };
    v.onloadeddata = () => { try { v.currentTime = Math.min(0.1, (v.duration || 1) / 2); } catch { grab(); } };
    v.onseeked = grab;
    v.onerror = () => res('');
    setTimeout(() => res(''), 4000);
  });

  const addClips = async (files: FileList | null) => {
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
        const thumb = await videoThumb(url);
        next.push({ id: cuid(), type: 'video', url, name: f.name, inSec: 0, outSec: meta.d, duration: meta.d, srcDur: meta.d, natW: meta.w, natH: meta.h, thumb });
      } else if (f.type.startsWith('image')) {
        const meta = await new Promise<{ w: number; h: number }>((res) => {
          const img = new Image(); img.src = url; img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => res({ w: 1280, h: 720 });
        });
        next.push({ id: cuid(), type: 'image', url, name: f.name, inSec: 0, outSec: 3, duration: 3, natW: meta.w, natH: meta.h, thumb: url });
      }
    }
    setExtraClips((prev) => [...prev, ...next]);
  };
  const moveClip = (i: number, dir: -1 | 1) => setExtraClips((prev) => {
    const j = i + dir; if (j < 0 || j >= prev.length) return prev;
    const n = [...prev]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const removeClip = (id: string) => setExtraClips((prev) => prev.filter((c) => c.id !== id));
  const setClipDur = (id: string, d: number) => setExtraClips((prev) => prev.map((c) => c.id === id ? { ...c, duration: Math.max(0.5, d), outSec: Math.max(0.5, d) } : c));
  // Trim a video clip's in/out (seconds), clamped to its source length.
  const setClipTrim = (id: string, edge: 'in' | 'out', v: number) => setExtraClips((prev) => prev.map((c) => {
    if (c.id !== id) return c;
    const src = c.srcDur || c.outSec || c.duration;
    let inSec = c.inSec, outSec = c.outSec;
    if (edge === 'in') inSec = Math.max(0, Math.min(outSec - 0.5, v));
    else outSec = Math.min(src, Math.max(inSec + 0.5, v));
    return { ...c, inSec, outSec, duration: outSec - inSec };
  }));

  // --- Overlay (PiP) layers ---
  const addOverlay = async (file: File) => {
    if (overlays.length >= 2) return;
    const url = URL.createObjectURL(file);
    const type: 'video' | 'image' = file.type.startsWith('video') ? 'video' : 'image';
    const meta = await new Promise<{ w: number; h: number }>((res) => {
      if (type === 'video') {
        const v = document.createElement('video'); v.preload = 'metadata'; v.src = url;
        v.onloadedmetadata = () => res({ w: v.videoWidth, h: v.videoHeight }); v.onerror = () => res({ w: 1280, h: 720 });
      } else {
        const i = new Image(); i.src = url; i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res({ w: 1280, h: 720 });
      }
    });
    setOverlays((prev) => [...prev, { id: cuid(), file, url, type, natW: meta.w, natH: meta.h, pos: 'br', size: 0.3 }]);
  };
  const removeOverlay = (id: string) => setOverlays((prev) => prev.filter((o) => o.id !== id));
  const updateOverlay = (id: string, patch: Partial<StudioOverlay>) => setOverlays((prev) => prev.map((o) => o.id === id ? { ...o, ...patch } : o));
  // CSS placement for the preview (mirrors overlayRect in the renderer).
  const overlayCss = (o: StudioOverlay): React.CSSProperties => {
    const base: React.CSSProperties = { position: 'absolute', width: `${o.size * 100}%`, aspectRatio: `${o.natW || 16}/${o.natH || 9}`, objectFit: 'cover', borderRadius: 4 };
    if (o.pos === 'tl') return { ...base, top: '3%', left: '3%' };
    if (o.pos === 'tr') return { ...base, top: '3%', right: '3%' };
    if (o.pos === 'bl') return { ...base, bottom: '3%', left: '3%' };
    if (o.pos === 'br') return { ...base, bottom: '3%', right: '3%' };
    return { ...base, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0F0D] flex flex-col animate-fade-in text-paper">
      {/* hidden video for thumbnail extraction */}
      {videoUrl && (
        <video ref={thumbVideoRef} src={videoUrl} muted preload="auto" className="hidden"
          onLoadedData={() => buildThumbs()} crossOrigin="anonymous" />
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 h-12 border-b border-white/10 shrink-0">
        {tabs || <h3 className="font-display font-bold text-white flex items-center gap-2 text-sm"><Film size={16} className="text-teal-400" /> 字幕工作室</h3>}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-white/40 hidden sm:block">{video?.name}</span>
          <Button onClick={handleRender} disabled={busy || !cues.length} className="h-8 text-xs px-3">
            {busy ? <><Loader2 size={14} className="mr-1.5 animate-spin" /> {phase === 'uploading' ? '上載' : `${progress}%`}</> : <><Download size={14} className="mr-1.5" /> 匯出 MP4</>}
          </Button>
          <button onClick={onClose} className="text-white/50 hover:text-white p-1.5"><X size={18} /></button>
        </div>
      </div>

      {/* Filmora-style media-type toolbar (quick guide to each feature area) */}
      <div className="h-12 shrink-0 border-b border-white/10 bg-black/20 flex items-center gap-1 px-3 overflow-x-auto">
        {([
          ['媒體', Film, '左邊媒體庫：主影片、加片段/相片、疊加圖層、旁白配音'],
          ['字幕', Type, '右邊：生成字幕（引擎/語言）、字幕模板、內嵌編輯'],
          ['效果', Sparkles, '右邊「字幕外觀」：字體/大小/顏色/動畫、AI 設計、AI 逐句動畫'],
          ['音訊', Music, '左邊：旁白配音；右邊：背景音樂（AI 配樂 / 音樂庫）'],
          ['翻譯', Type, '右邊「字幕外觀」下方：翻譯做多語言 + 雙語字幕'],
          ['比例', Combine, '右邊「畫面比例」：原片 / 9:16 / 1:1 / 16:9 重構圖'],
          ['剪輯', Scissors, '下方時間線：選取/分割(razor)/刪除，拖片段邊緣剪 in/out'],
        ] as [string, any, string][]).map(([id, Icon, hint]) => (
          <button key={id} onClick={() => setTopTab(id)}
            className={`flex flex-col items-center justify-center gap-0.5 px-3 h-full text-[10px] shrink-0 border-b-2 transition-colors ${topTab === id ? 'border-teal-400 text-teal-300' : 'border-transparent text-white/50 hover:text-white'}`}
            title={hint}>
            <Icon size={16} /> {id}
          </button>
        ))}
        <span className="ml-2 text-[10px] text-white/35 truncate hidden lg:block">
          {({ 媒體: '左邊媒體庫加素材', 字幕: '右邊生成 / 編輯字幕', 效果: '右邊調字幕外觀 + AI 動畫', 音訊: '旁白（左）/ 背景音樂（右）', 翻譯: '右邊翻譯做雙語', 比例: '右邊揀畫面比例', 剪輯: '下方時間線剪片' } as Record<string, string>)[topTab]}
        </span>
      </div>

      {/* Main: 4-panel — media library · preview · inspector (+ timeline below) */}
      <div className="flex-1 min-h-0 flex">
        {/* Left: media library */}
        <div className="w-60 shrink-0 border-r border-white/10 bg-black/30 flex flex-col">
          <div className="px-3 h-9 flex items-center justify-between border-b border-white/5">
            <span className="text-[11px] text-white/40 uppercase tracking-wider flex items-center gap-1.5"><Film size={12} /> 媒體庫</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
            {/* Main video card */}
            <div className={`rounded-lg border p-2 text-[11px] ${video ? 'border-teal-500/40 bg-teal-500/10 text-teal-100' : 'border-white/10 text-white/40'}`}>
              <div className="flex items-center gap-1.5"><Film size={12} className="text-teal-400 shrink-0" /><span className="truncate flex-1">{video?.name || '主影片（字幕）'}</span></div>
              <div className="text-[10px] text-white/40 mt-0.5">{video ? `${Math.round(duration)}s · 字幕來源` : '未選擇'}</div>
              <label className={`mt-1.5 w-full px-2 py-1 rounded border border-dashed border-white/15 text-[10px] text-white/60 hover:border-teal-400 hover:text-teal-300 flex items-center justify-center gap-1 cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
                <Upload size={11} /> {video ? '更換' : '選擇影片（可一次揀多個）'}
                <input id="studio-video-input" ref={fileRef} type="file" accept="video/*" multiple className="sr-only" disabled={busy} onChange={(e) => { pickVideos(e.target.files); e.currentTarget.value = ''; }} />
              </label>
            </div>

            {/* Extra clips/photos */}
            {extraClips.length > 0 && (
              <div className="text-[10px] text-white/40 px-0.5 flex items-center justify-between">
                <span>附加片段 · {extraClips.length}</span>
                <button onClick={() => setExtraClips([])} className="text-white/40 hover:text-red-400">全部清除</button>
              </div>
            )}
            {extraClips.map((c, i) => (
              <div key={c.id} className="rounded-lg border border-white/10 bg-white/5 p-1.5 flex gap-2">
                {/* Thumbnail */}
                <div className="w-14 h-10 shrink-0 rounded bg-black/40 bg-cover bg-center relative overflow-hidden"
                  style={c.thumb ? { backgroundImage: `url(${c.thumb})` } : undefined}>
                  {!c.thumb && <div className="absolute inset-0 flex items-center justify-center">{c.type === 'video' ? <Film size={14} className="text-white/30" /> : <ImageIcon size={14} className="text-white/30" />}</div>}
                  <span className="absolute bottom-0 right-0 bg-black/60 text-white/80 text-[8px] px-1 rounded-tl">{c.type === 'video' ? `${Math.round(c.duration)}s` : '相'}</span>
                </div>
                {/* Info + actions */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-white/40 tnum">{i + 1}.</span>
                    <span className="truncate text-[11px] text-white/70 flex-1">{c.name}</span>
                    <button onClick={() => removeClip(c.id)} className="p-0.5 text-white/40 hover:text-red-400" title="刪除"><Trash2 size={12} /></button>
                  </div>
                  {c.type === 'image' ? (
                    <label className="text-[10px] text-white/50 flex items-center gap-1 mt-0.5">秒
                      <input type="number" min={0.5} step={0.5} value={c.duration} onChange={(e) => setClipDur(c.id, +e.target.value)}
                        className="w-10 bg-black/30 border border-white/10 rounded px-1 py-0.5 text-white text-[10px]" />
                    </label>
                  ) : (
                    <div className="flex items-center gap-1 mt-0.5 text-[10px] text-white/45">
                      <span>剪</span>
                      <input type="number" min={0} step={0.5} value={+c.inSec.toFixed(1)} title="入點秒"
                        onChange={(e) => setClipTrim(c.id, 'in', +e.target.value)}
                        className="w-10 bg-black/30 border border-white/10 rounded px-1 py-0.5 text-white" />
                      <span>→</span>
                      <input type="number" min={0} step={0.5} value={+c.outSec.toFixed(1)} title="出點秒"
                        onChange={(e) => setClipTrim(c.id, 'out', +e.target.value)}
                        className="w-10 bg-black/30 border border-white/10 rounded px-1 py-0.5 text-white" />
                    </div>
                  )}
                  <div className="flex items-center gap-1 mt-0.5">
                    <button onClick={() => moveClip(i, -1)} disabled={i === 0} className="p-0.5 text-white/40 hover:text-white disabled:opacity-20" title="上移"><ChevronUp size={12} /></button>
                    <button onClick={() => moveClip(i, 1)} disabled={i === extraClips.length - 1} className="p-0.5 text-white/40 hover:text-white disabled:opacity-20" title="下移"><ChevronDown size={12} /></button>
                  </div>
                </div>
              </div>
            ))}

            <label className="w-full px-2 py-2 rounded-lg border border-dashed border-white/15 text-[11px] text-white/55 hover:border-teal-400 hover:text-teal-300 flex items-center justify-center gap-1.5 cursor-pointer">
              <Upload size={12} /> 加片段 / 相片（可一次揀多個）
              <input ref={clipInputRef} type="file" accept="video/*,image/*" multiple className="sr-only" onChange={(e) => { addClips(e.target.files); e.currentTarget.value = ''; }} />
            </label>
            <p className="text-[10px] text-white/30 leading-relaxed px-0.5">附加片段會接喺主影片之後（可上下排序），字幕疊喺主影片上，一次匯出。</p>

            {/* Overlay (picture-in-picture) layers */}
            <div className="pt-2 border-t border-white/5">
              <div className="text-[11px] text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5"><ImageIcon size={12} /> 疊加圖層（畫中畫）· {overlays.length}/2</div>
              {overlays.map((o) => (
                <div key={o.id} className="rounded-lg border border-white/10 bg-white/5 p-2 mb-1.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-white/70">
                    {o.type === 'video' ? <Film size={12} className="text-teal-400 shrink-0" /> : <ImageIcon size={12} className="text-amber-400 shrink-0" />}
                    <span className="truncate flex-1">{o.file.name}</span>
                    <button onClick={() => removeOverlay(o.id)} className="text-white/40 hover:text-red-400"><Trash2 size={12} /></button>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {([['tl', '↖'], ['tr', '↗'], ['c', '◎'], ['bl', '↙'], ['br', '↘']] as const).map(([p, label]) => (
                      <button key={p} onClick={() => updateOverlay(o.id, { pos: p })}
                        className={`py-1 rounded text-[12px] ${o.pos === p ? 'bg-teal-500/30 text-teal-200' : 'bg-white/5 text-white/50 hover:text-white'}`}>{label}</button>
                    ))}
                  </div>
                  <label className="block text-[10px] text-white/45">大小 {Math.round(o.size * 100)}%
                    <input type="range" min={0.15} max={0.6} step={0.05} value={o.size}
                      onChange={(e) => updateOverlay(o.id, { size: +e.target.value })} className="w-full accent-teal-500" />
                  </label>
                  <div className="flex items-center gap-1.5 text-[10px] text-white/45">
                    <span>顯示</span>
                    <input type="number" min={0} step={0.5} value={o.start ?? 0} title="開始秒"
                      onChange={(e) => updateOverlay(o.id, { start: Math.max(0, +e.target.value) })}
                      className="w-12 bg-black/30 border border-white/10 rounded px-1 py-0.5 text-white" />
                    <span>→</span>
                    <input type="number" min={0} step={0.5} value={o.end || 0} placeholder="片尾" title="結束秒（0 = 到片尾）"
                      onChange={(e) => updateOverlay(o.id, { end: Math.max(0, +e.target.value) })}
                      className="w-12 bg-black/30 border border-white/10 rounded px-1 py-0.5 text-white" />
                    <span>秒{(!o.end || o.end <= 0) ? '（到尾）' : ''}</span>
                  </div>
                </div>
              ))}
              {overlays.length < 2 && (
                <label className="w-full px-2 py-2 rounded-lg border border-dashed border-white/15 text-[11px] text-white/55 hover:border-teal-400 hover:text-teal-300 flex items-center justify-center gap-1.5 cursor-pointer">
                  <Upload size={12} /> 加疊加層（影片 / 相片）
                  <input type="file" accept="video/*,image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) addOverlay(f); e.currentTarget.value = ''; }} />
                </label>
              )}
              <p className="text-[10px] text-white/30 mt-1">疊喺主影片上（畫中畫）。</p>
            </div>

            {/* Voiceover / narration — becomes the main voice + subtitle source */}
            <div className="pt-2 border-t border-white/5">
              <div className="text-[11px] text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Mic size={12} /> 旁白配音</div>
              {voiceover ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[11px] text-white/70">
                    <Mic size={12} className="text-teal-400 shrink-0" />
                    <span className="truncate flex-1">{voiceover.name}</span>
                    <button onClick={() => setVoiceover(null)} className="text-white/40 hover:text-red-400"><Trash2 size={12} /></button>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-white/60 cursor-pointer">
                    <input type="checkbox" checked={muteOriginal} onChange={(e) => setMuteOriginal(e.target.checked)} className="accent-teal-500" />
                    靜音原片聲音（用旁白做主聲）
                  </label>
                  <p className="text-[10px] text-white/30">字幕會由旁白生成。撳「生成字幕」即可。</p>
                </div>
              ) : (
                <label className="w-full px-2 py-2 rounded-lg border border-dashed border-white/15 text-[11px] text-white/55 hover:border-teal-400 hover:text-teal-300 flex items-center justify-center gap-1.5 cursor-pointer">
                  <Upload size={12} /> 匯入旁白 / 配音音檔
                  <input type="file" accept="audio/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setVoiceover(f); e.currentTarget.value = ''; }} />
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 min-w-0 flex flex-col items-center justify-center p-6 relative">
          {videoUrl ? (
            <div className="relative inline-flex bg-black rounded-lg overflow-hidden shadow-2xl"
              style={aspectCss ? { aspectRatio: aspectCss, maxHeight: 'calc(100vh - 220px)' } : undefined}>
              <video ref={videoRef} src={videoUrl} muted={!!voiceover && muteOriginal}
                className={`block bg-black ${aspectCss ? 'w-full h-full object-cover' : 'max-h-[calc(100vh-220px)] max-w-full rounded-lg'}`}
                onLoadedMetadata={(e) => { const d = (e.target as HTMLVideoElement).duration; setDuration(d); setSegments((s) => s.length ? s : [{ in: 0, out: d }]); }}
                onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
                onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onClick={togglePlay} />
              {/* Hidden voiceover audio, synced to the preview video. */}
              {voiceUrl && <audio ref={voiceAudioRef} src={voiceUrl} preload="auto" className="hidden" />}
              {/* Overlay (PiP) layers in the preview — shown within their window. */}
              {overlays.filter((o) => currentTime >= (o.start || 0) && (!o.end || o.end <= 0 || currentTime <= o.end)).map((o) => o.type === 'video'
                ? <video key={o.id} src={o.url} style={overlayCss(o)} muted loop autoPlay playsInline />
                : <img key={o.id} src={o.url} style={overlayCss(o)} alt="" />)}
              {/* Shared caption canvas overlay (preview) */}
              <canvas ref={previewCanvasRef} className="absolute inset-0 pointer-events-none" />
            </div>
          ) : (
            <label htmlFor="studio-video-input" className="flex flex-col items-center gap-3 text-white/40 hover:text-teal-300 transition-colors cursor-pointer">
              <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-white/15 flex items-center justify-center"><Upload size={28} /></div>
              <span className="text-sm">選擇影片檔開始（MP4 / MOV）</span>
            </label>
          )}
        </div>

        {/* Inspector */}
        <div className="w-72 shrink-0 border-l border-white/10 p-4 flex flex-col gap-4 overflow-y-auto scrollbar-thin bg-black/30">
          {/* Generate subtitles from the loaded video */}
          {video && (
            <div className="rounded-lg border border-teal-500/30 bg-teal-500/5 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-teal-300 uppercase tracking-wider flex items-center gap-1.5"><Type size={12} /> 字幕</span>
                <span className="text-[10px] text-white/40">{cues.length} 句</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                <label className="text-[10px] text-white/50">引擎
                  <select value={studioModel} onChange={(e) => setStudioModel(e.target.value)} disabled={transcribing}
                    className="w-full mt-0.5 bg-black/30 border border-white/10 rounded px-1.5 py-1 text-white text-[11px]">
                    {MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
                <label className="text-[10px] text-white/50">語言
                  <select value={studioLang} onChange={(e) => setStudioLang(e.target.value)} disabled={transcribing}
                    className="w-full mt-0.5 bg-black/30 border border-white/10 rounded px-1.5 py-1 text-white text-[11px]">
                    {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
              </div>
              <button onClick={handleTranscribeVideo} disabled={transcribing || busy}
                className="w-full h-9 rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">
                {transcribing ? <><Loader2 size={14} className="animate-spin" /> {transcribeStatus || '生成中…'}</> : <><Sparkles size={14} /> {cues.length ? '重新生成字幕' : '自動生成字幕'}</>}
              </button>
              <p className="text-[10px] text-white/40 mt-1.5 leading-relaxed">先抽音軌再 AI 轉錄，長片都得。</p>
            </div>
          )}

          <div>
            <div className="text-[11px] text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Type size={12} /> 字幕模板</div>
            <div className="grid grid-cols-1 gap-1.5">
              {templates.map((t) => (
                <button key={t.id} onClick={() => setTpl(t.id)} disabled={busy}
                  className={`relative px-3 py-2 rounded-lg border text-xs font-medium text-left transition-colors ${tpl === t.id ? 'border-teal-500 bg-teal-500/15 text-teal-200' : 'border-white/10 text-white/60 hover:border-teal-500/50'}`}>
                  {tpl === t.id && <Check size={13} className="absolute top-2 right-2 text-teal-400" />}
                  {t.name}
                  {t.animated && <span className="block text-[9px] text-teal-400 mt-0.5 flex items-center gap-0.5"><Sparkles size={9} /> 動畫</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Caption style controls — font / size / colour / position / anim */}
          <div className="rounded-lg border border-white/10 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-white/40 uppercase tracking-wider flex items-center gap-1.5"><Palette size={12} /> 字幕外觀</span>
              {Object.keys(ov).length > 0 && <button onClick={() => setOv({})} className="text-[10px] text-white/40 hover:text-teal-300">重設</button>}
            </div>

            {/* AI design — whole-video look */}
            <button onClick={handleAiDesign} disabled={designing || animating || !cues.length}
              className="w-full h-9 rounded-lg bg-gradient-to-r from-fuchsia-500 to-teal-500 hover:opacity-90 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">
              {designing ? <><Loader2 size={14} className="animate-spin" /> AI 設計中…</> : <><Sparkles size={14} /> AI 設計整體風格</>}
            </button>
            {/* AI design — per-line animation + emphasis */}
            <button onClick={handleAiCueAnim} disabled={designing || animating || !cues.length}
              className="w-full h-9 rounded-lg border border-fuchsia-400/40 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-200 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">
              {animating ? <><Loader2 size={14} className="animate-spin" /> AI 逐句分析中…</> : <><Sparkles size={14} /> AI 逐句動畫 + 重點字</>}
            </button>
            {designNote && <p className="text-[10px] text-teal-300/90 leading-relaxed flex items-start gap-1"><Sparkles size={10} className="shrink-0 mt-0.5" /> {designNote}</p>}

            {/* Translation / bilingual subtitles */}
            <div className="pt-2 border-t border-white/10 space-y-2">
              <div className="flex items-center gap-1.5">
                <select value={transLang} onChange={(e) => setTransLang(e.target.value)} disabled={translating}
                  className="flex-1 bg-black/30 border border-white/10 rounded px-1.5 py-1 text-white text-[11px]">
                  {TRANS_LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
                <button onClick={handleTranslate} disabled={translating || !cues.length}
                  className="px-2.5 h-7 rounded-md bg-teal-500/80 hover:bg-teal-500 text-white text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50">
                  {translating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} 翻譯
                </button>
              </div>
              {cues.some((c) => c.translation) && (
                <label className="flex items-center gap-2 text-[11px] text-white/60 cursor-pointer">
                  <input type="checkbox" checked={bilingual} onChange={(e) => setBilingual(e.target.checked)} className="accent-teal-500" />
                  顯示雙語字幕（原文 + 譯文）
                </label>
              )}
            </div>

            {/* Font family */}
            <div>
              <div className="text-[10px] text-white/45 mb-1">字體</div>
              <div className="grid grid-cols-2 gap-1">
                {FONT_OPTIONS.map((f) => {
                  const active = ov.fontFamily === f.stack;
                  return (
                    <button key={f.id} onClick={() => setOvKey('fontFamily', f.stack)}
                      style={{ fontFamily: f.stack }}
                      className={`px-2 py-1.5 rounded border text-xs transition-colors ${active ? 'border-teal-500 bg-teal-500/15 text-teal-200' : 'border-white/10 text-white/60 hover:border-teal-500/50'}`}>{f.name}</button>
                  );
                })}
              </div>
            </div>

            {/* Font size */}
            <div>
              <div className="text-[10px] text-white/45 mb-1">大小</div>
              <div className="grid grid-cols-4 gap-1">
                {SIZE_OPTIONS.map((s) => {
                  const active = ov.sizeFactor === s.factor;
                  return (
                    <button key={s.id} onClick={() => setOvKey('sizeFactor', s.factor)}
                      className={`px-1 py-1.5 rounded border text-[11px] transition-colors ${active ? 'border-teal-500 bg-teal-500/15 text-teal-200' : 'border-white/10 text-white/60 hover:border-teal-500/50'}`}>{s.name}</button>
                  );
                })}
              </div>
            </div>

            {/* Colour + stroke */}
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] text-white/45 flex items-center justify-between">文字色
                <input type="color" value={(ov.color as string) || '#FFFFFF'} onChange={(e) => setOvKey('color', e.target.value)}
                  className="w-7 h-6 rounded bg-transparent border border-white/10 cursor-pointer" />
              </label>
              <label className="text-[10px] text-white/45 flex items-center justify-between">描邊色
                <input type="color" value={(ov.strokeColor as string)?.startsWith('#') ? (ov.strokeColor as string) : '#000000'} onChange={(e) => setOvKey('strokeColor', e.target.value)}
                  className="w-7 h-6 rounded bg-transparent border border-white/10 cursor-pointer" />
              </label>
            </div>

            {/* Position */}
            <div>
              <div className="text-[10px] text-white/45 mb-1">位置</div>
              <div className="grid grid-cols-3 gap-1">
                {([['top', '上'], ['middle', '中'], ['bottom', '下']] as [CaptionPos, string][]).map(([p, label]) => (
                  <button key={p} onClick={() => setOvKey('pos', p)}
                    className={`px-1 py-1.5 rounded border text-[11px] transition-colors ${ov.pos === p ? 'border-teal-500 bg-teal-500/15 text-teal-200' : 'border-white/10 text-white/60 hover:border-teal-500/50'}`}>{label}</button>
                ))}
              </div>
            </div>

            {/* Animation */}
            <div>
              <div className="text-[10px] text-white/45 mb-1">動畫</div>
              <div className="grid grid-cols-4 gap-1">
                {([['none', '無'], ['fade', '淡入'], ['pop', '彈出'], ['slide', '上移']] as [CaptionAnim, string][]).map(([a, label]) => (
                  <button key={a} onClick={() => setOvKey('animation', a)}
                    className={`px-1 py-1.5 rounded border text-[11px] transition-colors ${ov.animation === a ? 'border-teal-500 bg-teal-500/15 text-teal-200' : 'border-white/10 text-white/60 hover:border-teal-500/50'}`}>{label}</button>
                ))}
              </div>
            </div>
          </div>

          {/* AI auto-highlight */}
          <div className="rounded-lg border border-teal-500/30 bg-teal-500/5 p-3">
            <div className="text-[11px] text-teal-300 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Sparkles size={12} /> AI 自動剪重點</div>
            <button onClick={handleAiHighlight} disabled={hlLoading || !cues.length}
              className="w-full h-9 rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">
              {hlLoading ? <><Loader2 size={14} className="animate-spin" /> AI 分析中…</> : <><Sparkles size={14} /> {highlights.length ? '重新揀精華' : 'AI 揀出精華'}</>}
            </button>
            {highlights.length > 0 && (
              <>
                <p className="text-[10px] text-white/50 mt-2">已揀 {highlights.length} 段精華（共 {Math.round(highlights.reduce((a, s) => a + (s.end - s.start), 0))} 秒）。</p>
                <button onClick={handleExportHighlights} disabled={busy}
                  className="w-full h-9 mt-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">
                  <Download size={14} /> 匯出精華片
                </button>
              </>
            )}
          </div>

          {/* Output (local only) */}
          <div>
            <div className="text-[11px] text-white/40 uppercase tracking-wider mb-2">輸出方式</div>
            <p className="text-[10px] text-white/40 leading-relaxed">
              本地輸出 {webcodecs && !extraClips.length ? '真 MP4 (WebCodecs)' : 'MP4 / WebM'}：所有處理中影片只暫存於你裝置本地、免上傳、即做即得（約等於片長）。{extraClips.length ? `會合併主影片 + ${extraClips.length} 個附加片段。` : ''}
            </p>
          </div>

          {/* Output aspect ratio (social reframe) */}
          <div>
            <div className="text-[11px] text-white/40 uppercase tracking-wider mb-2">畫面比例</div>
            <div className="grid grid-cols-4 gap-1">
              {([['original', '原片'], ['9_16', '9:16'], ['1_1', '1:1'], ['16_9', '16:9']] as const).map(([a, label]) => (
                <button key={a} onClick={() => setAspect(a)}
                  className={`px-1 py-1.5 rounded border text-[11px] transition-colors ${aspect === a ? 'border-teal-500 bg-teal-500/15 text-teal-200' : 'border-white/10 text-white/60 hover:border-teal-500/50'}`}>{label}</button>
              ))}
            </div>
            {aspect !== 'original' && <p className="text-[10px] text-white/30 mt-1">會自動裁切置中重構圖，直出 IG / 抖音 / Shorts。</p>}
          </div>


          {/* Background music */}
          <div>
            <div className="text-[11px] text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Music size={12} /> 背景音樂</div>
            {bgm ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] text-white/70">
                  <Music size={12} className="text-teal-400 shrink-0" />
                  <span className="truncate flex-1">{bgm.name}</span>
                  <button onClick={() => setBgm(null)} className="text-white/40 hover:text-red-400"><Trash2 size={12} /></button>
                </div>
                <label className="block text-[10px] text-white/50">音量 {Math.round(bgmVolume * 100)}%
                  <input type="range" min={0} max={1} step={0.05} value={bgmVolume} onChange={(e) => setBgmVolume(+e.target.value)}
                    className="w-full accent-teal-500" />
                </label>
                <p className="text-[10px] text-white/30">音樂會循環墊喺人聲下面（本地輸出生效）。</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <button onClick={handleAiMusic} disabled={musicBusy || !cues.length}
                    className="h-8 rounded-lg bg-gradient-to-r from-fuchsia-500 to-teal-500 hover:opacity-90 text-white text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-50">
                    {musicBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} AI 配樂
                  </button>
                  <button onClick={toggleMusicLib}
                    className="h-8 rounded-lg border border-white/15 text-white/70 text-[11px] font-semibold flex items-center justify-center gap-1 hover:border-teal-400 hover:text-teal-200">
                    <Music size={12} /> 音樂庫
                  </button>
                </div>
                <label className="w-full px-2 py-1.5 rounded-lg border border-dashed border-white/15 text-[11px] text-white/55 hover:border-teal-400 hover:text-teal-300 flex items-center justify-center gap-1.5 cursor-pointer">
                  <Upload size={12} /> 或上載自己嘅音樂
                  <input type="file" accept="audio/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setBgm(f); e.currentTarget.value = ''; }} />
                </label>
                {showMusic && (
                  <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                    {musicLib.length === 0 ? (
                      <p className="text-[10px] text-white/30 px-1">載入音樂庫中…</p>
                    ) : musicLib.map((t) => (
                      <div key={t.id} className="flex items-center gap-1.5 rounded-lg bg-white/5 p-1.5">
                        <button onClick={() => previewTrack(t.id)} className="w-6 h-6 shrink-0 rounded-full bg-teal-500/80 hover:bg-teal-500 text-white flex items-center justify-center">
                          {previewId === t.id ? <Pause size={11} /> : <Play size={11} className="ml-0.5" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] text-white/80 truncate">{t.title}</div>
                          <div className="text-[9px] text-white/35 truncate">{t.moods.slice(0, 3).join(' · ')}</div>
                        </div>
                        <button onClick={() => useTrack(t)} disabled={musicBusy}
                          className="px-2 py-1 rounded-md bg-white/10 hover:bg-teal-500/30 text-[10px] text-white/80 disabled:opacity-50">選用</button>
                      </div>
                    ))}
                  </div>
                )}
                {musicNote && <p className="text-[10px] text-teal-300/90 leading-relaxed flex items-start gap-1"><Sparkles size={10} className="shrink-0 mt-0.5" /> {musicNote}</p>}
                <p className="text-[10px] text-white/25">免版稅音樂庫（示範曲庫，可換成你授權嘅曲目）。</p>
                <audio ref={previewAudioRef} onEnded={() => setPreviewId('')} className="hidden" />
              </div>
            )}
          </div>

          {/* Subtitle file export (SRT / VTT / TXT) */}
          <div>
            <div className="text-[11px] text-white/40 uppercase tracking-wider mb-2">字幕檔匯出</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['srt', 'vtt', 'txt'] as const).map((f) => (
                <button key={f} onClick={() => exportSubs(f)} disabled={!cues.length}
                  className="py-1.5 rounded-lg border border-white/10 text-white/70 text-[11px] font-medium hover:border-teal-500/60 hover:text-teal-200 disabled:opacity-40 transition-colors uppercase">{f}</button>
              ))}
            </div>
            <p className="text-[10px] text-white/30 mt-1">剪映 / CapCut 直接匯入 SRT 即可。{bilingual && cues.some((c) => c.translation) ? '（含雙語）' : ''}</p>
          </div>

          {/* Inline subtitle editor — edit text, split, merge, delete per line */}
          <div>
            <div className="text-[11px] text-white/40 uppercase tracking-wider mb-2">
              字幕編輯 · <span className="text-teal-300 font-semibold">{cues.length}</span> 句
            </div>
            {cues.length === 0 ? (
              <div className="rounded-lg bg-white/5 p-3 text-[11px] text-white/40 leading-relaxed">
                未有字幕。撳上面「自動生成字幕」，或匯入逐字稿。
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
                {cues.map((c, i) => (
                  <div key={i}
                    className={`rounded-lg p-2 transition-colors ${activeIdx === i ? 'bg-teal-500/20 ring-1 ring-teal-400/40' : 'bg-white/5 hover:bg-white/10'}`}>
                    <div className="flex items-center gap-1 mb-1">
                      <button onClick={() => seekTo(c.start + 0.01)} title="跳到呢句"
                        className="font-mono text-[10px] text-teal-300 hover:text-teal-200">{tc(c.start).slice(0, 5)}</button>
                      <span className="font-mono text-[10px] text-white/25">→ {tc(c.end).slice(0, 5)}</span>
                      <div className="ml-auto flex items-center gap-0.5">
                        <button onClick={() => splitCue(i)} title="拆成兩句"
                          className="p-1 text-white/40 hover:text-teal-300 rounded"><Scissors size={11} /></button>
                        <button onClick={() => mergeCueDown(i)} disabled={i >= cues.length - 1} title="同下一句合併"
                          className="p-1 text-white/40 hover:text-teal-300 rounded disabled:opacity-25"><Combine size={11} /></button>
                        <button onClick={() => deleteCue(i)} title="刪除呢句"
                          className="p-1 text-white/40 hover:text-red-400 rounded"><Trash2 size={11} /></button>
                      </div>
                    </div>
                    <textarea value={c.text} rows={1}
                      onChange={(e) => updateCueText(i, e.target.value)}
                      onFocus={() => seekTo(c.start + 0.01)}
                      className="w-full bg-black/30 rounded px-2 py-1 text-[12px] text-white leading-snug resize-none outline-none focus:ring-1 focus:ring-teal-400/50" />
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-white/30 mt-1.5">改字即時生效；時間可喺下方時間線拖動微調。</p>
          </div>

          {busy && (
            <div>
              <div className="flex justify-between text-[11px] text-white/50 mb-1"><span>{phase === 'uploading' ? '上載中...' : '渲染中...'}</span><span className="tnum">{progress}%</span></div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-teal-500 transition-all" style={{ width: `${phase === 'uploading' ? 5 : progress}%` }} /></div>
            </div>
          )}
          {phase === 'done' && <div className="p-2 bg-teal-500/15 text-teal-300 text-[11px] rounded flex items-center gap-1"><Check size={12} /> 完成並已下載</div>}
          {error && <div className="p-2 bg-red-500/15 text-red-300 text-[11px] rounded flex items-start gap-1"><AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}</div>}
        </div>
      </div>

      {/* Transport bar */}
      <div className="h-11 shrink-0 border-t border-white/10 flex items-center gap-3 px-4 bg-black/40">
        <button onClick={() => stepCue(-1)} className="text-white/60 hover:text-white p-1" title="上一句"><SkipBack size={16} /></button>
        <button onClick={togglePlay} className="w-8 h-8 rounded-full bg-teal-500 hover:bg-teal-600 text-white flex items-center justify-center">
          {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
        </button>
        <button onClick={() => stepCue(1)} className="text-white/60 hover:text-white p-1" title="下一句"><SkipForward size={16} /></button>
        <span className="font-mono text-xs text-teal-300 tnum">{tc(currentTime)}</span>
        <span className="font-mono text-xs text-white/30 tnum">/ {tc(end)}</span>
        <button onClick={() => clipInputRef.current?.click()}
          className="ml-2 flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-teal-500/20 text-teal-200 hover:bg-teal-500/30" title="加片段 / 相片（可多選）">
          <Upload size={12} /> 加片段
        </button>

        {/* Editing tools (Filmora-style): select / razor / split / delete */}
        <div className="flex items-center gap-0.5 ml-2 border-l border-white/10 pl-2">
          <button onClick={() => setTool('select')} title="選取"
            className={`p-1.5 rounded ${tool === 'select' ? 'bg-teal-500/30 text-teal-200' : 'text-white/50 hover:text-white'}`}><MousePointer2 size={14} /></button>
          <button onClick={() => setTool('razor')} title="分割（撳時間線切一刀）"
            className={`p-1.5 rounded ${tool === 'razor' ? 'bg-teal-500/30 text-teal-200' : 'text-white/50 hover:text-white'}`}><Scissors size={14} /></button>
          <button onClick={() => splitAt(currentTime)} title="喺播放頭分割" className="p-1.5 rounded text-white/50 hover:text-white"><SeparatorVertical size={14} /></button>
          <button onClick={() => { if (selectedSeg != null) { deleteSeg(selectedSeg); setSelectedSeg(null); } }}
            disabled={selectedSeg == null || segments.length <= 1} title="刪除選取片段"
            className="p-1.5 rounded text-white/50 hover:text-red-400 disabled:opacity-30"><Trash2 size={14} /></button>
        </div>
        {isTrimmed && <span className="text-[10px] text-amber-300 ml-1">已剪 {segments.length} 段</span>}
        {activeCue && <span className="text-xs text-white/60 truncate ml-2 hidden xl:inline">{activeCue.text}</span>}

        {/* Timeline horizontal zoom */}
        <div className="ml-auto flex items-center gap-1.5 text-white/50">
          <button onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))} className="p-1 hover:text-white" title="縮短時間線"><Minus size={14} /></button>
          <input type="range" min={1} max={16} step={0.5} value={zoom}
            onChange={(e) => setZoom(+e.target.value)} className="w-24 accent-teal-500" title="時間線縮放" />
          <button onClick={() => setZoom((z) => Math.min(16, +(z + 0.5).toFixed(1)))} className="p-1 hover:text-white" title="拉長時間線"><Plus size={14} /></button>
          <button onClick={() => setZoom(1)} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10" title="適應寬度">{zoom.toFixed(1)}×</button>
        </div>
      </div>

      {/* Drag handle to resize the timeline */}
      <div onMouseDown={resizeTimeline}
        className="h-2 shrink-0 cursor-row-resize bg-white/5 hover:bg-teal-500/30 transition-colors flex items-center justify-center group border-t border-white/10"
        title="拖動調整時間線高度">
        <div className="w-12 h-0.5 rounded-full bg-white/20 group-hover:bg-teal-300" />
      </div>

      {/* TIMELINE: ruler + subtitle track + filmstrip + playhead (scroll + zoom + drop) */}
      <div className={`shrink-0 bg-[#0E1412] overflow-x-auto overflow-y-hidden relative ${dragOver ? 'ring-2 ring-teal-400 ring-inset' : ''}`} style={{ height: timelineHeight }}
        onWheel={onTimelineWheel}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onTimelineDrop}>
        {dragOver && (
          <div className="absolute inset-0 z-30 bg-teal-500/10 flex items-center justify-center pointer-events-none">
            <span className="text-sm text-teal-200 bg-black/60 px-3 py-1.5 rounded-full">放開即加入片段（可多個）</span>
          </div>
        )}
       <div className="h-full relative select-none flex flex-col" style={{ width: `${zoom * 100}%`, minWidth: '100%' }} onClick={onTimelineScrub}>
        {/* Ruler (with AI highlight markers) */}
        <div className="h-5 relative border-b border-white/5">
          {end > 0 && highlights.map((s, i) => (
            <div key={`hl${i}`} title={s.label} className="absolute bottom-0 h-1.5 bg-teal-400 rounded-sm"
              style={{ left: `${(s.start / end) * 100}%`, width: `${Math.max(0.4, ((s.end - s.start) / end) * 100)}%` }} />
          ))}
          {end > 0 && Array.from({ length: Math.min(13, Math.max(2, Math.floor(end / Math.max(1, Math.round(end / 12))) + 1)) }).map((_, i) => {
            const step = end / 12; const t = i * step;
            return <span key={i} className="absolute top-0.5 text-[9px] text-white/30 font-mono -translate-x-1/2" style={{ left: `${(t / end) * 100}%` }}>{tc(t).slice(0, 5)}</span>;
          })}
        </div>

        {/* Subtitle track — blocks are draggable (move) with trim handles */}
        <div ref={trackRef} className="h-9 relative border-b border-white/5 bg-black/20">
          <span className="sticky left-0 z-20 inline-block px-1.5 text-[9px] leading-9 text-white/40 bg-[#0E1412]/90 pointer-events-none">字幕</span>
          {end > 0 && cues.map((c, i) => {
            const left = (c.start / end) * 100, width = Math.max(0.4, ((c.end - c.start) / end) * 100);
            const on = activeIdx === i;
            return (
              <div key={i} title={`${c.text}\n（拖動移位，左右邊緣拉長短）`}
                onMouseDown={(e) => startDrag(e, i, 'move')}
                className={`group absolute top-1 bottom-1 rounded overflow-hidden flex items-center cursor-grab active:cursor-grabbing transition-colors ${on ? 'bg-teal-400 text-[#0B0F0D]' : 'bg-teal-500/35 hover:bg-teal-500/55 text-teal-50'}`}
                style={{ left: `${left}%`, width: `${width}%` }}>
                {/* left trim handle */}
                <div onMouseDown={(e) => startDrag(e, i, 'l')} className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/0 group-hover:bg-white/40" />
                <span className="text-[9px] leading-none truncate px-1.5 pointer-events-none">{c.text}</span>
                {/* right trim handle */}
                <div onMouseDown={(e) => startDrag(e, i, 'r')} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/0 group-hover:bg-white/40" />
              </div>
            );
          })}
        </div>

        {/* Overlay layer tracks */}
        {overlays.map((o, idx) => {
          const ow = o.end && o.end > 0 ? o.end : end;
          const left = end > 0 ? (Math.max(0, o.start || 0) / end) * 100 : 0;
          const width = end > 0 ? Math.max(1, ((Math.min(ow, end) - (o.start || 0)) / end) * 100) : 0;
          return (
            <div key={o.id} className="h-6 relative border-b border-white/5 bg-black/10 shrink-0">
              <span className="sticky left-0 z-20 inline-block px-1.5 text-[9px] leading-6 text-white/40 bg-[#0E1412]/90">圖層{idx + 1}</span>
              <div className="absolute top-1 bottom-1 rounded bg-fuchsia-500/40 border border-fuchsia-400/40 overflow-hidden flex items-center"
                style={{ left: `${left}%`, width: `${width}%` }} title={o.file.name}>
                <span className="text-[8px] text-white/80 px-1 truncate">{o.type === 'video' ? '🎬' : '🖼'} {o.file.name}</span>
              </div>
            </div>
          );
        })}

        {/* Voiceover track */}
        {voiceover && (
          <div className="h-6 relative border-b border-white/5 bg-black/10 shrink-0">
            <span className="sticky left-0 z-20 inline-block px-1.5 text-[9px] leading-6 text-white/40 bg-[#0E1412]/90">旁白</span>
            <div className="absolute top-1 bottom-1 left-0 right-0 rounded bg-teal-500/25 border border-teal-400/30 flex items-center">
              <span className="text-[8px] text-white/80 px-1 truncate sticky left-12">🎙 {voiceover.name}{muteOriginal ? '（原聲靜音）' : ''}</span>
            </div>
          </div>
        )}

        {/* Background-music track */}
        {bgm && (
          <div className="h-6 relative border-b border-white/5 bg-black/10 shrink-0">
            <span className="sticky left-0 z-20 inline-block px-1.5 text-[9px] leading-6 text-white/40 bg-[#0E1412]/90">音樂</span>
            <div className="absolute top-1 bottom-1 left-0 right-0 rounded bg-purple-500/25 border border-purple-400/30 flex items-center">
              <span className="text-[8px] text-white/80 px-1 truncate sticky left-12">🎵 {bgm.name}</span>
            </div>
          </div>
        )}

        {/* Video track: main filmstrip (trimmable) + appended clips (grows) */}
        <div className="flex-1 min-h-0 flex overflow-hidden bg-black/40">
          <span className="sticky left-0 z-30 px-1.5 py-0.5 self-start text-[9px] text-white/40 bg-[#0E1412]/90">影片</span>
          {/* Main video strip: filmstrip + kept segments + razor */}
          <div ref={mainStripRef} className={`relative flex-1 flex min-w-0 ${tool === 'razor' ? 'cursor-crosshair' : ''}`} onClick={onVideoTrackClick}>
            {thumbs.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-[11px] text-white/30 gap-2">
                {videoUrl ? (thumbBusy ? <><Loader2 size={12} className="animate-spin" /> 產生縮圖中…</> : '載入影片縮圖…') : '選擇影片後顯示時間線'}
              </div>
            ) : thumbs.map((th, i) => (
              <div key={i} className="flex-1 h-full bg-cover bg-center border-r border-black/40 pointer-events-none" style={{ backgroundImage: `url(${th.url})` }} />
            ))}
            {videoUrl && duration > 0 && (() => {
              // Dark overlays for the removed gaps between kept segments.
              const gaps: { a: number; b: number }[] = [];
              let cur = 0;
              const sorted = [...segments].sort((x, y) => x.in - y.in);
              for (const s of sorted) { if (s.in > cur + 0.01) gaps.push({ a: cur, b: s.in }); cur = Math.max(cur, s.out); }
              if (cur < duration - 0.01) gaps.push({ a: cur, b: duration });
              return (
                <>
                  {gaps.map((g, i) => (
                    <div key={`g${i}`} className="absolute inset-y-0 z-10 bg-black/72 pointer-events-none" style={{ left: `${(g.a / duration) * 100}%`, width: `${((g.b - g.a) / duration) * 100}%` }} />
                  ))}
                  {segments.map((s, i) => {
                    const left = (s.in / duration) * 100, width = ((s.out - s.in) / duration) * 100;
                    const sel = selectedSeg === i;
                    return (
                      <div key={i} className={`absolute inset-y-0 z-10 group rounded-sm ${sel ? 'ring-2 ring-teal-300' : 'ring-1 ring-white/25'}`}
                        style={{ left: `${left}%`, width: `${width}%` }}>
                        <div onMouseDown={(e) => startSegTrim(e, i, 'in')} className="absolute left-0 inset-y-0 w-2 z-20 bg-teal-400/0 group-hover:bg-teal-400 cursor-ew-resize" />
                        <div onMouseDown={(e) => startSegTrim(e, i, 'out')} className="absolute right-0 inset-y-0 w-2 z-20 bg-teal-400/0 group-hover:bg-teal-400 cursor-ew-resize" />
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </div>
          {/* Appended clips */}
          {extraClips.map((c) => (
            <div key={c.id} className="shrink-0 w-16 h-full bg-cover bg-center border-l-2 border-teal-400 relative"
              style={c.thumb ? { backgroundImage: `url(${c.thumb})` } : undefined} title={`附加：${c.name}`}>
              <span className="absolute bottom-0 left-0 bg-black/60 text-[7px] text-white/80 px-0.5">＋{Math.round(c.duration)}s</span>
            </div>
          ))}
        </div>

        {/* Playhead */}
        {end > 0 && (
          <div className="absolute top-5 bottom-0 w-px bg-white pointer-events-none z-10" style={{ left: `${(currentTime / end) * 100}%` }}>
            <div className="absolute -top-0 -left-[5px] w-[11px] h-[11px] rounded-full bg-white shadow" />
          </div>
        )}
       </div>
      </div>
    </div>
  );
};

export default SubtitleStudio;
