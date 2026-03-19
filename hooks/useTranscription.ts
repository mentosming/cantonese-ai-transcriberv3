import { useState, useRef } from 'react';
import { TranscriptionSettings, ProcessingStatus, TranscriptionError } from '../types';
import { transcribeMedia } from '../services/geminiService';
import { MAX_FILE_SIZE_INLINE } from '../constants';

export const useTranscription = (isPro: boolean) => {
  const hasApiKey = !!process.env.API_KEY;

  const [file, setFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<number>(0);
  const [transcription, setTranscription] = useState('');
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [error, setError] = useState<TranscriptionError | null>(null);

  const [settings, setSettings] = useState<TranscriptionSettings>({
    model: 'gemini-3-flash-preview',
    language: ['yue'],
    enableDiarization: true,
    enableTimestamps: true,
    speakers: [],
    startTime: "00:00",
    customPrompt: ""
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleFileSelect = (selectedFile: File, estimatedStartTime?: string) => {
    setFile(selectedFile);
    setFileDuration(0);
    setStatus('idle');
    setError(null);

    if (estimatedStartTime) {
      setSettings(prev => ({ ...prev, startTime: estimatedStartTime }));
    } else {
      setSettings(prev => ({ ...prev, startTime: "00:00" }));
    }
  };

  const handleClearFile = () => {
    if (status === 'transcribing' || status === 'uploading') return;
    setFile(null);
    setStatus('idle');
    setSettings(prev => ({ ...prev, startTime: "00:00" }));
  };

  const handleClearTranscription = () => {
    if (window.confirm("確定要清空所有轉錄內容嗎？")) {
      setTranscription('');
    }
  };

  const handleUpdateTranscription = (newText: string) => {
    setTranscription(newText);
  };

  const handleStart = async () => {
    if (!hasApiKey) {
      alert("錯誤：未檢測到 API Key。請先在 Vercel 設定環境變數。");
      return;
    }
    if (!file) return;

    // 10-minute system limit
    if (fileDuration > 600) {
      const msg = `檔案過長警告：系統偵測到檔案長度超過 10 分鐘 (${(fileDuration/60).toFixed(1)} 分鐘)。\n\n為確保轉錄品質及防止 AI 逾時錯誤，請先使用「輔助工具」中的「長檔案分割」功能，將檔案分割為數個 10 分鐘內的片段再進行轉錄。`;
      alert(msg);
      setError({ type: 'limit', message: msg });

      setTimeout(() => {
        const splitter = document.getElementById('file-splitter-section');
        if (splitter) {
          splitter.scrollIntoView({ behavior: 'smooth', block: 'center' });
          splitter.classList.add('ring-2', 'ring-amber-500', 'ring-offset-2');
          setTimeout(() => splitter.classList.remove('ring-2', 'ring-amber-500', 'ring-offset-2'), 3000);
        }
      }, 100);
      return;
    }

    // Pro limit check (7 min for free)
    if (!isPro) {
      setStatus('idle');
      if (fileDuration > 420) {
        setError({
          type: 'limit',
          message: `限制提示：免費版僅支援最長 7 分鐘的影音轉錄。檢測到長度約為 ${(fileDuration/60).toFixed(1)} 分鐘。請使用分割工具(需 Pro)或剪輯後再試。`
        });
        return;
      }
    }

    setStatus(file.size > MAX_FILE_SIZE_INLINE ? 'uploading' : 'transcribing');
    setError(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const hasOffset = settings.startTime && settings.startTime !== "00:00" && settings.startTime !== "0:00";
    const isAppend = transcription.length > 0;

    if (isAppend || hasOffset) {
      setTranscription(prev => prev + `\n\n--- [接續檔案: ${file.name} | Start: ${settings.startTime}] ---\n\n`);
    }

    try {
      await transcribeMedia(
        file,
        settings,
        (chunkText) => {
          setStatus('transcribing');
          setTranscription(prev => prev + chunkText);
        },
        abortController.signal
      );
      setStatus('completed');
    } catch (err: any) {
      if (err.message === 'Transcription stopped by user.') {
        setStatus('stopped');
      } else {
        setStatus('error');
        setError(err);
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return {
    hasApiKey,
    file, fileDuration, setFileDuration,
    transcription, status, error,
    settings, setSettings,
    handleFileSelect, handleClearFile,
    handleClearTranscription, handleUpdateTranscription,
    handleStart, handleStop,
  };
};
