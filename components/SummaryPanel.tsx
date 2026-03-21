import React, { useState } from 'react';
import { Sparkles, Copy, Check, FileText, Loader2, ArrowRight } from 'lucide-react';
import Button from './Button';
import { generateSummary } from '../services/geminiService';

interface SummaryPanelProps {
  transcriptionText: string;
}

const SummaryPanel: React.FC<SummaryPanelProps> = ({ transcriptionText }) => {
  const [summary, setSummary] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!transcriptionText || transcriptionText.length < 50) {
      setError("轉錄內容太短，無法生成摘要。");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await generateSummary(transcriptionText);
      setSummary(result);
    } catch (err: any) {
      setError(err.message || "生成摘要失敗");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-full overflow-hidden transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-900/30 shrink-0">
        <div className="flex items-center gap-2 text-indigo-800 dark:text-indigo-300 font-semibold">
          <Sparkles size={18} className="text-indigo-600 dark:text-indigo-400" />
          <span>AI 智能摘要 (問答版)</span>
        </div>
        
        {/* Actions */}
        <div className="flex gap-2">
            {summary && (
                <Button 
                    variant="ghost" 
                    onClick={handleCopy} 
                    className="text-xs h-8 px-2 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-slate-700"
                >
                    {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    {copied ? "已複製" : "複製內容"}
                </Button>
            )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin bg-white dark:bg-slate-900 relative">
        {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg mb-4 flex items-center border border-red-100 dark:border-red-900/50">
                <AlertCircle size={16} className="mr-2" />
                {error}
            </div>
        )}

        {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 space-y-4">
                <div className="relative">
                    <Loader2 size={48} className="animate-spin text-indigo-500 dark:text-indigo-400" />
                    <Sparkles size={20} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-300 dark:text-indigo-600" />
                </div>
                <div className="text-center">
                    <p className="text-indigo-800 dark:text-indigo-200 font-medium text-lg">AI 正在分析內容...</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">正在整合背景資訊與關鍵對話 (保留 50% 細節)</p>
                </div>
            </div>
        ) : summary ? (
            <div className="animate-fade-in">
                <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-lg border border-slate-100 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-mono whitespace-pre-wrap shadow-inner">
                    {summary}
                </div>
                 <div className="mt-4 flex justify-end">
                    <Button 
                        onClick={handleGenerate} 
                        className="text-xs h-9 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm dark:bg-indigo-700 dark:hover:bg-indigo-600"
                    >
                        <Sparkles size={14} className="mr-1" />
                        重新生成摘要
                    </Button>
                </div>
            </div>
        ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-4 text-indigo-500 dark:text-indigo-400">
                    <FileText size={32} />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">準備生成詳細摘要</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-8 leading-relaxed">
                    AI 將會分析您的轉錄內容，並生成一份包含背景資訊與重點經過的「問答式 (Q&A)」詳細摘要，確保保留原文至少 50% 的重要細節。
                </p>
                
                <Button 
                    onClick={handleGenerate} 
                    disabled={!transcriptionText}
                    className="h-12 text-base px-8 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg shadow-indigo-200 dark:shadow-none transition-all hover:scale-105"
                >
                    <Sparkles size={18} className="mr-2" />
                    立即生成摘要
                </Button>
                
                {!transcriptionText && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-4 bg-amber-50 dark:bg-amber-900/20 px-3 py-1 rounded-full border border-amber-100 dark:border-amber-900/30">
                        ⚠️ 請先完成語音轉錄
                    </p>
                )}
            </div>
        )}
      </div>
    </div>
  );
};

// Internal icon for error
import { AlertCircle } from 'lucide-react';

export default SummaryPanel;