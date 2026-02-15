
import React, { useState } from 'react';
import { Link2, Download, Loader2, AlertCircle, CheckCircle2, Youtube, ExternalLink, RefreshCw } from 'lucide-react';
import Button from './Button';

interface UrlImporterProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

// List of reliable Piped instances (Round-robin to avoid rate limits)
const PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.privacy.com.de",
    "https://pipedapi.drgns.space",
    "https://pipedapi.moomoo.me",
    "https://pipedapi.smnz.de"
];

const UrlImporter: React.FC<UrlImporterProps> = ({ onFileSelect, disabled }) => {
  const [url, setUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [manualDownloadUrl, setManualDownloadUrl] = useState<string | null>(null);

  // Helper: Extract YouTube ID
  const getYouTubeID = (url: string) => {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : false;
  };

  const fetchWithPiped = async (videoId: string): Promise<{ url: string, filename: string }> => {
    let lastError: any;

    // Try instances sequentially until one works
    for (const instance of PIPED_INSTANCES) {
        try {
            console.log(`Trying Piped Instance: ${instance}`);
            const res = await fetch(`${instance}/streams/${videoId}`);
            if (!res.ok) continue;
            
            const data = await res.json();
            
            // 1. Get Audio Streams
            const audioStreams = data.audioStreams;
            if (!audioStreams || audioStreams.length === 0) {
                throw new Error("No audio streams found");
            }

            // 2. Sort by bitrate (highest first) and prefer m4a/mp4 for compatibility
            audioStreams.sort((a: any, b: any) => b.bitrate - a.bitrate);
            
            // 3. Pick the best one
            const targetStream = audioStreams[0];
            
            return {
                url: targetStream.url,
                filename: `${data.title || 'audio'}.m4a` // Piped usually gives m4a
            };

        } catch (err) {
            console.warn(`Instance ${instance} failed:`, err);
            lastError = err;
        }
    }
    throw lastError || new Error("All Piped instances failed");
  };

  const handleImport = async () => {
    if (!url) return;
    
    if (!url.match(/^(http|https):\/\//)) {
        setError("請輸入有效的網址 (需包含 http:// 或 https://)");
        return;
    }

    setIsProcessing(true);
    setError(null);
    setManualDownloadUrl(null);
    setStatus('正在分析連結...');

    try {
      const ytId = getYouTubeID(url);
      let downloadUrl = '';
      let filename = `import_${Date.now()}.mp3`;

      if (ytId) {
          // --- STRATEGY A: Piped API (Best for YouTube) ---
          setStatus('偵測到 YouTube，正在切換至 Piped 線路...');
          const result = await fetchWithPiped(ytId);
          downloadUrl = result.url;
          
          // Sanitize filename
          filename = result.filename.replace(/[<>:"/\\|?*]+/g, '_');
          if (!filename.endsWith('.m4a') && !filename.endsWith('.mp3') && !filename.endsWith('.webm')) {
              filename += '.m4a';
          }

      } else {
          // --- STRATEGY B: Cobalt API (For FB/IG/TikTok) ---
          setStatus('正在連線至 Cobalt (適用於非 YouTube)...');
          const cobaltRes = await fetch("https://api.cobalt.tools/api/json", {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url, isAudioOnly: true })
          });
          
          const cobaltData = await cobaltRes.json();
          if (!cobaltRes.ok || cobaltData.status === 'error') {
             throw new Error("此連結不支援或伺服器忙碌。");
          }
          downloadUrl = cobaltData.url;
      }

      setManualDownloadUrl(downloadUrl);
      setStatus('正在透過安全通道下載...');

      // --- FINAL DOWNLOAD: Use Local Streaming Proxy ---
      // Direct fetch will fail due to CORS on googlevideo links
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(downloadUrl)}`;
      
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error("代理下載失敗 (Vercel Network Error)");
      
      const blob = await response.blob();
      if (blob.size < 1000) throw new Error("下載的檔案太小，可能已損壞");

      const file = new File([blob], filename, { type: blob.type || 'audio/mp4' });
      
      setStatus('完成！');
      onFileSelect(file);
      setUrl('');
      setManualDownloadUrl(null);
      
      setTimeout(() => setStatus(''), 3000);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "匯入失敗，請檢查連結是否有效。");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors animate-fade-in">
      <div className="flex items-center gap-2 mb-3 text-red-600 dark:text-red-400">
        <Youtube size={20} />
        <h3 className="font-semibold">YouTube / 網頁匯入</h3>
        <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[10px] rounded-full font-bold">Piped API</span>
      </div>
      
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
        使用 Piped 開源節點提取音訊，並透過串流代理 (Streaming Proxy) 下載。穩定性更高。
      </p>

      <div className="flex flex-col gap-3">
        <div className="relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Link2 size={16} />
             </div>
             <input 
                type="text" 
                placeholder="貼上 YouTube 連結 (推薦)" 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isProcessing || disabled}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-slate-900 dark:text-slate-100 placeholder-slate-400"
             />
        </div>

        <Button 
            onClick={handleImport} 
            disabled={!url || isProcessing || disabled}
            className="w-full text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200"
            variant="secondary"
        >
            {isProcessing ? <Loader2 className="animate-spin" size={16}/> : <Download size={16} />}
            {isProcessing ? '分析並下載' : '提取音訊'}
        </Button>

        {/* Message Panel */}
        {(status || error) && (
          <div className={`p-3 rounded-lg text-xs flex flex-col gap-2 ${error ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300 border border-red-100 dark:border-red-800/50' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-100 dark:border-blue-800/50'}`}>
            <div className="flex items-start gap-2">
                {error ? <AlertCircle size={14} className="shrink-0 mt-0.5"/> : <Loader2 size={14} className="shrink-0 mt-0.5 animate-spin"/>}
                <div className="flex-1 font-medium">{error || status}</div>
            </div>
            
            {manualDownloadUrl && (
                <div className="mt-2 pt-2 border-t border-current/10 space-y-2">
                    <p className="opacity-80 flex items-center gap-1">如果下載進度卡住，請手動下載：</p>
                    <a 
                        href={manualDownloadUrl} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="flex items-center justify-center gap-2 w-full py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg transition-all font-bold shadow-sm"
                    >
                        <ExternalLink size={14} /> 開啟原始音檔連結
                    </a>
                </div>
            )}
          </div>
        )}
        
        <div className="text-[10px] text-slate-400 dark:text-slate-500 flex justify-between px-1">
            <span>Method: Stream Pipeline</span>
            <span className="flex items-center gap-1"><RefreshCw size={8}/> Auto-Rotate</span>
        </div>
      </div>
    </div>
  );
};

export default UrlImporter;
