
import React, { useState } from 'react';
import { Link2, Download, Loader2, AlertCircle, Globe, ExternalLink, ArrowRight, Video, Music, RefreshCw } from 'lucide-react';
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
  const [manualData, setManualData] = useState<{url: string, filename: string} | null>(null);

  // List of Cobalt instances to try in order
  const API_INSTANCES = [
    "https://api.cobalt.tools/api/json", // Official
    "https://cobalt.api.wuk.sh/api/json", // Backup 1
    "https://api.wuk.sh/api/json"         // Backup 2
  ];

  const fetchWithFallback = async (targetUrl: string, body: any, attempt = 0): Promise<any> => {
      if (attempt >= API_INSTANCES.length) {
          throw new Error("所有解析伺服器皆無回應，請稍後再試。");
      }

      const apiEndpoint = API_INSTANCES[attempt];
      try {
          if (attempt > 0) setStatus(`主伺服器忙碌，嘗試備用線路 ${attempt}...`);
          
          const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
          });

          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return await response.json();
      } catch (e) {
          console.warn(`Attempt ${attempt + 1} failed on ${apiEndpoint}`, e);
          return fetchWithFallback(targetUrl, body, attempt + 1);
      }
  };

  const handleImport = async (useVideoMode: boolean = false) => {
    if (!url) return;
    
    if (!url.match(/^(http|https):\/\//)) {
        setError("請輸入正確網址");
        return;
    }

    setIsProcessing(true);
    setError(null);
    setManualData(null);
    setStatus(useVideoMode ? '解析中 (影片模式)...' : '正在解析連結...');

    try {
      // 1. Cobalt API Request with Fallback
      const data = await fetchWithFallback(url, {
          url: url,
          vQuality: "720",
          aFormat: "mp3",
          isAudioOnly: !useVideoMode, 
          filenameStyle: "pretty"
      });
      
      if (data.status === 'error') {
          if (!useVideoMode) {
              console.log("Audio mode failed, retrying with video mode...");
              return handleImport(true);
          }
          throw new Error(data.text || "連結無法解析 (不支援或受限內容)");
      }

      if (!data.url) throw new Error("解析成功但未返回下載連結");

      const targetUrl = data.url;
      const filename = data.filename || `media_${Date.now()}.${useVideoMode ? 'mp4' : 'mp3'}`;
      
      // CRITICAL: Save manual data immediately
      setManualData({ url: targetUrl, filename });
      setStatus('連結已取得，正在下載...');

      // 2. Download Strategy
      let blob: Blob | null = null;
      
      try {
          // A. Local Proxy (Deploy only)
          const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
          const res = await fetch(proxyUrl);
          const contentType = res.headers.get('content-type');
          if (res.ok && contentType && !contentType.includes('text/html')) {
              blob = await res.blob();
          } else {
             // B. Public Proxy
             const publicProxyRes = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);
             if (publicProxyRes.ok) blob = await publicProxyRes.blob();
          }
      } catch (e) { 
          console.warn("Auto download failed, triggering manual mode"); 
      }

      if (!blob) {
          throw new Error("AUTO_DOWNLOAD_FAILED");
      }

      const file = new File([blob], filename, { type: blob.type || (useVideoMode ? 'video/mp4' : 'audio/mpeg') });
      
      setStatus('成功匯入！');
      onFileSelect(file);
      setUrl('');
      setManualData(null);
      setTimeout(() => setStatus(''), 3000);

    } catch (err: any) {
      console.error(err);
      
      // Customize error messages
      if (err.message === 'AUTO_DOWNLOAD_FAILED' || err.message.includes('fetch')) {
          setError("自動下載受阻 (CORS)。請使用下方按鈕手動下載。");
      } else {
          setError(err.message || "發生未知錯誤");
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
        <span className="px-2 py-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[10px] rounded-full font-bold shadow-sm">V3.5 (Stable)</span>
      </div>
      
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
        支援 YouTube/FB/IG。系統會自動切換線路嘗試解析。如自動載入失敗，將提供下載連結。
      </p>

      <div className="flex flex-col gap-3">
        <div className="relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Link2 size={16} />
             </div>
             <input 
                type="text" 
                placeholder="貼上影片連結 (例如: https://youtu.be/...)" 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isProcessing || disabled}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none text-slate-900 dark:text-slate-100 placeholder-slate-400"
             />
        </div>

        <div className="flex gap-2">
            <Button 
                onClick={() => handleImport(false)} 
                disabled={!url || isProcessing || disabled}
                className="flex-1 text-xs dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200"
                variant="secondary"
            >
                {isProcessing ? <Loader2 className="animate-spin" size={14}/> : <Music size={14} />}
                {isProcessing ? '解析中...' : '音訊模式'}
            </Button>
             <Button 
                onClick={() => handleImport(true)} 
                disabled={!url || isProcessing || disabled}
                className="flex-1 text-xs dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200"
                variant="secondary"
                title="當音訊模式失敗時使用"
            >
                <Video size={14} /> 影片模式
            </Button>
        </div>

        {/* Status Display */}
        {status && !error && (
            <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg animate-pulse">
                <Loader2 size={14} className="animate-spin"/>
                {status}
            </div>
        )}

        {/* Error & Manual Download UI */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg animate-fade-in">
            <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-300 mb-3 font-medium">
                <AlertCircle size={14} className="shrink-0 mt-0.5"/>
                <span>{error}</span>
            </div>
            
            {manualData ? (
                <div className="space-y-2 pt-2 border-t border-red-100 dark:border-red-800">
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">手動下載 (100% 成功)：</p>
                    <a 
                        href={manualData.url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center justify-between gap-2 w-full p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-md group"
                    >
                        <span className="text-xs font-bold flex items-center gap-2">
                            <ExternalLink size={14}/> 1. 點擊下載檔案
                        </span>
                        <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform"/>
                    </a>
                    <p className="text-[10px] text-slate-400 leading-tight">
                        2. 下載後，請將檔案<strong>拖入上方</strong>「上載影音」框內。
                    </p>
                </div>
            ) : (
                <div className="pt-2 border-t border-red-100 dark:border-red-800">
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        提示：若持續失敗，可能是該影片有地區限制或版權保護，建議您自行下載檔案後再上傳。
                    </p>
                </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default UrlImporter;
