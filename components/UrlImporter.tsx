
import React, { useState } from 'react';
import { Link2, Download, Loader2, AlertCircle, CheckCircle2, Globe, ArrowRight } from 'lucide-react';
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

  const handleImport = async () => {
    if (!url) return;
    
    // Basic validation
    if (!url.match(/^(http|https):\/\//)) {
        setError("請輸入有效的網址 (需包含 http:// 或 https://)");
        return;
    }

    setIsProcessing(true);
    setError(null);
    setStatus('正在連線至媒體伺服器...');

    try {
      // Use Cobalt API (Public Instance) for extraction
      // Documentation: https://github.com/imputnet/cobalt/blob/current/docs/api.md
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
          aFormat: "mp3", // Request MP3 directly
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

      setStatus('正在下載音訊檔案...');
      
      // Fetch the actual audio file
      // Note: This might hit CORS issues depending on the source. 
      // If CORS fails, we might need a fallback.
      const mediaRes = await fetch(data.url);
      
      if (!mediaRes.ok) throw new Error("無法下載音訊串流 (CORS 或 連結失效)");
      
      const blob = await mediaRes.blob();
      
      // Generate a filename based on URL or timestamp
      let filename = "network_audio.mp3";
      // Try to get filename from content-disposition if exposed, otherwise generic
      if (url.includes('youtube') || url.includes('youtu.be')) filename = `yt_audio_${Date.now()}.mp3`;
      else if (url.includes('facebook') || url.includes('fb.watch')) filename = `fb_audio_${Date.now()}.mp3`;
      else if (url.includes('instagram')) filename = `ig_audio_${Date.now()}.mp3`;
      
      const file = new File([blob], filename, { type: 'audio/mpeg' });
      
      setStatus('完成！');
      onFileSelect(file);
      setUrl(''); // Clear input on success
      
      // Clear success msg after 3s
      setTimeout(() => setStatus(''), 3000);

    } catch (err: any) {
      console.error(err);
      let msg = "匯入失敗。";
      
      if (err.message.includes('Failed to fetch') || err.message.includes('CORS')) {
          msg = "下載被瀏覽器攔截 (CORS)。請點擊下方按鈕手動下載，然後拖入框中。";
      } else {
          msg = err.message || "發生未知錯誤";
      }
      setError(msg);
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
                {/* Fallback for CORS errors */}
                {error && error.includes('CORS') && (
                     <div className="mt-2">
                        <a 
                            href="https://cobalt.tools/" 
                            target="_blank" 
                            rel="noreferrer" 
                            className="inline-flex items-center gap-1 text-pink-600 dark:text-pink-400 font-bold hover:underline"
                        >
                            前往下載工具網站 <ArrowRight size={10} />
                        </a>
                     </div>
                )}
            </div>
          </div>
        )}
        
        <div className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-1">
            * 支援服務由 Cobalt API 提供，可能因地區限制失效。
        </div>
      </div>
    </div>
  );
};

export default UrlImporter;
