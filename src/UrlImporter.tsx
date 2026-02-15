
import React, { useState } from 'react';
import { Link2, Download, Loader2, AlertCircle, CheckCircle2, Globe, ExternalLink } from 'lucide-react';
import Button from './Button';

interface UrlImporterProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

const UrlImporter: React.FC<UrlImporterProps> = ({ onFileSelect, disabled }) => {
  const [url, setUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [manualDownloadUrl, setManualDownloadUrl] = useState<string | null>(null);

  const handleImport = async () => {
    if (!url) return;
    
    // Basic validation
    if (!url.match(/^(http|https):\/\//)) {
        setError("請輸入有效的網址 (需包含 http:// 或 https://)");
        return;
    }

    setIsProcessing(true);
    setError(null);
    setManualDownloadUrl(null);
    setStatus('正在連線至媒體伺服器...');

    try {
      // Use Cobalt API (Public Instance) for extraction
      const apiEndpoint = "https://api.cobalt.tools/api/json";
      
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: url,
          vCodec: "h264",
          vQuality: "720",
          aFormat: "mp3",
          isAudioOnly: true
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'error') {
          throw new Error(data.text || "無法解析此連結");
      }

      if (!data.url) {
          throw new Error("伺服器未返回下載連結");
      }

      // Store URL for fallback
      setManualDownloadUrl(data.url);
      setStatus('正在下載音訊檔案...');
      
      let blob: Blob;

      try {
          // Strategy 1: Direct Download
          // Some CDNs might allow CORS, try direct first
          const directRes = await fetch(data.url);
          if (directRes.ok) {
              blob = await directRes.blob();
          } else {
              throw new Error("Direct fetch failed");
          }
      } catch (directErr) {
          console.warn("直接下載失敗 (CORS)，嘗試使用 Proxy...", directErr);
          setStatus('正在嘗試繞過 CORS 限制...');
          
          // Strategy 2: CORS Proxy
          // Use a public CORS proxy to bypass the browser restriction
          try {
              const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(data.url)}`;
              const proxyRes = await fetch(proxyUrl);
              if (!proxyRes.ok) throw new Error("Proxy fetch failed");
              blob = await proxyRes.blob();
          } catch (proxyErr) {
              console.error("Proxy failed", proxyErr);
              throw new Error("CORS_BLOCK"); // Special error code to trigger manual download UI
          }
      }
      
      // Generate filename
      let filename = "network_audio.mp3";
      if (url.includes('youtube') || url.includes('youtu.be')) filename = `yt_${Date.now()}.mp3`;
      else if (url.includes('facebook') || url.includes('fb.watch')) filename = `fb_${Date.now()}.mp3`;
      else if (url.includes('instagram')) filename = `ig_${Date.now()}.mp3`;
      else if (url.includes('tiktok')) filename = `tiktok_${Date.now()}.mp3`;
      
      const file = new File([blob], filename, { type: 'audio/mpeg' });
      
      setStatus('完成！');
      onFileSelect(file);
      setUrl(''); 
      setManualDownloadUrl(null); // Clear fallback on success
      
      setTimeout(() => setStatus(''), 3000);

    } catch (err: any) {
      console.error(err);
      if (err.message === 'CORS_BLOCK') {
          setError("瀏覽器攔截了自動下載。請點擊下方的按鈕手動下載檔案，然後拖入上方的「上載影音」框中。");
      } else {
          let msg = err.message || "發生未知錯誤";
          if (msg.includes('Failed to fetch')) msg = "網絡連線失敗或被攔截。";
          setError(msg);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors animate-fade-in">
      <div className="flex items-center gap-2 mb-3 text-pink-600 dark:text-pink-400">
        <Globe size={20} />
        <h3 className="font-semibold">網絡連結匯入</h3>
        <span className="px-1.5 py-0.5 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 text-[10px] rounded-full font-bold">NEW</span>
      </div>
      
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        貼上 YouTube, Facebook, Instagram 或 TikTok 連結，系統將嘗試提取音訊並直接載入。
      </p>

      <div className="flex flex-col gap-3">
        <div className="relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Link2 size={16} />
             </div>
             <input 
                type="text" 
                placeholder="貼上影片網址 (e.g., https://youtu.be/...)" 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isProcessing || disabled}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none text-slate-900 dark:text-slate-100 placeholder-slate-400"
             />
        </div>

        <Button 
            onClick={handleImport} 
            disabled={!url || isProcessing || disabled}
            className="w-full text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200"
            variant="secondary"
        >
            {isProcessing ? <Loader2 className="animate-spin" size={16}/> : <Download size={16} />}
            {isProcessing ? '正在處理雲端檔案...' : '提取音訊'}
        </Button>

        {/* Status / Error Messages */}
        {(status || error) && (
          <div className={`p-2 rounded-lg text-xs flex items-start gap-2 ${error ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300' : 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-300'}`}>
            {error ? <AlertCircle size={14} className="shrink-0 mt-0.5"/> : (status === '完成！' ? <CheckCircle2 size={14} className="shrink-0 mt-0.5"/> : <Loader2 size={14} className="shrink-0 mt-0.5 animate-spin"/>)}
            <div className="flex-1 break-all">
                {error || status}
            </div>
          </div>
        )}

        {/* Manual Download Fallback Button */}
        {manualDownloadUrl && error && (
            <a 
                href={manualDownloadUrl} 
                target="_blank" 
                rel="noreferrer" 
                className="flex items-center justify-center gap-2 w-full py-2 bg-pink-50 hover:bg-pink-100 dark:bg-pink-900/20 dark:hover:bg-pink-900/40 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800 rounded-lg transition-colors text-xs font-bold animate-pulse"
            >
                <ExternalLink size={14} />
                無法自動載入？點擊此處手動下載 MP3
            </a>
        )}
        
        <div className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-1">
            * 支援服務由 Cobalt API 提供。若自動下載失敗，請使用上方按鈕手動下載。
        </div>
      </div>
    </div>
  );
};

export default UrlImporter;
