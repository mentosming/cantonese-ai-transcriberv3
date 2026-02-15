
import React, { useState, useRef, useEffect } from 'react';
import { Link2, Download, Loader2, AlertCircle, Globe, ExternalLink, ArrowRight, Video, Music, Mic, StopCircle, PlayCircle, X } from 'lucide-react';
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
    let videoId = '';
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const match = rawUrl.match(ytRegex);
    if (match && match[1]) {
        return `https://www.youtube.com/embed/${match[1]}?autoplay=1`;
    }
    return rawUrl;
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
      setError("無法直接下載該影片。建議使用下方的「同步錄製」功能。");
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
            autoGainControl: false
        }
      } as any);

      // We only want the audio track
      const audioStream = new MediaStream(stream.getAudioTracks());
      
      // If no audio track was selected
      if (audioStream.getAudioTracks().length === 0) {
          stream.getTracks().forEach(t => t.stop());
          alert("錯誤：未勾選「分享分頁音訊」。請重試並確保勾選該選項。");
          return;
      }

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
      alert("無法啟動錄製：需授權分頁擷取權限。");
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
        <span className="px-2 py-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] rounded-full font-bold">V5.0 (Absolute)</span>
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
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
                <div className="p-4 border-b dark:border-slate-800 flex justify-between items-center">
                    <h3 className="font-bold flex items-center gap-2 dark:text-white">
                        <Mic size={20} className="text-red-500" /> 同步錄製模式 (備援方案)
                    </h3>
                    <button onClick={() => { stopRecording(); setShowRecorder(false); }} className="text-slate-400 hover:text-white"><X size={24}/></button>
                </div>

                <div className="flex-1 bg-black flex items-center justify-center relative">
                    {url.includes('youtube') || url.includes('youtu.be') ? (
                        <iframe 
                            src={getEmbedUrl(url)}
                            className="w-full aspect-video"
                            allow="autoplay; encrypted-media"
                            allowFullScreen
                        ></iframe>
                    ) : (
                        <div className="text-center p-10">
                            <Video size={48} className="text-slate-700 mx-auto mb-4" />
                            <p className="text-slate-400 text-sm">此平台不支援內嵌播放。請在開始錄製後，手動開啟影片分頁播放。</p>
                            <a href={url} target="_blank" rel="noreferrer" className="text-blue-500 underline mt-2 inline-block">點此開啟影片原始連結</a>
                        </div>
                    )}

                    {isRecording && (
                        <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 bg-red-600 text-white rounded-full text-xs font-bold animate-pulse">
                            <div className="w-2 h-2 bg-white rounded-full"></div> REC 錄製中...
                        </div>
                    )}
                </div>

                <div className="p-6 bg-slate-50 dark:bg-slate-800 border-t dark:border-slate-700">
                    <div className="max-w-md mx-auto space-y-4">
                        <div className="text-center">
                            <p className="text-sm font-medium dark:text-white mb-1">使用說明：</p>
                            <ol className="text-[11px] text-slate-500 text-left list-decimal list-inside space-y-1">
                                <li>點擊「開始擷取」，彈窗時請勾選「<strong>分享分頁音訊</strong>」。</li>
                                <li>播放影片。系統會即時錄下影片聲音。</li>
                                <li>影片結束後點擊「停止並匯入」。</li>
                            </ol>
                        </div>

                        {!recordedBlob ? (
                            <Button 
                                onClick={isRecording ? stopRecording : startRecording}
                                className={`w-full h-12 text-base font-bold ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                            >
                                {isRecording ? <><StopCircle size={20}/> 停止並完成錄製</> : <><PlayCircle size={20}/> 第一步：開始擷取分頁音訊</>}
                            </Button>
                        ) : (
                            <div className="flex flex-col gap-3 animate-fade-in">
                                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-lg text-center">
                                    <p className="text-xs text-green-700 dark:text-green-400 font-bold">錄製已完成！</p>
                                </div>
                                <Button onClick={handleUseRecording} className="w-full h-12 bg-green-600 hover:bg-green-700 font-bold">
                                    第二步：使用此錄音進行轉錄
                                </Button>
                                <Button variant="ghost" onClick={() => setRecordedBlob(null)} className="text-xs text-slate-400">重新錄製</Button>
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
