import React, { useState, useRef, useEffect } from 'react';
import { Link2, Download, Loader2, AlertCircle, Globe, ExternalLink, ArrowRight, Video, Music, Mic, StopCircle, PlayCircle, X, Layers, CheckCircle2 } from 'lucide-react';
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
  
  // Recording Mode States
  const [showRecorder, setShowRecorder] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // YouTube Embed Helper
  const getEmbedUrl = (rawUrl: string) => {
    try {
        const urlObj = new URL(rawUrl);
        let videoId = '';
        
        if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
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
                // remove any query params from ID
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
     // Open in a decent size popup to allow user to play it
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
    } catch (err: any) {
      setError("無法直接下載該影片。請使用下方的「同步錄製」功能。");
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    try {
      // Use getDisplayMedia to capture system/tab audio
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Chrome requires video to allow audio capture
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 2
        },
        // @ts-ignore - Prefer current tab if possible, though 'browser' usually asks user
        preferCurrentTab: false 
      } as any);

      // We only want the audio track
      const audioTracks = stream.getAudioTracks();
      
      // If no audio track was selected
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
      // Don't alert if user just cancelled
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
    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors animate-fade-in">
      <div className="flex items-center gap-2 mb-3 text-pink-600 dark:text-pink-400">
        <Globe size={20} />
        <h3 className="font-semibold">網絡連結匯入</h3>
        <span className="px-2 py-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] rounded-full font-bold">V5.2 (Sync-Play)</span>
      </div>
      
      <div className="flex flex-col gap-3">
        <div className="relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Link2 size={16} />
             </div>
             <input 
                type="text" 
                placeholder="貼上影片連結..." 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isProcessing || isRecording || disabled}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none text-slate-900 dark:text-slate-100 placeholder-slate-400"
             />
        </div>

        <div className="flex gap-2">
            <Button 
                onClick={() => handleImport(false)} 
                disabled={!url || isProcessing || disabled}
                className="flex-1 text-xs"
                variant="secondary"
            >
                {isProcessing ? <Loader2 className="animate-spin" size={14}/> : <Download size={14} />} 快速解析
            </Button>
            <Button 
                onClick={() => setShowRecorder(true)} 
                disabled={!url || isProcessing || disabled}
                className="flex-1 text-xs bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-indigo-300"
                variant="secondary"
            >
                <Mic size={14} /> 同步錄製
            </Button>
        </div>

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

      {/* Synchronized Recording Modal */}
      {showRecorder && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl relative">
                <div className="p-4 border-b dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 z-10">
                    <h3 className="font-bold flex items-center gap-2 dark:text-white">
                        <Mic size={20} className="text-red-500" /> 同步錄製模式 (錄製系統/分頁音訊)
                    </h3>
                    <button onClick={() => { stopRecording(); setShowRecorder(false); }} className="text-slate-400 hover:text-white"><X size={24}/></button>
                </div>

                <div className="flex-1 bg-black flex flex-col relative overflow-hidden">
                    {/* Video / Placeholder Area */}
                    <div className="flex-1 relative flex items-center justify-center bg-slate-950">
                        {url.includes('youtube') || url.includes('youtu.be') ? (
                            <iframe 
                                src={getEmbedUrl(url)}
                                className="w-full h-full absolute inset-0"
                                allow="autoplay; encrypted-media; picture-in-picture"
                                allowFullScreen
                            ></iframe>
                        ) : (
                            <div className="text-center p-8 opacity-50">
                                <Video size={64} className="text-slate-600 mx-auto mb-4" />
                                <p className="text-slate-500">此連結不支援預覽</p>
                            </div>
                        )}

                        {/* Always visible Overlay Button for External Playback */}
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full text-center px-4 pointer-events-none z-30">
                            <div className="pointer-events-auto inline-block">
                                <Button 
                                    onClick={openPopup}
                                    className="shadow-2xl bg-white hover:bg-slate-50 text-slate-900 border-0 py-3 px-6 rounded-full font-bold text-sm transform hover:scale-105 transition-all flex items-center gap-2"
                                >
                                    <Layers size={18} className="text-blue-600" />
                                    畫面被封鎖？點此開啟「獨立視窗」播放
                                </Button>
                                <p className="text-white/80 text-[10px] mt-2 bg-black/50 px-2 py-1 rounded inline-block backdrop-blur-sm">
                                    提示：若上方出現 "Blocked"，請點此按鈕。
                                </p>
                            </div>
                        </div>
                    </div>

                    {isRecording && (
                        <div className="absolute top-4 right-4 flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-full text-xs font-bold animate-pulse shadow-lg z-20">
                            <div className="w-2 h-2 bg-white rounded-full"></div> REC 錄製中...
                        </div>
                    )}
                </div>

                {/* Steps Footer */}
                <div className="p-5 bg-slate-50 dark:bg-slate-800 border-t dark:border-slate-700">
                    <div className="max-w-3xl mx-auto">
                        {!recordedBlob ? (
                            <div className="flex flex-col md:flex-row gap-4 items-center">
                                <div className="flex-1 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                                    <p className="font-bold text-slate-800 dark:text-slate-200 mb-2">操作步驟：</p>
                                    <p>1. 點擊畫面中的<strong>「開啟獨立視窗」</strong>準備好影片。</p>
                                    <p>2. 點擊右側<strong>「開始錄製」</strong>，在彈出視窗選擇剛剛開啟的視窗/分頁。</p>
                                    <p className="text-red-500 font-bold">3. ⚠️ 務必勾選左下角「分享音訊」(Share audio)。</p>
                                    <p>4. 在獨立視窗播放影片，聲音即會自動錄入。</p>
                                </div>
                                <div className="w-full md:w-auto shrink-0">
                                    <Button 
                                        onClick={isRecording ? stopRecording : startRecording}
                                        className={`w-full md:w-48 h-12 text-sm font-bold shadow-lg ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                                    >
                                        {isRecording ? <><StopCircle size={18}/> 停止並匯入</> : <><PlayCircle size={18}/> 開始錄製 (Start)</>}
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
                                    <Button variant="secondary" onClick={() => setRecordedBlob(null)} className="px-4 dark:bg-slate-700 dark:text-slate-300">
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