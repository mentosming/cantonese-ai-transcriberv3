import React, { useState } from 'react';
import { Link2, Loader2, Youtube } from 'lucide-react';

interface LinkTranscribeProps {
  onTranscribe: (url: string) => void;
  busy: boolean;
  disabled?: boolean;
}

/**
 * Paste a YouTube / media link → transcribe it directly via Gemini (Google
 * processes the video server-side, no download — avoids IP blocking).
 */
const LinkTranscribe: React.FC<LinkTranscribeProps> = ({ onTranscribe, busy, disabled }) => {
  const [url, setUrl] = useState('');
  const valid = /^https?:\/\/.+/i.test(url.trim());

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
      <div className="flex items-center gap-2 mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
        <Youtube size={16} className="text-red-500" /> 連結直接轉錄
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && valid && !busy) onTranscribe(url.trim()); }}
            placeholder="貼上 YouTube / 影片連結"
            disabled={busy || disabled}
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-teal-400"
          />
        </div>
        <button
          onClick={() => onTranscribe(url.trim())}
          disabled={!valid || busy || disabled}
          className="px-3 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-40"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : '轉錄'}
        </button>
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">直接交畀 AI 處理連結，唔使下載，公開影片即可。</p>
    </div>
  );
};

export default LinkTranscribe;
