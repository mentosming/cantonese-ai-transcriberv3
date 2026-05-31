import React, { useState, useRef } from 'react';
import { Scissors, AlertTriangle, ArrowUpCircle, Info, Lock, Crown, Star, Check } from 'lucide-react';
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

    // Try to get duration to calculate bitrate accurately
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

    // Calculate Chunk Size based on duration if available (Accuracy improvement)
    let chunkSize = 0;
    
    if (mediaDuration > 0) {
        // Average bytes per second
        const avgBytesPerSec = file.size / mediaDuration;
        // Target chunk size
        chunkSize = Math.floor(avgBytesPerSec * (splitMinutes * 60));
    } else {
        // Fallback Heuristic: 
        // 1MB per minute (Approx 130kbps). 
        // Previously 1.5MB/min caused files to be too long if bitrate was low.
        chunkSize = splitMinutes * 1024 * 1024 * 1.0; 
    }

    // Safety: Ensure chunk size is at least 500KB to avoid creating thousands of tiny files for bad metadata
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
      
      // Calculate estimated label start time
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
    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors h-[400px] flex flex-col">
      
      {/* Lock Overlay (upgrade promotion) */}
      {!isPro && (
        <div className="absolute inset-0 z-20 bg-surface/95 dark:bg-ink-900/95 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-6 text-ink dark:text-white">
            <div className="absolute top-4 right-4 opacity-[0.06] rotate-12 pointer-events-none">
                <Crown size={80} className="text-teal-500" />
            </div>

            <div className="p-3 bg-gradient-to-br from-teal-400 to-teal-600 text-white rounded-2xl mb-4 shadow-[0_8px_20px_-6px_rgba(17,156,137,0.6)]">
                <Scissors size={26} />
            </div>

            <h3 className="font-display font-bold text-lg mb-2 flex items-center gap-2">
                解鎖長檔案分割
                <Star size={15} className="text-teal-400 fill-teal-400" />
            </h3>

            <p className="text-xs text-ink-muted dark:text-paper-muted mb-6 max-w-[260px] leading-relaxed">
                錄音太長轉唔到？Pro 支援<strong>自動智能切割</strong>長錄音 ({'>'} 1小時)，配合無限時長轉錄，輕鬆處理大型會議。
            </p>

            <div className="flex flex-col gap-2.5 w-full max-w-[240px]">
                 <button
                    onClick={onRequestUnlock}
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-teal-500 hover:bg-teal-600 active:scale-[0.98] text-white text-sm font-semibold rounded-xl shadow-[0_4px_12px_-2px_rgba(17,156,137,0.5)] transition-all"
                 >
                    <Crown size={16} />
                    <span>升級方案 / 解鎖 Pro</span>
                 </button>
            </div>

            <div className="mt-4 flex items-center gap-3 text-[10px] text-ink-faint dark:text-paper-muted">
                <span className="flex items-center gap-1"><Check size={10}/> 無限時長</span>
                <span className="flex items-center gap-1"><Check size={10}/> 智能分割</span>
                <span className="flex items-center gap-1"><Check size={10}/> 優先處理</span>
            </div>
        </div>
      )}

      {/* Actual Content (Blurred/Disabled visually behind overlay) */}
      <div className={`flex flex-col h-full ${!isPro ? 'opacity-30 blur-[1px]' : ''}`}>
        <div className="flex items-center gap-2 mb-3 text-teal-600 dark:text-teal-400 shrink-0">
            <Scissors size={20} />
            <h3 className="font-semibold">長檔案分割器</h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 shrink-0">
            如果錄音極長 ({'>'} 1小時)，請先分割。系統會根據檔案長度自動計算分割大小。
        </p>

        <div className="flex flex-col gap-3 shrink-0">
            <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">選擇原始檔案</label>
            <input 
                type="file" 
                ref={fileInputRef}
                className="block w-full text-xs text-slate-500 dark:text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-50 dark:file:bg-teal-500/20 file:text-teal-700 dark:file:text-teal-300 hover:file:bg-teal-100"
                onChange={handleFileChange}
                disabled={!isPro}
            />
            {mediaDuration > 0 && (
                <p className="text-[10px] text-green-600 dark:text-green-400 mt-1 flex items-center">
                    <Info size={10} className="mr-1"/> 
                    已偵測長度: {formatTimeSeconds(mediaDuration)}
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
                disabled={!isPro}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
            />
            </div>
            <Button onClick={handleSplit} disabled={!file || isProcessing || !isPro} className="w-full text-sm">
            {isProcessing ? '處理中...' : '開始分割'}
            </Button>
        </div>

        {chunks.length > 0 && (
            <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg animate-fade-in flex-1 overflow-hidden flex flex-col min-h-0">
            <h4 className="font-medium text-xs text-slate-800 dark:text-slate-200 mb-2 shrink-0">已分割 ({chunks.length})：</h4>
            <div className="flex flex-col gap-2 overflow-y-auto scrollbar-thin flex-1">
                {chunks.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm">
                    <div className="min-w-0 mr-2 flex-1">
                    <p className="font-medium text-xs text-slate-700 dark:text-slate-300 truncate">{item.file.name}</p>
                    <p className="text-[10px] text-slate-400">
                        Start: {item.startTime} (Est)
                    </p>
                    </div>
                    <Button 
                    variant="secondary" 
                    className="text-[10px] py-1 px-2 h-6 whitespace-nowrap dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-600"
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
    </div>
  );
};

export default FileSplitter;