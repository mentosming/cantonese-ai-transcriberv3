import React, { useState, useEffect } from 'react';
import { ShieldCheck, Key, Copy, Check, LogOut, Loader2, AlertCircle, CalendarClock, Users, BarChart3, FileText, RefreshCw, X, CreditCard } from 'lucide-react';
import Button from './Button';
import { createNewLicense } from '../services/authService';
import { listUsers, listUsageLogs, listPurchases, getTranscript, summarizeUsage, UsageLog, Purchase } from '../services/adminService';
import { UserProfile } from '../types';

interface AdminPanelProps {
  onLogout: () => void;
}

type Tab = 'dashboard' | 'purchases' | 'license';

const fmtDate = (ms?: number) => (ms ? new Date(ms).toLocaleString('zh-HK', { hour12: false }) : '—');

const AdminPanel: React.FC<AdminPanelProps> = ({ onLogout }) => {
  const [tab, setTab] = useState<Tab>('dashboard');

  // License generator state
  const [generatedKey, setGeneratedKey] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [duration, setDuration] = useState('30');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Dashboard state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState('');
  const [activeLog, setActiveLog] = useState<UsageLog | null>(null);
  const [activeText, setActiveText] = useState('');
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  const loadData = async () => {
    setLoadingData(true);
    setDataError('');
    try {
      const [u, l, p] = await Promise.all([listUsers(), listUsageLogs(300), listPurchases(300)]);
      setUsers(u);
      setLogs(l);
      setPurchases(p);
    } catch (e: any) {
      setDataError(e?.message || '載入失敗（請確認 Firestore 規則允許 admin 讀取）');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => { if (tab === 'dashboard' || tab === 'purchases') loadData(); }, [tab]);

  const revenueTotal = purchases.reduce((a, p) => a + (p.amount || 0), 0);
  const money = (cents?: number, cur?: string) => cents == null ? '—' : `${(cur || 'HKD').toUpperCase()} $${(cents / 100).toFixed(2)}`;

  useEffect(() => {
    if (!activeLog?.id) { setActiveText(''); return; }
    setActiveText(activeLog.preview || '載入中...');
    getTranscript(activeLog.id).then((t) => setActiveText(t || activeLog.preview || ''));
  }, [activeLog?.id]);

  const handleGenerate = async () => {
    setIsLoading(true); setError(''); setGeneratedKey(''); setExpiryDate('');
    try {
      const result = await createNewLicense(duration);
      setGeneratedKey(result.key); setExpiryDate(result.expiresAtDisplay); setCopied(false);
    } catch (err: any) {
      setError(err.message || '生成失敗');
    } finally { setIsLoading(false); }
  };

  const stats = summarizeUsage(logs);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface dark:bg-ink-900 border border-line dark:border-ink-700 rounded-2xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="bg-teal-600 text-white px-5 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-lg text-white"><ShieldCheck size={22} /></div>
            <div><h2 className="text-lg font-bold">管理員後台</h2><p className="text-xs text-teal-100">用戶 · 用量 · 內容</p></div>
          </div>
          <div className="flex items-center gap-2">
            {tab === 'dashboard' && (
              <button onClick={loadData} className="p-2 text-teal-100 hover:text-white" title="重新整理"><RefreshCw size={18} className={loadingData ? 'animate-spin' : ''} /></button>
            )}
            <button onClick={onLogout} className="p-2 text-teal-100 hover:text-white" title="登出"><LogOut size={18} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-line dark:border-ink-700 bg-surface dark:bg-ink-900 px-4">
          {([['dashboard', '用戶與用量', BarChart3], ['purchases', '購買記錄', CreditCard], ['license', '通行碼', Key]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-3 text-sm font-medium flex items-center gap-2 border-b-2 -mb-px transition-colors ${tab === id ? 'border-amber-400 text-amber-400' : 'border-transparent text-ink-muted dark:text-paper-muted hover:text-ink dark:hover:text-white'}`}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {tab === 'dashboard' ? (
            <div className="h-full flex flex-col">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 p-4">
                {[['總用戶', users.length, Users], ['轉錄次數', stats.totalJobs, FileText], ['總分鐘數', stats.totalMinutes, BarChart3]].map(([label, val, Icon]: any) => (
                  <div key={label} className="bg-canvas-sunk dark:bg-ink-800/60 border border-line dark:border-ink-700 rounded-xl p-3 flex items-center gap-3">
                    <Icon size={20} className="text-teal-400" />
                    <div><div className="text-2xl font-bold text-ink dark:text-white">{val}</div><div className="text-[11px] text-ink-muted dark:text-paper-muted">{label}</div></div>
                  </div>
                ))}
              </div>

              {dataError && <div className="mx-4 mb-2 p-3 bg-red-500/10 text-red-300 text-xs rounded-lg border border-red-500/30">{dataError}</div>}

              <div className="flex-1 grid grid-cols-2 gap-3 px-4 pb-4 min-h-0">
                {/* Usage logs */}
                <div className="flex flex-col min-h-0 border border-line dark:border-ink-700 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-canvas-sunk dark:bg-ink-800/50 text-xs font-semibold text-ink-muted dark:text-paper-muted border-b border-line dark:border-ink-700">轉錄記錄（點擊睇內容）</div>
                  <div className="flex-1 overflow-y-auto scrollbar-thin">
                    {logs.map((l) => (
                      <button key={l.id} onClick={() => setActiveLog(l)} className={`w-full text-left px-3 py-2 border-b border-line dark:border-ink-700/60 text-xs ${activeLog?.id === l.id ? 'bg-teal-500/10' : 'hover:bg-canvas-sunk dark:hover:bg-ink-800/40'}`}>
                        <div className="text-ink dark:text-paper truncate font-medium">{l.fileName || '未命名'}</div>
                        <div className="text-ink-faint dark:text-paper-muted truncate">{l.email || l.uid?.slice(0, 8)} · {l.durationMinutes}分 · {fmtDate(l.createdAt)}</div>
                      </button>
                    ))}
                    {!loadingData && logs.length === 0 && <div className="p-4 text-center text-ink-faint dark:text-paper-muted text-xs">暫無記錄</div>}
                  </div>
                </div>

                {/* Right: users + transcript viewer */}
                <div className="flex flex-col min-h-0 gap-3">
                  <div className="flex-1 flex flex-col min-h-0 border border-line dark:border-ink-700 rounded-xl overflow-hidden">
                    <div className="px-3 py-2 bg-canvas-sunk dark:bg-ink-800/50 text-xs font-semibold text-ink-muted dark:text-paper-muted border-b border-line dark:border-ink-700">用戶</div>
                    <div className="flex-1 overflow-y-auto scrollbar-thin">
                      {users.map((u) => (
                        <div key={u.uid} className="px-3 py-2 border-b border-line dark:border-ink-700/60 text-xs flex justify-between items-center">
                          <span className="text-ink dark:text-paper truncate">{u.email || u.uid.slice(0, 10)} {u.isAdmin && <span className="text-amber-400">(admin)</span>}</span>
                          <span className="text-ink-muted dark:text-paper-muted shrink-0">{u.plan} · {u.creditMinutes ?? 0}分 · {u.subscriptionStatus}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {activeLog && (
                    <div className="flex-1 flex flex-col min-h-0 border border-line dark:border-ink-700 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 bg-canvas-sunk dark:bg-ink-800/50 text-xs font-semibold text-ink-muted dark:text-paper-muted border-b border-line dark:border-ink-700 flex justify-between items-center">
                        <span className="truncate">內容：{activeLog.fileName}</span>
                        <button onClick={() => setActiveLog(null)} className="text-ink-faint dark:text-paper-muted hover:text-ink dark:hover:text-paper"><X size={14} /></button>
                      </div>
                      <pre className="flex-1 overflow-y-auto scrollbar-thin p-3 text-[11px] text-ink-muted dark:text-paper-muted whitespace-pre-wrap font-mono">{activeText}</pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : tab === 'purchases' ? (
            <div className="h-full flex flex-col">
              <div className="grid grid-cols-2 gap-3 p-4">
                <div className="bg-canvas-sunk dark:bg-ink-800/60 border border-line dark:border-ink-700 rounded-xl p-3 flex items-center gap-3">
                  <CreditCard size={20} className="text-teal-400" />
                  <div><div className="text-2xl font-bold text-ink dark:text-white">{purchases.length}</div><div className="text-[11px] text-ink-muted dark:text-paper-muted">交易筆數</div></div>
                </div>
                <div className="bg-canvas-sunk dark:bg-ink-800/60 border border-line dark:border-ink-700 rounded-xl p-3 flex items-center gap-3">
                  <BarChart3 size={20} className="text-teal-400" />
                  <div><div className="text-2xl font-bold text-ink dark:text-white">{money(revenueTotal)}</div><div className="text-[11px] text-ink-muted dark:text-paper-muted">總收入（已記錄）</div></div>
                </div>
              </div>
              {dataError && <div className="mx-4 mb-2 p-3 bg-red-500/10 text-red-300 text-xs rounded-lg border border-red-500/30">{dataError}</div>}
              <div className="flex-1 overflow-y-auto scrollbar-thin px-4 pb-4">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface dark:bg-ink-900">
                    <tr className="text-left text-ink-faint dark:text-paper-muted border-b border-line dark:border-ink-700">
                      <th className="py-2 font-medium">時間</th><th className="font-medium">用戶</th><th className="font-medium">類型</th><th className="font-medium">分鐘</th><th className="font-medium">金額</th><th className="font-medium">來源</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((p) => (
                      <tr key={p.id} className="border-b border-line dark:border-ink-700/60 text-ink dark:text-paper">
                        <td className="py-2 text-ink-muted dark:text-paper-muted whitespace-nowrap">{fmtDate(p.createdAt)}</td>
                        <td className="truncate max-w-[140px]">{p.email || p.uid?.slice(0, 10)}</td>
                        <td>{p.type}{p.productId ? ` · ${p.productId}` : ''}</td>
                        <td>{p.minutes ?? '—'}</td>
                        <td className="font-semibold">{money(p.amount, p.currency)}</td>
                        <td><span className={`px-1.5 py-0.5 rounded text-[10px] ${p.source === 'revenuecat' ? 'bg-blue-500/15 text-blue-500' : 'bg-teal-500/15 text-teal-600 dark:text-teal-300'}`}>{p.source === 'revenuecat' ? 'iOS' : 'Stripe'}</span></td>
                      </tr>
                    ))}
                    {!loadingData && purchases.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-ink-faint dark:text-paper-muted">暫無購買記錄</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* License generator */
            <div className="p-6 max-w-md mx-auto space-y-5">
              <div>
                <h3 className="font-semibold text-ink dark:text-white mb-1">生成新通行碼</h3>
                <p className="text-sm text-ink-muted dark:text-paper-muted mb-4">選擇有效期，系統會喺資料庫建立授權（相容舊用戶）。</p>
                <label className="block text-xs font-medium text-ink-muted dark:text-paper-muted mb-1 flex items-center gap-1"><CalendarClock size={14} /> 有效期限</label>
                <select value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full px-3 py-2 bg-canvas-sunk dark:bg-ink-800 border border-line dark:border-ink-700 text-ink dark:text-paper rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none mb-4">
                  <option value="7">7 天 (試用)</option>
                  <option value="30">30 天</option>
                  <option value="90">90 天</option>
                  <option value="365">365 天</option>
                  <option value="lifetime">永久有效</option>
                </select>
                <div className={`h-16 flex flex-col items-center justify-center rounded-xl border-2 border-dashed mb-3 ${generatedKey ? 'border-amber-500 bg-amber-500/10' : 'border-line dark:border-ink-700 bg-canvas-sunk dark:bg-ink-800/40'}`}>
                  {generatedKey ? (
                    <><span className="text-xl font-mono font-bold text-amber-400 tracking-wider select-all">{generatedKey}</span><span className="text-[10px] text-amber-300/70 mt-1">有效期至: {expiryDate}</span></>
                  ) : <span className="text-ink-faint dark:text-paper-muted text-sm">尚未生成</span>}
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleGenerate} isLoading={isLoading} className="flex-1 h-11"><Key size={16} className="mr-2" /> 生成</Button>
                  {generatedKey && <Button onClick={() => { navigator.clipboard.writeText(generatedKey); setCopied(true); setTimeout(() => setCopied(false), 2000); }} variant="secondary" className="w-20 h-11">{copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}</Button>}
                </div>
                {error && <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start"><AlertCircle size={16} className="text-red-400 mr-2 shrink-0 mt-0.5" /><p className="text-xs text-red-300 break-all">{error}</p></div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
