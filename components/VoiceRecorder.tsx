import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

interface VoiceRecorderProps {
  // Emits a ready-to-transcribe audio File when the user stops recording.
  onRecordingComplete: (file: File) => void;
  disabled?: boolean;
}

// Browser-native microphone recorder (MediaRecorder + getUserMedia). Works in
// the web app and inside the iOS/Android Capacitor webview — no native plugin.
const VoiceRecorderComponent: React.FC<VoiceRecorderProps> = ({ onRecordingComplete, disabled }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const pickMime = () => {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    return types.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
  };

  const start = async () => {
    setErr('');
    if (!supported) { setErr('此瀏覽器不支援錄音'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const type = rec.mimeType || 'audio/webm';
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(chunksRef.current, { type });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setBusy(false);
        if (blob.size) onRecordingComplete(new File([blob], `錄音_${Date.now()}.${ext}`, { type }));
      };
      recorderRef.current = rec;
      rec.start();
      setIsRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e: any) {
      setErr(e?.name === 'NotAllowedError' ? '請允許使用麥克風' : '無法開始錄音');
    }
  };

  const stop = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsRecording(false);
    setBusy(true);
    recorderRef.current?.stop();
  };

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  if (!supported) return null;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
      {!isRecording ? (
        <button onClick={start} disabled={disabled || busy}
          className="w-11 h-11 shrink-0 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow active:scale-95 transition disabled:opacity-40">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Mic size={20} />}
        </button>
      ) : (
        <button onClick={stop}
          className="w-11 h-11 shrink-0 rounded-full bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-800 flex items-center justify-center shadow active:scale-95 transition">
          <Square size={16} fill="currentColor" />
        </button>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {isRecording && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {busy ? '處理中…' : isRecording ? '錄音中' : '麥克風錄音'}
          </span>
          {(isRecording || seconds > 0) && <span className="font-mono text-sm text-slate-500 dark:text-slate-400 tnum">{fmt(seconds)}</span>}
        </div>
        <p className="text-xs text-slate-400 truncate">{err || (isRecording ? '撳停止即開始轉錄' : '直接錄音轉文字 / 字幕')}</p>
      </div>
    </div>
  );
};

export default VoiceRecorderComponent;
