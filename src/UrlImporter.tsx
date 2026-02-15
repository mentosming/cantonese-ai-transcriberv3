
import React, { useState } from 'react';
import { Link2, Download, Loader2, AlertCircle, CheckCircle2, Globe, ExternalLink, ArrowRight, HelpCircle } from 'lucide-react';
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
    
    if (!url.match(/^(http|https):\/\//)) {
        setError("請輸入有效的網址 (需包含 http:// 或 https://)");
        return;
    }

    setIsProcessing(true);
    setError(null);
    setManualDownloadUrl(null);
    setStatus('正在連線至 Cobalt 伺服器解析連結...');

    try {
      // 1. Resolve URL using Cobalt
      // Cobalt is generally more stable for direct links than Piped raw streams
      const response = await fetch("https://api.cobalt.tools/api/json", {
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

      if (!response.ok) throw new Error(`解析服務連線失敗: ${response.status}`);
      const data = await response.json();
      
      if (data.status === 'error') throw new Error(data.text || "無法解析此連結");
      if (!data.url) throw new Error("伺服器未返回下載連結");

      const targetUrl = data.url;
      setManualDownloadUrl(targetUrl);
      setStatus('解析成功，正在嘗試下載音訊...');
      
      let blob: Blob | null = null;

      // 2. Try Direct Download (Fastest, works if source has CORS enabled)
      try {
          const directRes = await fetch(targetUrl);
          if (directRes.ok) {
              blob = await directRes.blob();
          }
      } catch (e) {
          console.log("Direct download failed (CORS), trying proxy...");
      }

      // 3. If Direct fails, use corsproxy.io (Public Proxy, No 10s Limit)
      if (!blob) {
          try {
              setStatus('正在透過公共代理通道下載 (這可能需要幾秒鐘)...');
              // Using corsproxy.io to bypass CORS headers
              const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
              const proxyRes = await fetch(proxyUrl);
              
              if (!proxyRes.ok) throw new Error("代理下載失敗");
              blob = await proxyRes.blob();
          } catch (proxyErr) {
               console.error("Proxy failed", proxyErr);
               // 4. If Public Proxy fails, try our local fallback (Vercel)
               // Note: This often fails for large files > 10s download time
               try {
                   setStatus('嘗試備用線路...');
                   const localProxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
                   const localRes = await fetch(localProxyUrl);
                   if (!localRes.ok) throw new Error("備用線路失敗");
                   blob = await localRes.blob();
               } catch (localErr) {
                   throw new Error("CORS_BLOCK"); // Trigger manual download
               }
          }
      }

      if (!blob) throw new Error("無法獲取檔案內容");
      
      // Determine Filename
      let filename = "downloaded_audio.mp3";
      if (url.includes('youtube') || url.includes('youtu.be')) filename = `yt_${Date.now()}.mp3`;
      else if (url.includes('facebook')) filename = `fb_${Date.now()}.mp3`;
      else if (url.includes('instagram')) filename = `ig_${Date.now()}.mp3`;
      else if (url.includes('tiktok')) filename = `tiktok_${Date.now()}.mp3`;

      const file = new File([blob], filename, { type: 'audio/mpeg' });
      
      setStatus('完成！');
      onFileSelect(file);
      setUrl(''); 
      setManualDownloadUrl(null);
      
      setTimeout(() => setStatus(''), 3000);

    } catch (err: any) {
      console.error(err);
      if (err.message === 'CORS_BLOCK' || err.message.includes('Failed to fetch')) {
          setError("瀏覽器安全性攔截了自動下載。");
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
        <span className="px-1.5 py-0.5 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 text-[10px] rounded-full font-bold">V2.0</span>
      </div>
      
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        支援 YouTube, Facebook, Instagram, TikTok。系統將自動嘗試多種代理方式提取音訊。
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
            {isProcessing ? '正在處理...' : '提取並下載'}
        </Button>

        {/* Status / Error Messages */}
        {(status || error) && (
          <div className={`p-3 rounded-lg text-xs flex flex-col gap-2 ${error ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300 border border-red-100 dark:border-red-800' : 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-300 border border-green-100 dark:border-green-800'}`}>
            <div className="flex items-start gap-2">
                {error ? <AlertCircle size={14} className="shrink-0 mt-0.5"/> : (status === '完成！' ? <CheckCircle2 size={14} className="shrink-0 mt-0.5"/> : <Loader2 size={14} className="shrink-0 mt-0.5 animate-spin"/>)}
                <div className="flex-1 break-all font-medium">
                    {error || status}
                </div>
            </div>
          </div>
        )}

        {/* Manual Download Fallback - Always show if we have a URL but error happened */}
        {manualDownloadUrl && error && (
            <div className="mt-1 pt-3 border-t border-slate-100 dark:border-slate-700 animate-pulse">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                    <HelpCircle size={12}/> 自動下載失敗？請嘗試手動方式：
                </p>
                <a 
                    href={manualDownloadUrl} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-xs font-bold shadow-md"
                >
                    <ExternalLink size={14} />
                    1. 點擊下載音訊檔案 (新分頁)
                </a>
                <p className="text-[10px] text-center text-slate-400 mt-2">
                    2. 下載完成後，將檔案拖入上方的「上載影音」框即可。
                </p>
            </div>
        )}
        
        <div className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-1">
            * 服務由 Cobalt & corsproxy.io 提供
        </div>
      </div>
    </div>
  );
};

export default UrlImporter;
