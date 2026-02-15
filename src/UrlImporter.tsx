
import React, { useState } from 'react';
import { Link2, Download, Loader2, AlertCircle, CheckCircle2, Globe, ArrowRight, HelpCircle, ExternalLink, RefreshCw } from 'lucide-react';
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
  const [manualDownloadData, setManualDownloadData] = useState<{url: string, filename: string} | null>(null);

  const handleImport = async () => {
    if (!url) return;
    
    if (!url.match(/^(http|https):\/\//)) {
        setError("請輸入有效的網址 (需包含 http:// 或 https://)");
        return;
    }

    setIsProcessing(true);
    setError(null);
    setManualDownloadData(null);
    setStatus('正在連線至 Cobalt 解析服務...');

    try {
      // 1. Resolve URL using Cobalt API
      const response = await fetch("https://api.cobalt.tools/api/json", {
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

      if (!response.ok) throw new Error(`解析服務連線失敗 (${response.status})`);
      const data = await response.json();
      
      if (data.status === 'error') throw new Error(data.text || "無法解析此連結");
      if (!data.url) throw new Error("伺服器未返回下載連結");

      const targetUrl = data.url;
      
      // Determine Filename
      let filename = "download.mp3";
      if (data.filename) filename = data.filename;
      else if (url.includes('youtube') || url.includes('youtu.be')) filename = `yt_${Date.now()}.mp3`;
      else if (url.includes('facebook')) filename = `fb_${Date.now()}.mp3`;
      else if (url.includes('instagram')) filename = `ig_${Date.now()}.mp3`;
      
      setManualDownloadData({ url: targetUrl, filename });
      setStatus('解析成功，正在下載音訊檔案...');
      
      // 2. Download Strategy: Local Proxy -> Public Proxy (Fallback)
      let blob: Blob | null = null;
      
      // Attempt 1: Local Vercel Proxy (Secure, No Limits usually)
      try {
          const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
          const res = await fetch(proxyUrl);
          if (!res.ok) throw new Error("Local Proxy Failed");
          blob = await res.blob();
      } catch (localErr) {
          console.warn("Local proxy failed, switching to public fallback...", localErr);
          
          // Attempt 2: corsproxy.io (Public, Fast, Good for fallback)
          try {
             setStatus('正在切換至備用線路下載...');
             const publicProxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
             const res = await fetch(publicProxyUrl);
             if (!res.ok) throw new Error("Public Proxy Failed");
             blob = await res.blob();
          } catch (publicErr) {
             throw new Error("CORS_BLOCK"); // Trigger manual download UI
          }
      }

      if (!blob) throw new Error("檔案內容為空");

      const file = new File([blob], filename, { type: 'audio/mpeg' });
      
      setStatus('完成！');
      onFileSelect(file);
      setUrl(''); 
      setManualDownloadData(null);
      
      setTimeout(() => setStatus(''), 3000);

    } catch (err: any) {
      console.error(err);
      
      if (err.message === 'CORS_BLOCK' || err.message.includes('Proxy')) {
          setError("自動下載因安全限制被攔截。請點擊下方按鈕手動下載。");
          // Keep manualDownloadData set so user can click it
      } else {
          setError(err.message || "發生未知錯誤");
          setManualDownloadData(null);
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
        <span className="px-1.5 py-0.5 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 text-[10px] rounded-full font-bold">V2.2 (Fallback)</span>
      </div>
      
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        支援 YouTube, Facebook, Instagram, TikTok。系統內建雙重代理以確保下載成功率。
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

        {/* Manual Download Fallback UI */}
        {manualDownloadData && error && (
            <div className="mt-2 pt-3 border-t border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-100 dark:border-yellow-800/50">
                    <p className="text-xs text-yellow-800 dark:text-yellow-200 font-bold mb-2 flex items-center gap-1">
                        <HelpCircle size={14}/> 替代方案：
                    </p>
                    <ol className="text-xs text-yellow-700 dark:text-yellow-300 list-decimal list-inside space-y-2">
                        <li>
                            <a 
                                href={manualDownloadData.url} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="inline-flex items-center gap-1 font-bold underline hover:text-yellow-900 dark:hover:text-yellow-100"
                            >
                                點擊此處下載 MP3 <ExternalLink size={12}/>
                            </a>
                        </li>
                        <li>下載完成後，將檔案<strong>拖入上方</strong>「上載影音」框中即可。</li>
                    </ol>
                </div>
            </div>
        )}
        
        <div className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-1">
            * 服務由 Cobalt API 提供
        </div>
      </div>
    </div>
  );
};

export default UrlImporter;
