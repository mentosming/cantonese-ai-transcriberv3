import React, { useState } from 'react';
import { ShieldCheck, Key, Copy, Check, LogOut, Loader2, AlertCircle, CalendarClock } from 'lucide-react';
import Button from './Button';
import { createNewLicense } from '../services/authService';

interface AdminPanelProps {
  onLogout: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onLogout }) => {
  const [generatedKey, setGeneratedKey] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>(''); // Display string for expiry
  const [duration, setDuration] = useState<string>('30'); // Default 30 days
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setIsLoading(true);
    setError('');
    setGeneratedKey('');
    setExpiryDate('');
    
    try {
        const result = await createNewLicense(duration);
        setGeneratedKey(result.key);
        setExpiryDate(result.expiresAtDisplay);
        setCopied(false);
    } catch (err: any) {
        console.error("Generate License Error:", err);
        const msg = err.message || (typeof err === 'string' ? err : "生成失敗 (未知錯誤)");
        setError(msg);
    } finally {
        setIsLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-500 rounded-lg text-slate-900">
                    <ShieldCheck size={24} />
                </div>
                <div>
                    <h2 className="text-xl font-bold">管理員後台</h2>
                    <p className="text-xs text-slate-400">系統權限管理</p>
                </div>
            </div>
            <button onClick={onLogout} className="text-slate-400 hover:text-white transition-colors" title="登出">
                <LogOut size={20} />
            </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
            <div>
                <h3 className="font-semibold text-slate-800 mb-2">生成新通行碼</h3>
                <p className="text-sm text-slate-500 mb-4">
                    請選擇有效期，系統將於資料庫建立授權。
                </p>

                {/* Duration Selector */}
                <div className="mb-4">
                    <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1">
                        <CalendarClock size={14} /> 有效期限
                    </label>
                    <select 
                        value={duration} 
                        onChange={(e) => setDuration(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        <option value="7">7 天 (試用)</option>
                        <option value="30">30 天 (1 個月)</option>
                        <option value="90">90 天 (1 季)</option>
                        <option value="180">180 天 (半年)</option>
                        <option value="365">365 天 (1 年)</option>
                        <option value="lifetime">永久有效 (Lifetime)</option>
                    </select>
                </div>

                <div className="flex flex-col gap-3">
                    <div className={`h-16 flex flex-col items-center justify-center bg-slate-100 rounded-xl border-2 border-dashed ${generatedKey ? 'border-blue-500 bg-blue-50' : 'border-slate-300'}`}>
                        {generatedKey ? (
                            <>
                                <span className="text-xl font-mono font-bold text-blue-700 tracking-wider select-all">
                                    {generatedKey}
                                </span>
                                <span className="text-[10px] text-blue-400 mt-1">
                                    有效期至: {expiryDate}
                                </span>
                            </>
                        ) : (
                            <span className="text-slate-400 text-sm">尚未生成</span>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <Button onClick={handleGenerate} isLoading={isLoading} className="flex-1 h-12">
                            <Key size={18} className="mr-2"/> 生成
                        </Button>
                        {generatedKey && (
                            <Button onClick={handleCopy} variant="secondary" className="w-24 h-12">
                                {copied ? <Check size={18} className="text-green-600"/> : <Copy size={18}/>}
                            </Button>
                        )}
                    </div>
                    
                    {error && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg flex items-start text-left">
                            <AlertCircle size={16} className="text-red-600 mr-2 shrink-0 mt-0.5" />
                            <p className="text-xs text-red-600 break-all">{error}</p>
                        </div>
                    )}
                </div>
            </div>
            
            <div className="border-t border-slate-100 pt-4">
                <p className="text-xs text-slate-400 text-center">
                    序號狀態會即時同步至雲端資料庫。
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;