
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Copy, Download, FileText, Check, FileSpreadsheet, Trash2, Table as TableIcon, AlignLeft, CheckSquare, Square, Sparkles, ArrowRight, Upload, Subtitles, Type } from 'lucide-react';
import Button from './Button';

interface TranscriptionViewProps {
  text: string;
  status: string;
  onClear: () => void;
  onUpdate?: (newText: string) => void;
  onSwitchToSummary?: () => void;
  className?: string;
}

interface RowData {
    id: number;
    type: 'segment' | 'separator' | 'raw';
    time: string; 
    speaker: string;
    content: string;
    rawLine: string;
    startSeconds?: number;
    endSeconds?: number;
}

// Time Helper Functions
const parseTimeToSeconds = (timeStr: string): number => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    
    // HH:MM:SS or MM:SS
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
};

const formatSecondsToTime = (totalSeconds: number): string => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);

    const mm = m.toString().padStart(2, '0');
    const ss = s.toString().padStart(2, '0');

    if (h > 0) {
        return `${h.toString().padStart(2, '0')}:${mm}:${ss}`;
    }
    return `${mm}:${ss}`;
};

// SRT Time Formatter (HH:MM:SS,ms)
const formatSecondsToSRT = (totalSeconds: number): string => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    const ms = Math.floor((totalSeconds % 1) * 1000);

    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
};

const TranscriptionView: React.FC<TranscriptionViewProps> = ({ text, status, onClear, onUpdate, onSwitchToSummary, className }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'text'>('table');
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  
  // Parse text into rows and apply timestamp offsets dynamically
  const rows: RowData[] = useMemo(() => {
    const lines = text.split('\n');
    let currentOffsetSeconds = 0;

    return lines.map((line, index) => {
        const trimmed = line.trim();
        
        // 1. Check for Separator/Header with Start Time
        const separatorMatch = trimmed.match(/Start:\s*(\d{1,2}:\d{2}(?::\d{2})?)/);
        
        if (trimmed.startsWith('--- [') || trimmed.startsWith('--- [接續檔案')) {
             if (separatorMatch) {
                 currentOffsetSeconds = parseTimeToSeconds(separatorMatch[1]);
             }
             return { id: index, type: 'separator', time: '', speaker: '', content: trimmed.replace(/---/g, '').trim(), rawLine: line };
        }

        if (!trimmed) {
            return { id: index, type: 'raw', time: '', speaker: '', content: '', rawLine: line };
        }

        // 2. Check for Timestamped Segment
        // Regex handles spaces more flexibly now: [00:00-00:05] or [00:00 - 00:05]
        const match = line.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*-?\s*(\d{1,2}:\d{2}(?::\d{2})?))?\]\s*(?:(.*?):)?\s*(.*)/);
        
        if (match) {
            const rawStartTime = match[1];
            const rawEndTime = match[2];
            const speaker = match[3] || '';
            const content = match[4];

            const startSec = parseTimeToSeconds(rawStartTime) + currentOffsetSeconds;
            const newStartTime = formatSecondsToTime(startSec);
            let endSec = 0;
            
            let newTimeStr = newStartTime;
            let rawLineTimeStr = `[${newStartTime}]`;

            if (rawEndTime) {
                endSec = parseTimeToSeconds(rawEndTime) + currentOffsetSeconds;
                const newEndTime = formatSecondsToTime(endSec);
                newTimeStr = `${newStartTime} - ${newEndTime}`;
                rawLineTimeStr = `[${newStartTime} - ${newEndTime}]`;
            } else {
                // If no end time, we will rely on next segment or default in SRT export
                endSec = startSec + 2; 
            }

            const newRawLine = `${rawLineTimeStr} ${speaker ? speaker + ': ' : ''}${content}`;

            return {
                id: index,
                type: 'segment',
                time: newTimeStr,
                speaker: speaker,
                content: content,
                rawLine: newRawLine,
                startSeconds: startSec,
                endSeconds: rawEndTime ? endSec : undefined // Mark as undefined if originally missing
            };
        }
        
        return { id: index, type: 'raw', time: '', speaker: '', content: line, rawLine: line };
    });
  }, [text]);

  // Auto-scroll
  useEffect(() => {
    if (status === 'transcribing') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [text, status, viewMode]);

  const getProcessedText = () => rows.map(r => r.rawLine).join('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(getProcessedText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([getProcessedText()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
  };

  const handleDownloadSRT = () => {
      let srtContent = "";
      let counter = 1;

      // Extract only segments for easier index lookahead
      const segments = rows.filter(r => r.type === 'segment');

      segments.forEach((row, idx) => {
          if (row.startSeconds !== undefined) {
              // Smart End Time Logic
              let end = row.endSeconds;
              
              if (end === undefined) {
                  // If end time is missing, look at the NEXT segment's start time
                  if (idx + 1 < segments.length && segments[idx+1].startSeconds) {
                      const nextStart = segments[idx+1].startSeconds!;
                      // Gap shouldn't be too huge (e.g. > 10s silence). 
                      // If next start is 5s away, end this one at 5s.
                      if (nextStart > row.startSeconds!) {
                          end = Math.min(nextStart, row.startSeconds! + 7); // Cap at 7s duration if next segment is far
                      }
                  } 
                  
                  // Fallback if still undefined
                  if (end === undefined) {
                      end = row.startSeconds! + 3;
                  }
              }
              
              // Ensure end > start (Minimum 1s duration)
              if (end <= row.startSeconds!) end = row.startSeconds! + 1;

              srtContent += `${counter}\n`;
              srtContent += `${formatSecondsToSRT(row.startSeconds)} --> ${formatSecondsToSRT(end)}\n`;
              srtContent += `${row.speaker ? row.speaker + ': ' : ''}${row.content}\n\n`;
              counter++;
          }
      });

      if (!srtContent) {
          alert("無法生成 SRT：找不到有效的時間戳片段。");
          return;
      }

      const blob = new Blob([srtContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `subtitle_${new Date().toISOString().slice(0,10)}.srt`;
      a.click();
  };

  const handleDownloadCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; 
    csvContent += "Time,Speaker,Content\n";
    rows.forEach(row => {
        if (row.type === 'segment') {
            csvContent += `"${row.time}","${row.speaker}","${row.content.replace(/"/g, '""')}"\n`;
        } else if (row.type === 'separator') {
             csvContent += `,,"${row.rawLine.replace(/"/g, '""')}"\n`;
        } else if (row.type === 'raw' && row.content.trim()) {
             csvContent += `,,"${row.content.replace(/"/g, '""')}"\n`;
        }
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `transcription_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (!file || !onUpdate) return;
     const reader = new FileReader();
     reader.onload = (event) => {
         const rawText = event.target?.result as string;
         if (!rawText) return;
         let input = rawText.charCodeAt(0) === 0xFEFF ? rawText.slice(1) : rawText;
         const lines = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
         let importString = "";
         let validRowsCount = 0;
         
         // Simple CSV Parse
         for(let i=0; i<lines.length; i++) {
             const line = lines[i].trim();
             if(!line || line.startsWith('---') || (i<5 && line.toLowerCase().includes('time,speaker'))) continue;
             const parts = line.split(','); 
             importString += line + "\n";
             validRowsCount++;
         }
         onUpdate(importString); 
     };
     reader.readAsText(file);
     e.target.value = '';
  };

  // Editing Logic
  const updateRow = (index: number, field: 'time' | 'speaker' | 'content', value: string) => {
    if (!onUpdate) return;
    const row = rows[index];
    if (row.type !== 'segment') {
         const lines = text.split('\n');
         lines[index] = value;
         onUpdate(lines.join('\n'));
         return;
    }
    const newSpeaker = field === 'speaker' ? value : row.speaker;
    const newContent = field === 'content' ? value : row.content;
    const lines = text.split('\n');
    const originalLine = lines[index];
    if (field === 'content' || field === 'speaker') {
         const timeMatch = originalLine.match(/^(\[.*?\])/);
         const originalTimestampPrefix = timeMatch ? timeMatch[1] : `[${row.time}]`;
         const spk = newSpeaker ? `${newSpeaker}: ` : '';
         lines[index] = `${originalTimestampPrefix} ${spk}${newContent}`;
    } else if (field === 'time') {
         const spk = newSpeaker ? `${newSpeaker}: ` : '';
         lines[index] = `[${value}] ${spk}${newContent}`;
    }
    onUpdate(lines.join('\n'));
  };

  const toggleSelect = (index: number) => {
    const newSet = new Set(selectedIndices);
    if (newSet.has(index)) newSet.delete(index);
    else newSet.add(index);
    setSelectedIndices(newSet);
  };

  const toggleSelectAll = () => {
     if (selectedIndices.size === rows.length) setSelectedIndices(new Set());
     else setSelectedIndices(new Set(rows.map((_, i) => i)));
  };

  const handleDeleteSelected = () => {
      if (!onUpdate) return;
      if (window.confirm(`確定要刪除選取的 ${selectedIndices.size} 行嗎？`)) {
          const lines = text.split('\n');
          const newLines = lines.filter((_, idx) => !selectedIndices.has(idx));
          onUpdate(newLines.join('\n'));
          setSelectedIndices(new Set());
      }
  };

  const renderTable = () => {
    const tableRows: React.ReactNode[] = [];
    const isTranscribing = status === 'transcribing';

    rows.forEach((row, index) => {
        if (!row.content.trim() && row.type === 'raw') return;
        if (row.type === 'separator') {
            tableRows.push(
                <tr key={index} className="bg-blue-50 dark:bg-blue-900/20">
                    <td className="w-10 px-2 py-2 text-center border-b border-slate-100 dark:border-slate-700"></td>
                    <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 text-center border-b border-slate-100 dark:border-slate-700 font-mono">
                        {row.content}
                    </td>
                </tr>
            );
            return;
        }

        const isSelected = selectedIndices.has(index);

        tableRows.push(
            <tr key={index} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-b border-slate-100 dark:border-slate-700 last:border-0 group ${isSelected ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}`}>
                <td className="px-2 py-3 align-top w-10 text-center">
                    {!isTranscribing && (
                        <button 
                            onClick={() => toggleSelect(index)}
                            className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                            {isSelected ? <CheckSquare size={16} className="text-blue-600 dark:text-blue-400"/> : <Square size={16} />}
                        </button>
                    )}
                </td>
                <td className="px-2 py-2 align-top w-36">
                     {row.type === 'segment' ? (
                         <input 
                            type="text"
                            value={row.time}
                            disabled={isTranscribing}
                            onChange={(e) => updateRow(index, 'time', e.target.value)}
                            className="w-full bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-600 focus:border-blue-300 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-800 rounded px-1 py-0.5 text-xs font-mono text-slate-500 dark:text-slate-400 outline-none transition-all"
                         />
                     ) : null}
                </td>
                <td className="px-2 py-2 align-top w-28">
                    {row.type === 'segment' ? (
                        <input 
                            type="text"
                            value={row.speaker}
                            disabled={isTranscribing}
                            onChange={(e) => updateRow(index, 'speaker', e.target.value)}
                            className="w-full bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-600 focus:border-blue-300 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-800 rounded px-1 py-0.5 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none transition-all"
                        />
                    ) : null}
                </td>
                <td className="px-2 py-2 align-top">
                    <textarea 
                        value={row.content}
                        disabled={isTranscribing}
                        onChange={(e) => updateRow(index, 'content', e.target.value)}
                        rows={1}
                        style={{ height: 'auto', minHeight: '1.5rem' }}
                        onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = 'auto';
                            target.style.height = `${target.scrollHeight}px`;
                        }}
                        className={`w-full bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-600 focus:border-blue-300 dark:focus:border-blue-500 focus:bg-white dark:focus:bg-slate-800 rounded px-1 py-0.5 text-sm text-slate-800 dark:text-slate-200 leading-relaxed outline-none resize-none overflow-hidden transition-all`}
                    />
                </td>
            </tr>
        );
    });

    return (
        <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10 shadow-sm">
                <tr>
                    <th className="px-2 py-2 w-10 text-center">
                         {!isTranscribing && (
                            <button onClick={toggleSelectAll} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                                {selectedIndices.size > 0 && selectedIndices.size === rows.length ? <CheckSquare size={16}/> : <Square size={16}/>}
                            </button>
                         )}
                    </th>
                    <th className="px-2 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 w-36">時間</th>
                    <th className="px-2 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 w-28">說話者</th>
                    <th className="px-2 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">內容</th>
                </tr>
            </thead>
            <tbody>{tableRows}</tbody>
        </table>
    );
  };

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col transition-colors ${className || 'h-[650px]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-t-xl flex-wrap gap-2 shrink-0">
        <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold">
          <FileText size={20} className="text-blue-600 dark:text-blue-400" />
          結果
        </div>
        
        {/* Toolbar */}
        <div className="flex items-center gap-1 flex-wrap justify-end">
           {selectedIndices.size > 0 && viewMode === 'table' && (
                <Button variant="danger" onClick={handleDeleteSelected} className="text-xs h-8 px-2 mr-2">
                    <Trash2 size={14} className="mr-1"/> 刪除 ({selectedIndices.size})
                </Button>
           )}

           <div className="flex bg-slate-200 dark:bg-slate-700 rounded-lg p-1 mr-2">
              <button 
                onClick={() => setViewMode('table')}
                className={`p-1 rounded flex items-center gap-1 text-xs font-medium ${viewMode === 'table' ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
              >
                <TableIcon size={14} /> 表格
              </button>
              <button 
                onClick={() => setViewMode('text')}
                className={`p-1 rounded flex items-center gap-1 text-xs font-medium ${viewMode === 'text' ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
              >
                <AlignLeft size={14} /> 純文字
              </button>
           </div>
           
           {onSwitchToSummary && (
               <Button 
                variant="ghost" 
                onClick={onSwitchToSummary} 
                className="text-xs h-8 px-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30" 
               >
                 <Sparkles size={14} className="mr-1" /> AI 摘要 <ArrowRight size={14} className="ml-1"/>
               </Button>
           )}

           <Button variant="ghost" onClick={onClear} className="text-xs h-8 px-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30">
            <Trash2 size={14} />
          </Button>

          <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleImportCSV} />
          <Button variant="ghost" onClick={() => fileInputRef.current?.click()} className="text-xs h-8 px-2 text-slate-600 dark:text-slate-300">
             <Upload size={14} /> 導入
          </Button>

          <Button variant="ghost" onClick={handleCopy} className="text-xs h-8 px-2 text-slate-600 dark:text-slate-300">
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </Button>
          
          <Button variant="ghost" onClick={handleDownloadTxt} className="text-xs h-8 px-2 text-slate-600 dark:text-slate-300" title="下載 .txt">
            <Download size={14} /> TXT
          </Button>
           <Button variant="ghost" onClick={handleDownloadCSV} className="text-xs h-8 px-2 text-slate-600 dark:text-slate-300" title="下載 .csv">
            <FileSpreadsheet size={14} /> CSV
          </Button>
          <Button variant="ghost" onClick={handleDownloadSRT} className="text-xs h-8 px-2 text-slate-600 dark:text-slate-300" title="下載 .srt 字幕">
            <Subtitles size={14} /> SRT
          </Button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-800 scrollbar-thin relative min-h-0">
        {!text ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8 text-center">
            <TableIcon size={48} className="mb-4 opacity-20" />
            <p>轉錄內容將顯示於此...</p>
            <p className="text-xs mt-2 opacity-60">支援導入 CSV 檔案恢復編輯</p>
          </div>
        ) : (
            viewMode === 'text' ? (
                <div className="p-6 font-mono leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap text-sm">
                    {getProcessedText()}
                    <div ref={bottomRef} />
                </div>
            ) : (
                <div className="pb-4">
                    {renderTable()}
                    <div ref={bottomRef} />
                </div>
            )
        )}
      </div>
      
      {/* Footer Status */}
      <div className="p-2 border-t border-slate-100 dark:border-slate-700 text-xs text-center text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900 rounded-b-xl flex justify-between px-4 shrink-0">
        <span>字數統計: {getProcessedText().length}</span>
        {viewMode === 'table' && <span className="text-blue-600 dark:text-blue-400 hidden sm:inline">時間戳已自動校正 | 可點擊文字編輯</span>}
      </div>
    </div>
  );
};

export default TranscriptionView;
