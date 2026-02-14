
import React, { useState, useRef } from 'react';
import { Scissors, AlertTriangle, ArrowUpCircle, Info, Lock } from 'lucide-react';
import Button from './Button';

interface FileSplitterProps {
  onSelectSegment: (file: File, estimatedStartTime?: string) => void;
  isPro: boolean;
  onRequestUnlock: () => void;
}

const FileSplitter: React.FC<FileSplitterProps> = ({ onSelectSegment, isPro, onRequestUnlock }) => {
  const [file, setFile] = useState<File | null>(null);
  const [mediaDuration, setMediaDuration] = useState<number>(0);
  const [splitMinutes, setSplitMinutes] = useState<number>(10);
  const [chunks, setChunks] = useState<{file: File, startTime: string}[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Format seconds to HH:MM:SS
  const formatTimeSeconds = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = Math.floor(totalSeconds % 60);
    
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    
    setFile(selected);
    setChunks([]);
    setMediaDuration(0);

    const objectUrl = URL.createObjectURL(selected);
    const media = document.createElement(selected.type.startsWith('video') ? 'video' : 'audio');
    media.preload = 'metadata';
    media.onloadedmetadata = () => {
      if (media.duration && media.duration !== Infinity) {
          setMediaDuration(media.duration);
      }
      URL.revokeObjectURL(objectUrl);
    };
    media.onerror = () => {
        URL.revokeObjectURL(objectUrl);
    };
    media.src = objectUrl;
  };

  const handleSplit = () => {
    if (!file) return;
    setIsProcessing(true);
    setChunks([]);

    let chunkSize = 0;
    
    if (mediaDuration > 0) {
        const avgBytesPerSec = file.size / mediaDuration;
        chunkSize = Math.floor(avgBytesPerSec * (splitMinutes * 60));
    } else {
        chunkSize = splitMinutes * 1024 * 1024 * 1.0; 
    }

    if (chunkSize < 500 * 1024) chunkSize = 500 * 1024;

    const totalSize = file.size;
    const newChunks: {file: File, startTime: string}[] = [];
    let start = 0;
    let idx = 0;

    const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    const extension = file.name.split('.').pop() || '';

    while (start < totalSize) {
      const end = Math.min(start + chunkSize, totalSize);
      const blob = file.slice(start, end);
      
      const chunkFile = new File([blob], `${baseName}_Part_${idx + 1}.${extension}`, { type: file.type });
      
      const currentStartTimeSeconds = idx * splitMinutes * 60;
      
      newChunks.push({
        file: chunkFile,
        startTime: formatTimeSeconds(currentStartTimeSeconds)
      });
      
      start = end;
      idx++;
    }

    setChunks(newChunks);
    setIsProcessing(false);
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden transition-colors">
      
      {/* Lock Overlay */}
      {!isPro && (
        <div className="absolute inset-0 z-10 bg-white/60 dark:bg-slate-900/60 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-4">
            <div className="p-3 bg-slate-800 dark:bg-black text-white rounded-full mb-3 shadow-lg">
                <Lock size={24} />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-white">完全版功能</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 max-w-[200px]">
                檔案分割器僅供完全版用戶使用。請輸入通行碼解鎖。
            </p>
            <Button onClick={onRequestUnlock} className="text-xs h-8 shadow-md bg-gradient-to-r from-blue-600 to-indigo-600">
                輸入通行碼
            </Button>
        </div>
      )}

      <div className="flex items-center gap-2 mb-3 text-amber-600 dark:text-amber-500">
        <Scissors size={20} />
        <h3 className="font-semibold">長檔案分割器</h3>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        如果錄音極長 (>1小時)，請先分割。系統會根據檔案長度自動計算分割大小。
      </p>

      <div className={`flex flex-col gap-3 transition-opacity ${!isPro ? 'opacity-20 pointer-events-none' : ''}`}>
        <div>
           <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">選擇原始檔案</label>
           <input 
            type="file" 
            ref={fileInputRef}
            className="block w-full text-xs text-slate-500 dark:text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100"
            onChange={handleFileChange}
          />
          {mediaDuration > 0 && (
             <p className="text-[10px] text-green-600 dark:text-green-400 mt-1 flex items-center">
                <Info size={10} className="mr-1"/> 
                已偵測長度: {formatTimeSeconds(mediaDuration)} (將依此優化分割精準度)
             </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">每段長度 (分鐘)</label>
          <input 
            type="number" 
            min="1" 
            max="60"
            value={splitMinutes}
            onChange={(e) => setSplitMinutes(parseInt(e.target.value))}
            className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <Button onClick={handleSplit} disabled={!file || isProcessing} className="w-full text-sm">
          {isProcessing ? '處理中...' : '開始分割'}
        </Button>
      </div>

      {chunks.length > 0 && (
        <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg animate-fade-in">
          <h4 className="font-medium text-xs text-slate-800 dark:text-slate-200 mb-2">已分割 ({chunks.length})：</h4>
          <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto scrollbar-thin">
            {chunks.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded shadow-sm">
                <div className="min-w-0 mr-2 flex-1">
                  <p className="font-medium text-xs text-slate-700 dark:text-slate-300 truncate">{item.file.name}</p>
                  <p className="text-[10px] text-slate-400">
                    Start: {item.startTime} (Est)
                  </p>
                </div>
                <Button 
                  variant="secondary" 
                  className="text-[10px] py-1 px-2 h-6 whitespace-nowrap dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300"
                  onClick={() => {
                    onSelectSegment(item.file, item.startTime);
                  }}
                >
                  <ArrowUpCircle size={12} className="mr-1"/> 載入
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileSplitter;
