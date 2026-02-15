import React, { useState, useRef, useEffect } from 'react';
import { Link2, Download, Loader2, AlertCircle, Globe, ExternalLink, ArrowRight, Video, Music, Mic, StopCircle, PlayCircle, X, Layers, CheckCircle2, MonitorPlay, FileDown, Lock } from 'lucide-react';
import Button from './Button';

interface UrlImporterProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  isPro: boolean;
  onRequestUnlock: () => void;
}

const UrlImporter: React.FC<UrlImporterProps> = ({ onFileSelect, disabled, isPro, onRequestUnlock }) => {
  const [url, setUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [manualData, setManualData] = useState<{url: string, filename: string} | null>(null);
  
  // Recording Mode States
  const [showRecorder, setShowRecorder] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [forceEmbed, setForceEmbed] = useState(false); // New: Allow user to force iframe
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // YouTube Helper
  const isYouTube = (rawUrl: string) => {
      return rawUrl.includes('youtube.com') || rawUrl.includes('youtu.be');
  };

  const getEmbedUrl = (rawUrl: string) => {
    try {
        const urlObj = new URL(rawUrl);
        let videoId = '';
        
        if (isYouTube(rawUrl)) {
            if (urlObj.searchParams.has('v')) {
                videoId = urlObj.searchParams.get('v') || '';
            } else if (urlObj.hostname === 'youtu.be') {
                videoId = urlObj.pathname.slice(1);
            } else if (urlObj.pathname.includes('/embed/')) {
                videoId = urlObj.pathname.split('/embed/')[1];
            } else if (urlObj.pathname.includes('/shorts/')) {
                videoId = urlObj.pathname.split('/shorts/')[1];
            }

            if (videoId) {
                videoId = videoId.split('?')[0]; 
                return `https://www.youtube.com/embed/${videoId}`;
            }
        }
    } catch (e) {
        return rawUrl;
    }
    return rawUrl;
  };

  const openPopup = () => {
     if(!url) return;
     window.open(url, 'TargetVideo', 'width=1024,height=600,resizable=yes,scrollbars=yes,menubar=no');
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
    setStatus('正在嘗試自動提取...');

    try {
      const response = await fetch("https://api.cobalt.tools/api/json", {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, vQuality: "720", aFormat: "mp3", isAudioOnly: !useVideoMode })
      });

      const data = await response.json();
      if (data.status === 'error' || !data.url) throw new Error("AUTO_FAILED");

      setManualData({ url: data.url, filename: data.filename || `media_${Date.now()}.mp3` });
      setStatus('連結就緒，嘗試自動載入...');

      const proxyUrl = `/api/proxy?url=${encodeURIComponent(data.url)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error("PROXY_FAILED");
      
      const blob = await res.blob();
      const file = new File([blob], data.filename || 'audio.mp3', { type: blob.type });
      onFileSelect(file);
      setUrl('');
      setManualData(null);
      setStatus('');
    } catch (err: any) {
      setError("無法直接下載該影片。請使用下方的「同步錄製」功能。");
      setStatus('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (!url) return;
    if (!url.match(/^(http|https):\/\//)) {
        setError("請輸入正確網址");
        return;
    }

    setIsProcessing(true);
    setError(null);
    setStatus('正在準備下載...');

    try {
      const response = await fetch("https://api.cobalt.tools/api/json", {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, vQuality: "720", aFormat: "mp3", isAudioOnly: true })
      });

      const data = await response.json();
      if (data.status === 'error' || !data.url) throw new Error("AUTO_FAILED");
      
      setStatus('正在下載檔案...');
      
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(data.url)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error("PROXY_FAILED");

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = data.filename || `download_${Date.now()}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      
      setStatus('下載完成！');
      setTimeout(() => setStatus(''), 3000);
      setUrl('');
    } catch (err: any) {
      setError("下載失敗，請嘗試使用錄製模式。");
      setStatus('');
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 2
        },
        // @ts-ignore
        preferCurrentTab: false 
      } as any);

      const audioTracks = stream.getAudioTracks();
      
      if (audioTracks.length === 0) {
          stream.getTracks().forEach(t => t.stop());
          alert("錯誤：未偵測到音訊軌道。\n\n請重試，並務必在彈出視窗中勾選左下角的「分享分頁音訊」 (Share tab audio)。");
          return;
      }

      const audioStream = new MediaStream(audioTracks);
      const mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
    } catch (err) {
      console.error(err);
      if ((err as any).name !== 'NotAllowedError') {
          alert("無法啟動錄製，請確保瀏覽器支援分頁錄音功能。");
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };
  
  // New function to download the recorded blob directly
  const handleDownloadRecording = () => {
    if (!recordedBlob) return;
    const downloadUrl = window.URL.createObjectURL(recordedBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `recording_${Date.now()}.webm`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  };

  const handleUseRecording = () => {
    if (recordedBlob) {
        const file = new File([recordedBlob], `recording_${Date.now()}.webm`, { type: 'audio/webm' });
        onFileSelect(file);
        setShowRecorder(false);
        setRecordedBlob(null);
        setUrl('');
    }
  };

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all animate-fade-in relative overflow-hidden ${!isPro ? 'min-h-[280px] p-0' : 'p-4'}`}>
      
      {/* Lock Overlay - Enhanced Aesthetics */}
      {!isPro && (
        <div className="absolute inset-0 z-20 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6 animate-fade-in">
            <div className="p-4 bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-full mb-5 shadow-sm border border-slate-100 dark:border-slate-700">
                <Lock size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-3">完全版功能</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-[260px] leading-relaxed">
                網絡連結匯入與錄製功能<br/>僅供完全版用戶使用。
            </p>
            <Button onClick={onRequestUnlock} className="px-8 py-3 shadow-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white border-0 font-bold tracking-wide transform hover:scale-105 transition-all rounded-full">
                輸入通行碼解鎖
            </Button>
        </div>
      )}

      <div className={`transition-all duration-500 ${!isPro ? 'opacity-5 pointer-events-none blur-sm p-4 h-full flex flex-col justify-between' : ''}`}>
        <div className="flex items-center gap-2 mb-3 text-pink-600 dark:text-pink-400">
            <Globe size={20} />
            <h3 className="font-semibold">網絡連結匯入</h3>
            <span className="px-2 py-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] rounded-full font-bold">V5.4 (Download+)</span>
        </div>
        
        <div className="flex flex-col gap-4">
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Link2 size={16} />
                </div>
                <input 
                    type="text" 
                    placeholder="貼上影片連結 (YouTube, Instagram...)" 
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={isProcessing || isRecording || disabled}
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none text-slate-900 dark:text-slate-100 placeholder-slate-400"
                />
            </div>

            <div className="flex gap-2">
                <Button 
                    onClick={() => handleImport(false)} 
                    disabled={!url || isProcessing || disabled}
                    className="flex-1 text-xs py-2.5"
                    variant="secondary"
                    title="解析並自動匯入到轉錄區"
                >
                    {isProcessing && status.includes('自動') ? <Loader2 className="animate-spin" size={14}/> : <ArrowRight size={14} />} 快速匯入
                </Button>
                
                <Button 
                    onClick={handleDownload} 
                    disabled={!url || isProcessing || disabled}
                    className="w-28 text-xs py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
                    variant="secondary"
                    title="僅下載 MP3 檔案"
                >
                {isProcessing && status.includes('下載') ? <Loader2 className="animate-spin" size={14}/> : <FileDown size={14} />} 下載 MP3
                </Button>

                <Button 
                    onClick={() => { setShowRecorder(true); setForceEmbed(false); }} 
                    disabled={!url || isProcessing || disabled}
                    className="flex-1 text-xs py-2.5 bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-indigo-300"
                    variant="secondary"
                >
                    <Mic size={14} /> 同步錄製
                </Button>
            </div>

            {status && !error && (
                <div className="px-2 py-1 flex items-center justify-center gap-2 text-xs text-blue-600 dark:text-blue-400 animate-pulse">
                    <Loader2 size={12} className="animate-spin" /> {status}
                </div>
            )}

            {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg animate-fade-in">
                    <p className="text-[11px] text-red-600 dark:text-red-300 mb-2 flex items-center gap-1">
                        <AlertCircle size={14} /> {error}
                    </p>
                    {manualData && (
                        <a href={manualData.url} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-blue-600 dark:text-blue-400 underline flex items-center gap-1">
                            <ExternalLink size={12}/> 嘗試手動下載檔案
                        </a>
                    )}
                </div>
            )}
        </div>
      </div>

      {/* Synchronized Recording Modal */}
      {showRecorder && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl relative">
                <div className="p-4 border-b dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 z-10">
                    <h3 className="font-bold flex items-center gap-2 dark:text-white">
                        <Mic size={20} className="text-red-500" /> 同步錄製模式
                    </h3>
                    <button onClick={() => { stopRecording(); setShowRecorder(false); }} className="text-slate-400 hover:text-white"><X size={24}/></button>
                </div>

                <div className="flex-1 bg-black flex flex-col relative overflow-hidden">
                    {/* Video Area Logic:
                        1. If YouTube & NOT Forced Popup -> Try Embed.
                        2. If Other & NOT Forced Embed -> Show Placeholder.
                        3. If Forced Embed -> Show Iframe.
                    */}
                    <div className="flex-1 relative flex items-center justify-center bg-slate-100 dark:bg-slate-950">
                        {(isYouTube(url) || forceEmbed) ? (
                            <iframe 
                                src={getEmbedUrl(url)}
                                className="w-full h-full absolute inset-0"
                                allow="autoplay; encrypted-media; picture-in-picture"
                                allowFullScreen
                            ></iframe>
                        ) : (
                            <div className="text-center p-8 flex flex-col items-center">
                                <div className="p-4 bg-slate-200 dark:bg-slate-800 rounded-full mb-4">
                                    <MonitorPlay size={48} className="text-slate-500 dark:text-slate-400" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">此來源建議使用獨立視窗播放</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md">
                                    許多網站 (如 Facebook, Instagram 或特定 YouTube 影片) 禁止在其他網頁內嵌播放。
                                    <br/>請直接開啟獨立視窗以避免「內容遭到封鎖」的錯誤。
                                </p>
                                <Button 
                                    onClick={openPopup}
                                    className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full shadow-lg flex items-center gap-2"
                                >
                                    <Layers size={18} /> 開啟獨立視窗播放 (推薦)
                                </Button>
                                
                                <button 
                                    onClick={() => setForceEmbed(true)}
                                    className="mt-6 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
                                >
                                    嘗試強制內嵌 (可能會失敗)
                                </button>
                            </div>
                        )}

                        {/* YouTube Specific Error Hint Overlay */}
                        {(isYouTube(url) || forceEmbed) && (
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm text-white px-4 py-2 rounded-full text-xs flex items-center gap-2 pointer-events-none z-20">
                                <AlertCircle size={12} className="text-yellow-400"/>
                                <span>若畫面顯示「遭到封鎖」，請點擊下方按鈕</span>
                            </div>
                        )}

                        {/* Always visible Popup Button for Embed Mode */}
                        {(isYouTube(url) || forceEmbed) && (
                            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
                                <Button 
                                    onClick={openPopup}
                                    className="shadow-2xl bg-white hover:bg-slate-50 text-slate-900 border-0 py-2.5 px-6 rounded-full font-bold text-xs transform hover:scale-105 transition-all flex items-center gap-2"
                                >
                                    <Layers size={16} className="text-blue-600" />
                                    開啟獨立視窗 (解決封鎖問題)
                                </Button>
                            </div>
                        )}
                    </div>

                    {isRecording && (
                        <div className="absolute top-4 right-4 flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-full text-xs font-bold animate-pulse shadow-lg z-40">
                            <div className="w-2 h-2 bg-white rounded-full"></div> REC 錄製中...
                        </div>
                    )}
                </div>

                {/* Steps Footer */}
                <div className="p-5 bg-slate-50 dark:bg-slate-800 border-t dark:border-slate-700">
                    <div className="max-w-4xl mx-auto">
                        {!recordedBlob ? (
                            <div className="flex flex-col md:flex-row gap-6 items-center">
                                <div className="flex-1 text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
                                    <p className="font-bold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-2">
                                        <CheckCircle2 size={14} className="text-green-500"/> 標準流程：
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pl-1">
                                        <p>1. 點擊 <strong>[開啟獨立視窗]</strong> 或直接在上方播放。</p>
                                        <p>2. 點擊右側 <strong>[開始錄製]</strong>。</p>
                                        <p>3. 選擇剛剛的 <strong>視窗 (Window)</strong> 或 <strong>分頁 (Tab)</strong>。</p>
                                        <p className="text-red-500 font-bold bg-red-50 dark:bg-red-900/20 px-1 rounded inline-block">4. ⚠️ 必須勾選 [分享音訊]。</p>
                                    </div>
                                </div>
                                <div className="w-full md:w-auto shrink-0">
                                    <Button 
                                        onClick={isRecording ? stopRecording : startRecording}
                                        className={`w-full md:w-56 h-12 text-sm font-bold shadow-lg transition-all ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-105'}`}
                                    >
                                        {isRecording ? <><StopCircle size={20}/> 停止並匯入</> : <><PlayCircle size={20}/> 開始錄製 (Start)</>}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3 animate-fade-in">
                                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-lg flex items-center justify-center gap-2">
                                    <CheckCircle2 size={16} className="text-green-600 dark:text-green-400"/>
                                    <p className="text-sm text-green-700 dark:text-green-400 font-bold">錄製已完成！</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={handleUseRecording} className="flex-1 h-10 bg-green-600 hover:bg-green-700 font-bold shadow-md">
                                        使用此錄音進行轉錄
                                    </Button>
                                    <Button variant="secondary" onClick={handleDownloadRecording} className="px-4 dark:bg-slate-700 dark:text-slate-300" title="下載錄音檔">
                                        <Download size={18} />
                                    </Button>
                                    <Button variant="secondary" onClick={() => setRecordedBlob(null)} className="px-4 dark:bg-slate-700 dark:text-slate-300" title="重新錄製">
                                        重錄
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default UrlImporter;