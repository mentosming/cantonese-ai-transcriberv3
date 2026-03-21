import React, { useState, useRef } from 'react';
import { FileAudio, FileVideo, Download, AlertCircle, Loader2, HardDrive, CheckCircle2, ArrowRight } from 'lucide-react';
import Button from './Button';

const AudioExtractor: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper: Convert Float32Array (AudioBuffer) to Int16Array (PCM)
  const floatTo16BitPCM = (input: Float32Array) => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        setFile(e.target.files[0]);
        setResultUrl(null);
        setErrorMsg(null);
        setStatusMsg('');
    }
  };

  const handleConvert = async () => {
    if (!file) return;
    setIsProcessing(true);
    setResultUrl(null);
    setStatusMsg('正在初始化...');
    setErrorMsg(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 44100 });
      
      setStatusMsg('正在解碼音訊資料...');
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      setStatusMsg('準備編碼為 MP3...');
      await new Promise(r => setTimeout(r, 100)); // Allow UI update

      let channels = audioBuffer.numberOfChannels;
      if (channels > 2) channels = 2; // Stereo max for simple LameJS usage

      const lamejs = (window as any).lamejs;
      if (!lamejs || !lamejs.Mp3Encoder) {
          throw new Error("無法加載 MP3 編碼庫 (lamejs)。請檢查網絡或重新整理頁面。");
      }

      const mp3encoder = new lamejs.Mp3Encoder(channels, audioBuffer.sampleRate, 128);
      
      const leftData = floatTo16BitPCM(audioBuffer.getChannelData(0));
      const rightData = channels > 1 ? floatTo16BitPCM(audioBuffer.getChannelData(1)) : undefined;

      const mp3Data: Int8Array[] = [];
      const sampleBlockSize = 1152;
      const processingChunk = sampleBlockSize * 100; // Process in chunks to avoid blocking UI too much

      for (let i = 0; i < leftData.length; i += processingChunk) {
          // Update progress occasionally
          if (i > 0 && i % (processingChunk * 10) === 0) {
             const progress = Math.round((i / leftData.length) * 100);
             setStatusMsg(`編碼中... ${progress}%`);
             await new Promise(r => setTimeout(r, 0));
          }

          const end = Math.min(i + processingChunk, leftData.length);
          const leftChunk = leftData.subarray(i, end);
          const rightChunk = rightData ? rightData.subarray(i, end) : undefined;
          
          const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
          if (mp3buf.length > 0) {
              mp3Data.push(mp3buf);
          }
      }

      const endBuf = mp3encoder.flush();
      if (endBuf.length > 0) {
          mp3Data.push(endBuf);
      }

      const blob = new Blob(mp3Data, { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      
      setResultUrl(url);
      setResultFileName(`${file.name.split('.')[0]}_extracted.mp3`);
      setStatusMsg('轉換完成！');

    } catch (error: any) {
      console.error(error);
      const msg = error?.message || "轉換過程發生錯誤";
      setErrorMsg(msg.includes('decodeAudioData') ? "無法解碼檔案。檔案可能損壞或格式不支援。" : msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
      <div className="flex items-center gap-2 mb-3 text-purple-600 dark:text-purple-400">
        <HardDrive size={20} />
        <h3 className="font-semibold">本機影音轉檔 (MP3)</h3>
      </div>
      
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        直接在瀏覽器中將影片 (MP4/MOV/WEBM) 轉換為 MP3 音訊檔，無需上傳至伺服器。
      </p>

      <div className="flex flex-col gap-3">
        <div className="relative group">
            <input 
              type="file" 
              accept="video/*,audio/*"
              ref={fileInputRef}
              className="block w-full text-xs text-slate-500 dark:text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-50 dark:file:bg-purple-900/30 file:text-purple-700 dark:file:text-purple-300 hover:file:bg-purple-100 cursor-pointer"
              onChange={handleFileChange}
            />
        </div>

        {file && (
             <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded border border-slate-100 dark:border-slate-700">
                {file.type.startsWith('video') ? <FileVideo size={16} className="text-blue-500"/> : <FileAudio size={16} className="text-purple-500"/>}
                <span className="text-xs text-slate-700 dark:text-slate-300 truncate flex-1">{file.name}</span>
                <span className="text-[10px] text-slate-400">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
             </div>
        )}

        <Button 
            onClick={handleConvert} 
            disabled={!file || isProcessing}
            className="w-full text-sm dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-600"
            variant="secondary"
        >
            {isProcessing ? <Loader2 className="animate-spin" size={16}/> : <ArrowRight size={16} />}
            {isProcessing ? '處理中...' : '開始轉換為 MP3'}
        </Button>

        {/* Status / Error Messages */}
        {(statusMsg || errorMsg) && (
          <div className={`text-xs flex items-center gap-2 ${errorMsg ? 'text-red-600 dark:text-red-400' : (resultUrl ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400')}`}>
            {errorMsg ? <AlertCircle size={14}/> : (resultUrl ? <CheckCircle2 size={14}/> : <Loader2 size={14} className={isProcessing ? "animate-spin" : "hidden"}/>)}
            <span className="truncate flex-1">{errorMsg || statusMsg}</span>
          </div>
        )}

        {/* Download Button */}
        {resultUrl && (
           <a 
             href={resultUrl}
             target="_blank"
             rel="noreferrer"
             download={resultFileName}
             className="flex items-center justify-center gap-2 w-full p-2 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors font-medium text-xs mt-1"
           >
             <Download size={14} /> 下載 MP3
           </a>
        )}
      </div>
    </div>
  );
};

export default AudioExtractor;