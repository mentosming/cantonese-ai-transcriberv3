import React, { useEffect, useState } from 'react';
import { X, History, FileText, Copy, Check, Loader2, ArrowUpRight, Clock, Sparkles, CheckSquare, Square } from 'lucide-react';
import { listMyUsage, getTranscript, UsageLog } from '../services/adminService';

interface HistoryModalProps {
  uid: string;
  onClose: () => void;
  onLoad?: (transcript: string) => void; // restore a past transcript into the editor
  onAnalyze?: (logs: UsageLog[]) => void; // merge selected transcripts → billed AI analysis
}

const fmtDate = (ms: number) => new Date(ms).toLocaleString('zh-HK', { hour12: false });

const HistoryModal: React.FC<HistoryModalProps> = ({ uid, onClose, onLoad, onAnalyze }) => {
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState<UsageLog | null>(null);
  const [fullText, setFullText] = useState('');
  const [loadingText, setLoadingText] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id?: string) => {
    if (!id) return;
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await listMyUsage(uid);
        setLogs(data);
        setActive(data[0] || null);
      } catch (e: any) {
        setError(e?.message || '無法載入記錄');
      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  // Fetch full transcript lazily when a row is selected.
  useEffect(() => {
    if (!active?.id) { setFullText(''); return; }
    setLoadingText(true);
    setFullText(active.preview || '');
    getTranscript(active.id)
      .then((t) => setFullText(t || active.preview || ''))
      .finally(() => setLoadingText(false));
  }, [active?.id]);

  const copy = () => {
    if (!fullText) return;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-surface dark:bg-ink-900 border border-line dark:border-ink-700 rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-line dark:border-ink-700">
          <h3 className="font-bold text-ink dark:text-white flex items-center gap-2"><History size={18} className="text-teal-400" /> 我的轉換記錄</h3>
          <button onClick={onClose} className="text-ink-muted dark:text-paper-muted hover:text-ink dark:hover:text-white"><X size={20} /></button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-ink-muted dark:text-paper-muted"><Loader2 className="animate-spin mr-2" /> 載入中...</div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-red-400 text-sm px-6 text-center">{error}</div>
        ) : logs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-ink-faint dark:text-paper-muted">
            <FileText size={40} className="opacity-30 mb-3" />
            <p>暫無轉換記錄</p>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0">
            {/* List */}
            <div className="w-64 border-r border-line dark:border-ink-700 flex flex-col shrink-0">
              {onAnalyze && selected.size > 0 && (
                <div className="p-2 border-b border-line dark:border-ink-700 bg-canvas-sunk dark:bg-ink-800/40">
                  <button
                    onClick={() => onAnalyze(logs.filter((l) => l.id && selected.has(l.id)))}
                    className="w-full h-9 rounded-lg bg-gradient-to-r from-teal-500 to-teal-500 hover:from-teal-400 hover:to-teal-400 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Sparkles size={14} /> 合併 AI 分析 ({selected.size})
                  </button>
                  <p className="text-[10px] text-ink-faint dark:text-paper-muted mt-1 text-center">將按合併內容長度計費</p>
                </div>
              )}
              <div className="overflow-y-auto scrollbar-thin">
              {logs.map((l) => (
                <div
                  key={l.id}
                  className={`w-full flex items-start gap-2 px-3 py-3 border-b border-line dark:border-ink-700/60 transition-colors ${active?.id === l.id ? 'bg-teal-500/10' : 'hover:bg-canvas-sunk dark:hover:bg-ink-800/50'}`}
                >
                  {onAnalyze && (
                    <button onClick={() => toggle(l.id)} className="mt-0.5 text-ink-muted dark:text-paper-muted hover:text-teal-400 shrink-0" title="選取以合併分析">
                      {l.id && selected.has(l.id) ? <CheckSquare size={16} className="text-teal-400" /> : <Square size={16} />}
                    </button>
                  )}
                  <button onClick={() => setActive(l)} className="text-left flex-1 min-w-0">
                    <div className="text-sm text-ink dark:text-paper font-medium truncate">{l.fileName || '未命名'}</div>
                    <div className="text-[11px] text-ink-faint dark:text-paper-muted flex items-center gap-2 mt-1">
                      <Clock size={11} /> {fmtDate(l.createdAt)}
                    </div>
                    <div className="text-[11px] text-ink-faint dark:text-paper-muted mt-0.5">{l.durationMinutes} 分鐘 · {l.charCount} 字</div>
                  </button>
                </div>
              ))}
              </div>
            </div>
            {/* Viewer */}
            <div className="flex-1 flex flex-col min-w-0">
              {active && (
                <>
                  <div className="flex items-center justify-between px-4 py-2 border-b border-line dark:border-ink-700 gap-2">
                    <span className="text-xs text-ink-muted dark:text-paper-muted truncate">{active.fileName} · {active.model || ''}</span>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={copy} className="text-xs px-2 py-1 rounded bg-canvas-sunk dark:bg-ink-800 hover:bg-canvas-sunk dark:hover:bg-ink-700 text-ink dark:text-paper flex items-center gap-1">
                        {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />} 複製
                      </button>
                      {onLoad && (
                        <button onClick={() => { onLoad(fullText); onClose(); }} className="text-xs px-2 py-1 rounded bg-teal-500 hover:bg-teal-400 text-white flex items-center gap-1">
                          <ArrowUpRight size={13} /> 載入到編輯器
                        </button>
                      )}
                    </div>
                  </div>
                  <pre className="flex-1 overflow-y-auto scrollbar-thin p-4 text-sm text-ink-muted dark:text-paper-muted whitespace-pre-wrap font-mono leading-relaxed">
                    {loadingText ? '載入中...' : fullText}
                    {active.truncated && <span className="text-amber-400">\n\n[內容過長，已截斷顯示]</span>}
                  </pre>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryModal;
