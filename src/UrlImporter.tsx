
import React, { useState } from 'react';
import { Link2, Download, Loader2, AlertCircle, CheckCircle2, Globe, ExternalLink, HelpCircle } from 'lucide-react';
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
      // Step 1: Resolve link via Cobalt
      const apiEndpoint = "https://api.cobalt.tools/api/json";
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: url,
          aFormat: "mp3",
          isAudioOnly: true
        })
      });

      if (!response.ok) throw new Error(`解析失敗: ${response.status}`);
      const data = await response.json();
      if (data.status === 'error') throw new Error(data.text || "解析錯誤");
      if (!data.url) throw new Error("解析成功但未獲得下載網址");

      const targetMediaUrl = data.url;
      setManualDownloadUrl(targetMediaUrl);
      setStatus('解析成功，正在下載媒體檔案...');
      
      let blob: Blob | null = null;

      // --- STRATEGY 1: Internal Vercel Proxy (Most Reliable) ---
      try {
          setStatus('正在透過內部 Proxy 傳輸...');
          const internalProxyUrl = `/api/proxy?url=${encodeURIComponent(targetMediaUrl)}`;
          const proxyRes = await fetch(internalProxyUrl);
          if (proxyRes.ok) {
              blob = await proxyRes.blob();
          } else {
              throw new Error("Internal proxy failed");
          }
      } catch (proxyErr) {
          console.warn("內部 Proxy 失敗，嘗試備用方案...", proxyErr);
          
          // --- STRATEGY 2: Public Proxy (AllOrigins) ---
          try {
              setStatus('正在嘗試備用公共代理...');
              const publicProxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetMediaUrl)}`;
              const allOriginsRes = await fetch(publicProxy);
              if (allOriginsRes.ok) {
                  blob = await allOriginsRes.blob();
              } else {
                  throw new Error("Public proxy failed");
              }
          } catch (allOriginsErr) {
              console.error("所有下載嘗試均失敗", allOriginsErr);
              throw new Error("CORS_BLOCK");
          }
      }

      if (!blob) throw new Error("無法獲取檔案內容");
      
      // Generate filename
      const filename = `network_${Date.now()}.mp3`;
      const file = new File([blob], filename, { type: 'audio/mpeg' });
      
      setStatus('完成！檔案已載入。');
      onFileSelect(file);
      setUrl(''); 
      setManualDownloadUrl(null);
      
      setTimeout(() => setStatus(''), 3000);

    } catch (err: any) {
      console.error(err);
      if (err.message === 'CORS_BLOCK') {
          setError("瀏覽器安全性限制下載。請點擊下方的「手動下載」按鈕，存檔後拖入軟體。");
      } else {
          setError(err.message || "匯入過程發生錯誤");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors animate-fade-in">
      <div className="flex items-center gap-2 mb-3 text-pink-600 dark:text-pink-400">
        <Globe size={20} />
        <h3 className="font-semibold">雲端連結匯入 (雙重代理版)</h3>
        <span className="px-1.5 py-0.5 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 text-[10px] rounded-full font-bold">PRO</span>
      </div>
      
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
        內置 Vercel 伺服器代理，自動繞過 CORS 限制。支援 YouTube、FB、IG、TikTok 等主流平台。
      </p>

      <div className="flex flex-col gap-3">
        <div className="relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Link2 size={16} />
             </div>
             <input 
                type="text" 
                placeholder="貼上影片網址" 
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
            {isProcessing ? '正在處理...' : '解析並下載音訊'}
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
                    <p className="opacity-80 flex items-center gap-1"><HelpCircle size={12}/> 如果下載停滯，請點擊下方手動獲取：</p>
                    <a 
                        href={manualDownloadUrl} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="flex items-center justify-center gap-2 w-full py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-lg transition-all font-bold shadow-sm"
                    >
                        <ExternalLink size={14} /> 點擊手動下載 MP3
                    </a>
                    <p className="text-[10px] italic text-center opacity-60">下載後請將檔案拖入左側「上載影音」框</p>
                </div>
            )}
          </div>
        )}
        
        <div className="text-[10px] text-slate-400 dark:text-slate-500 flex justify-between px-1">
            <span>Server: Vercel Node.js</span>
            <span>API: Cobalt 10.x</span>
        </div>
      </div>
    </div>
  );
};

export default UrlImporter;
