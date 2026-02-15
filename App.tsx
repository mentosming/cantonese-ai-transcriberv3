
import React, { useState, useRef, useEffect } from 'react';
import { Mic, AlertCircle, PlayCircle, StopCircle, CheckCircle2, Loader2, UploadCloud, FileText, Sparkles, BookOpen, ChevronUp, ChevronDown, Coffee, Lock, UserCog, Unlock, Crown, X, Chrome, Moon, Sun, Type, Heart, Key } from 'lucide-react';
import FileUpload from './components/FileUpload';
import SettingsPanel from './components/SettingsPanel';
import TranscriptionView from './components/TranscriptionView';
import SummaryPanel from './components/SummaryPanel';
import FileSplitter from './components/FileSplitter';
import AudioExtractor from './components/AudioExtractor';
import Button from './components/Button';
import AdminPanel from './components/AdminPanel';
import { TranscriptionSettings, ProcessingStatus, TranscriptionError } from './types';
import { transcribeMedia } from './services/geminiService';
import { loginAdminWithGoogle, validateLicenseKey, saveLicense, getStoredLicense, clearLicense, logoutAdmin } from './services/authService';
import { MAX_FILE_SIZE_INLINE } from './constants';

const App: React.FC = () => {
  // Check API Key existence immediately
  const hasApiKey = !!process.env.API_KEY;

  // State
  const [file, setFile] = useState<File | null>(null);
  const [transcription, setTranscription] = useState('');
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [error, setError] = useState<TranscriptionError | null>(null);
  const [activeTab, setActiveTab] = useState<'transcription' | 'summary'>('transcription');
  const [showGuide, setShowGuide] = useState(true);
  
  // Theme & Display State
  // Initialize from localStorage or system preference
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('cai_dark_mode');
        if (saved !== null) {
            return saved === 'true';
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  
  const [globalFontSize, setGlobalFontSize] = useState(0); // 0: Normal, 1: Large, 2: Extra Large

  // Auth State
  const [isPro, setIsPro] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [licenseInput, setLicenseInput] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const [settings, setSettings] = useState<TranscriptionSettings>({
    model: 'gemini-3-pro-preview',
    language: ['yue'], // Default to Cantonese array
    enableDiarization: true,
    enableTimestamps: true, 
    speakers: [],
    startTime: "00:00",
    customPrompt: ""
  });

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- Initialization ---
  useEffect(() => {
    const checkSavedLicense = async () => {
        const savedKey = getStoredLicense();
        if (savedKey) {
            const isValid = await validateLicenseKey(savedKey);
            if (isValid) {
                setIsPro(true);
            } else {
                clearLicense(); // Expired or invalid
            }
        }
    };
    checkSavedLicense();
  }, []);

  // --- Auto-Hide Guide Effect ---
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowGuide(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // --- Theme Effect ---
  // Apply dark class to <html> tag for global effect
  useEffect(() => {
    if (darkMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('cai_dark_mode', 'true');
    } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('cai_dark_mode', 'false');
    }
  }, [darkMode]);

  // --- Global Font Size Effect ---
  useEffect(() => {
    // Tailwind uses rem. 1rem = root font size.
    // Default is usually 16px.
    const sizes = ['16px', '18px', '20px'];
    document.documentElement.style.fontSize = sizes[globalFontSize];
  }, [globalFontSize]);

  // --- Theme Toggle ---
  const toggleTheme = () => {
      setDarkMode(!darkMode);
  };

  // --- Handlers ---

  const handleFileSelect = (selectedFile: File, estimatedStartTime?: string) => {
    setFile(selectedFile);
    setStatus('idle');
    setError(null);
    setActiveTab('transcription'); 
    
    if (estimatedStartTime) {
      setSettings(prev => ({
        ...prev,
        startTime: estimatedStartTime
      }));
    } else {
        setSettings(prev => ({
            ...prev,
            startTime: "00:00"
        }));
    }
  };

  const handleClearFile = () => {
    if (status === 'transcribing' || status === 'uploading') return;
    setFile(null);
    setStatus('idle');
    setSettings(prev => ({ ...prev, startTime: "00:00" }));
  };

  const handleClearTranscription = () => {
    if (window.confirm("確定要清空所有轉錄內容嗎？")) {
      setTranscription('');
    }
  };
  
  const handleUpdateTranscription = (newText: string) => {
    setTranscription(newText);
  };

  const getMediaDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);
        const media = document.createElement(file.type.startsWith('video') ? 'video' : 'audio');
        media.preload = 'metadata';
        media.onloadedmetadata = () => {
            resolve(media.duration);
            URL.revokeObjectURL(objectUrl);
        };
        media.onerror = () => {
            resolve(0); 
            URL.revokeObjectURL(objectUrl);
        };
        media.src = objectUrl;
    });
  };

  const handleStart = async () => {
    if (!hasApiKey) {
        alert("錯誤：未檢測到 API Key。請先在 Vercel 設定環境變數。");
        return;
    }
    if (!file) return;

    // --- PRO LIMIT CHECK ---
    if (!isPro) {
        setStatus('idle'); 
        const duration = await getMediaDuration(file);
        // 7 minutes = 420 seconds
        if (duration > 420) {
            setError({
                type: 'limit',
                message: `限制提示：免費版僅支援最長 7 分鐘的影音轉錄。檢測到長度約為 ${(duration/60).toFixed(1)} 分鐘。請使用分割工具(需 Pro)或剪輯後再試。`
            });
            return;
        }
    }
    
    setStatus(file.size > MAX_FILE_SIZE_INLINE ? 'uploading' : 'transcribing');
    setError(null);
    setActiveTab('transcription');
    setShowGuide(false); 
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const hasOffset = settings.startTime && settings.startTime !== "00:00" && settings.startTime !== "0:00";
    const isAppend = transcription.length > 0;

    if (isAppend || hasOffset) {
      setTranscription(prev => prev + `\n\n--- [接續檔案: ${file.name} | Start: ${settings.startTime}] ---\n\n`);
    }

    try {
      await transcribeMedia(
        file, 
        settings, 
        (chunkText) => {
            setStatus('transcribing');
            setTranscription(prev => prev + chunkText);
        },
        abortController.signal
      );
      setStatus('completed');
    } catch (err: any) {
      if (err.message === 'Transcription stopped by user.') {
        setStatus('stopped');
      } else {
        setStatus('error');
        setError(err);
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // --- Auth Handlers ---
  const handleAdminLogin = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
        await loginAdminWithGoogle();
        setShowLoginModal(false);
        setShowAdminPanel(true);
        setIsPro(true); 
    } catch (err: any) {
        setAuthError(err.message);
    } finally {
        setAuthLoading(false);
    }
  };

  const handleLicenseUnlock = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
        const isValid = await validateLicenseKey(licenseInput);
        if (isValid) {
            saveLicense(licenseInput);
            setIsPro(true);
            setShowLoginModal(false);
            setLicenseInput('');
            alert("成功解鎖完全版功能！");
        } else {
            setAuthError("無效的通行碼，請確認後再試。");
        }
    } catch (err) {
        setAuthError("驗證過程發生錯誤，請檢查網絡連接。");
    } finally {
        setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutAdmin();
    setShowAdminPanel(false);
    const savedKey = getStoredLicense();
    if (!savedKey) setIsPro(false);
  };

  const StatusBadge = () => {
    switch (status) {
      case 'idle': return null;
      case 'uploading': 
        return <span className="inline-flex items-center text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 px-3 py-1 rounded-full text-sm font-medium"><UploadCloud size={16} className="mr-2 animate-bounce"/> 上載至雲端中...</span>;
      case 'transcribing':
        return <span className="inline-flex items-center text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300 px-3 py-1 rounded-full text-sm font-medium"><Loader2 size={16} className="mr-2 animate-spin"/> 正在轉錄 (AI 思考中)...</span>;
      case 'completed':
        return <span className="inline-flex items-center text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-300 px-3 py-1 rounded-full text-sm font-medium"><CheckCircle2 size={16} className="mr-2"/> 完成</span>;
      case 'error':
        return <span className="inline-flex items-center text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-300 px-3 py-1 rounded-full text-sm font-medium"><AlertCircle size={16} className="mr-2"/> 失敗</span>;
      case 'stopped':
        return <span className="inline-flex items-center text-slate-500 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 px-3 py-1 rounded-full text-sm font-medium"><StopCircle size={16} className="mr-2"/> 已停止</span>;
    }
  };

  return (
    <div className="h-screen flex flex-col relative">
      {/* Missing API Key Warning Banner */}
      {!hasApiKey && (
        <div className="bg-red-600 text-white px-4 py-3 text-center text-sm font-bold flex items-center justify-center gap-2 z-50 shadow-lg animate-pulse">
            <Key size={20} />
            <span>系統偵測不到 API Key。請於 Vercel 設定 Environment Variable: "API_KEY" 以啟用 AI 功能。</span>
        </div>
      )}

      <div className="h-screen bg-slate-50 dark:bg-slate-900 flex flex-col overflow-hidden transition-colors duration-200">
      
      {/* Admin Panel Overlay */}
      {showAdminPanel && <AdminPanel onLogout={handleLogout} />}

      {/* Login / License Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
             <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
                <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-700">
                    <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <UserCog size={20} className="text-blue-600"/> 系統登入 / 解鎖
                    </h3>
                    <button onClick={() => setShowLoginModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto">
                    
                    {/* --- Support & Promo Section (New) --- */}
                    <div className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-xl border border-yellow-100 dark:border-yellow-800/50">
                        <h4 className="font-bold text-slate-800 dark:text-yellow-100 text-sm mb-2 flex items-center gap-2">
                            <Coffee size={18} className="text-amber-500 fill-amber-500/20" /> 
                            支持開發者 & 獲取 Pro 版
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mb-3 leading-relaxed">
                            喜歡這個工具嗎？請支持一杯咖啡，您將獲得 <strong>解除時間限制</strong> 與 <strong>長檔案分割工具</strong> 的專屬通行碼！
                        </p>
                        <a 
                            href="https://buymeacoffee.com/cantonese.ai.transcriber" 
                            target="_blank" 
                            rel="noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#FFDD00] hover:bg-[#FFDD00]/90 text-slate-900 text-sm font-bold rounded-lg transition-all shadow-sm hover:scale-[1.02]"
                        >
                            <Heart size={16} className="fill-slate-900/20" />
                            前往 Buy Me a Coffee 支持
                        </a>
                    </div>

                    {/* Section 1: User License */}
                    <div className="mb-8">
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-2">
                            <Unlock size={16} /> 輸入完全版通行碼
                        </h4>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                placeholder="PRO-XXXX-XXXX"
                                value={licenseInput}
                                onChange={(e) => setLicenseInput(e.target.value)}
                                className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono uppercase"
                            />
                            <Button onClick={handleLicenseUnlock} isLoading={authLoading} disabled={!licenseInput} className="whitespace-nowrap">
                                解鎖
                            </Button>
                        </div>
                         <p className="text-xs text-slate-400 mt-2">
                            若您已支持，請輸入您收到的序號。
                        </p>
                    </div>

                    <div className="relative flex py-2 items-center mb-6">
                        <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
                        <span className="flex-shrink-0 mx-4 text-slate-400 text-xs">管理員區域</span>
                        <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
                    </div>

                    {/* Section 2: Admin Login (Google) */}
                    <div>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                            <Crown size={16} className="text-amber-500"/> 管理員登入
                        </h4>
                        <div className="space-y-3">
                            <Button 
                                onClick={handleAdminLogin} 
                                isLoading={authLoading} 
                                variant="secondary" 
                                className="w-full relative h-12 border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-600"
                            >
                                <Chrome size={20} className="mr-2 text-slate-600 dark:text-slate-200"/> 
                                使用 Google 帳號登入
                            </Button>
                            <p className="text-[10px] text-slate-400 text-center">
                                僅限授權帳號
                            </p>
                        </div>
                    </div>

                    {authError && (
                        <div className="mt-4 p-3 bg-red-50 text-red-600 text-xs rounded-lg flex items-center">
                            <AlertCircle size={14} className="mr-2 shrink-0"/> {authError}
                        </div>
                    )}
                </div>
             </div>
        </div>
      )}

      {/* Navbar */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0 z-20 shadow-sm relative transition-colors">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center text-white shadow-md">
              <Mic size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2 flex-wrap">
                Cantonese AI Transcriber
                <span className="hidden sm:inline text-slate-300 dark:text-slate-600 mx-1">|</span>
                <span className="text-base sm:text-lg font-normal text-slate-700 dark:text-slate-200">專業語音轉文字工具</span>
                {isPro && <span className="px-2 py-0.5 bg-gradient-to-r from-amber-200 to-yellow-400 text-amber-900 text-[10px] font-bold rounded-full shadow-sm">PRO</span>}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide">
                支援廣東話 (Cantonese)、英文、國語識別 • 準確率高 • 智能長檔案處理
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             {/* Font Size Toggle */}
             <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1 mr-2 hidden sm:flex">
                <button 
                  onClick={() => setGlobalFontSize(prev => Math.max(0, prev - 1))} 
                  className="p-1.5 hover:bg-white dark:hover:bg-slate-600 rounded text-slate-500 dark:text-slate-300 disabled:opacity-30"
                  disabled={globalFontSize === 0}
                  title="縮小字型"
                >
                   <Type size={14} />
                </button>
                <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1 self-center"></div>
                <button 
                  onClick={() => setGlobalFontSize(prev => Math.min(2, prev + 1))} 
                  className="p-1.5 hover:bg-white dark:hover:bg-slate-600 rounded text-slate-500 dark:text-slate-300 disabled:opacity-30"
                  disabled={globalFontSize === 2}
                  title="放大字型"
                >
                   <Type size={18} />
                </button>
             </div>

             {/* Theme Toggle */}
             <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors">
                 {darkMode ? <Sun size={18} /> : <Moon size={18} />}
             </button>

             {/* Auth Buttons */}
             {!isPro && (
                 <button 
                    onClick={() => setShowLoginModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-full transition-colors"
                 >
                    <Lock size={14} /> <span>解鎖 Pro / 登入</span>
                 </button>
             )}
             {isPro && (
                 <div className="flex items-center gap-2">
                     <span className="text-xs text-amber-600 dark:text-amber-400 font-bold flex items-center"><Crown size={14} className="mr-1"/> 完全版已啟用</span>
                     <button onClick={() => setShowLoginModal(true)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400">
                         <UserCog size={16} />
                     </button>
                 </div>
             )}

             <a 
                href="https://buymeacoffee.com/cantonese.ai.transcriber" 
                target="_blank" 
                rel="noreferrer"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-[#FFDD00] hover:bg-[#FFDD00]/90 text-slate-900 text-xs font-bold rounded-full transition-all shadow-sm group"
                title="Support me"
             >
                <Coffee size={14} className="fill-slate-900/20 group-hover:scale-110 transition-transform" />
                <span>Buy me a coffee</span>
             </a>
             
             <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>

             <button 
                onClick={() => setShowGuide(!showGuide)}
                className="text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 font-medium transition-colors"
             >
                <BookOpen size={16} />
                <span className="hidden sm:inline">{showGuide ? "隱藏說明" : "使用說明"}</span>
                {showGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
             </button>
             <StatusBadge />
          </div>
        </div>

        {/* Introduction & Usage Panel */}
        {showGuide && (
            <div className="absolute top-16 left-0 right-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-md z-10 animate-fade-in transition-colors">
                <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-3">🛠️ 專業功能與支持</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                                歡迎使用 <strong>Cantonese AI Transcriber</strong>。本工具專為廣東話及多語言環境設計，支援中英夾雜識別。
                            </p>
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                                    <h4 className="font-semibold text-slate-800 dark:text-white text-xs mb-1">🆓 免費版</h4>
                                    <ul className="text-xs text-slate-500 dark:text-slate-400 list-disc list-inside">
                                        <li>單次轉錄長度限制 7 分鐘</li>
                                        <li>基礎編輯與導出</li>
                                        <li>安全隱私 (無痕模式)</li>
                                    </ul>
                                </div>
                                <div className="p-3 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-100 dark:border-amber-800 rounded-lg">
                                    <h4 className="font-semibold text-amber-800 dark:text-amber-400 text-xs mb-1 flex items-center"><Crown size={12} className="mr-1"/> Pro 完全版</h4>
                                    <ul className="text-xs text-amber-700 dark:text-amber-500 list-disc list-inside">
                                        <li><strong>無限制轉錄時長</strong></li>
                                        <li>解鎖長檔案分割工具</li>
                                        <li>優先支援與新功能</li>
                                    </ul>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <p className="text-xs text-slate-500 dark:text-slate-400">覺得好用？請支持開發者一杯咖啡，即可獲取 Pro 通行碼！</p>
                                <a href="https://buymeacoffee.com/cantonese.ai.transcriber" target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">立即支持 &rarr;</a>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-3">🚀 使用流程指南</h3>
                            <ol className="text-sm text-slate-600 dark:text-slate-300 space-y-2 list-decimal list-inside">
                                <li>
                                    <span className="font-medium text-slate-800 dark:text-slate-200">上載檔案：</span> 
                                    支援 MP3, M4A, MP4 等格式。如檔案極大 (&gt;1小時)，請先使用下方的「長檔案分割器」。
                                </li>
                                <li>
                                    <span className="font-medium text-slate-800 dark:text-slate-200">AI 設定：</span> 
                                    選擇語言 (可多選，例如廣東話+英文+印尼語)。在「額外提示」中輸入專有名詞可提高準確度。
                                </li>
                                <li>
                                    <span className="font-medium text-slate-800 dark:text-slate-200">轉錄與編輯：</span> 
                                    點擊「開始轉錄」。完成後可直接在表格中修改文字與時間。
                                </li>
                                <li>
                                    <span className="font-medium text-slate-800 dark:text-slate-200">導出與摘要：</span> 
                                    支援導出 <strong>SRT 字幕</strong>、CSV 或 TXT。切換至「AI 摘要」可生成案情重點問答。
                                </li>
                            </ol>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </header>

      {/* Main Layout */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
            
            {/* LEFT COLUMN: Controls & Input (3 cols) */}
            <div className="lg:col-span-3 flex flex-col gap-6 h-full overflow-y-auto pr-2 scrollbar-thin pb-4">
                <section>
                    <h2 className="text-sm uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-3">1. 上載影音</h2>
                    <FileUpload 
                        onFileSelect={handleFileSelect}
                        selectedFile={file}
                        onClear={handleClearFile}
                        disabled={status === 'uploading' || status === 'transcribing'}
                    />
                </section>

                <section>
                    <h2 className="text-sm uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-3">2. AI 設定</h2>
                    <SettingsPanel 
                        settings={settings}
                        onChange={setSettings}
                        disabled={status === 'uploading' || status === 'transcribing'}
                    />
                </section>

                <div className="sticky bottom-0 bg-slate-50 dark:bg-slate-900 pt-2 pb-2 z-10">
                    {status === 'transcribing' || status === 'uploading' ? (
                        <Button 
                        onClick={handleStop}
                        variant="danger"
                        className="w-full h-12 text-lg shadow-red-200 dark:shadow-none shadow-md"
                        >
                        <StopCircle className="mr-2" /> 停止轉錄
                        </Button>
                    ) : (
                        <Button 
                        onClick={handleStart}
                        disabled={!file}
                        className="w-full h-12 text-lg shadow-blue-200 dark:shadow-none shadow-md relative overflow-hidden"
                        >
                        {!isPro && file && <div className="absolute top-0 right-0 bg-amber-400 text-[9px] px-2 py-0.5 text-amber-900 font-bold rounded-bl">Max 7min</div>}
                        <PlayCircle className="mr-2" /> 開始轉錄
                        </Button>
                    )}
                </div>
            </div>

            {/* MIDDLE COLUMN: Output (6 cols) */}
            <div className="lg:col-span-6 flex flex-col h-full overflow-hidden">
                {/* Tabs Header */}
                <div className="flex items-center justify-between mb-3 shrink-0">
                   <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg">
                      <button
                        onClick={() => setActiveTab('transcription')}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'transcription' ? 'bg-white dark:bg-slate-600 text-blue-700 dark:text-blue-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                      >
                         <FileText size={16} /> 3. 轉錄結果
                      </button>
                      <button
                        onClick={() => setActiveTab('summary')}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'summary' ? 'bg-white dark:bg-slate-600 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                      >
                         <Sparkles size={16} /> AI 摘要
                      </button>
                   </div>
                   
                   {error && (
                     <span className="text-xs text-red-600 bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded flex items-center max-w-[300px] truncate" title={error.message}>
                       <AlertCircle size={12} className="mr-1 flex-shrink-0"/> {error.message}
                     </span>
                   )}
                </div>

                <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
                    <div className={`absolute inset-0 flex flex-col transition-opacity duration-200 ${activeTab === 'transcription' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                        <TranscriptionView 
                            text={transcription} 
                            status={status} 
                            onClear={handleClearTranscription}
                            onUpdate={handleUpdateTranscription}
                            onSwitchToSummary={() => setActiveTab('summary')}
                            className="h-full"
                        />
                    </div>

                     <div className={`absolute inset-0 flex flex-col transition-opacity duration-200 ${activeTab === 'summary' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                        <SummaryPanel transcriptionText={transcription} />
                    </div>
                </div>
            </div>

            {/* RIGHT COLUMN: Utilities (3 cols) */}
            <div className="lg:col-span-3 flex flex-col gap-6 h-full overflow-y-auto pl-2 scrollbar-thin pb-4">
                 <div>
                    <h2 className="text-sm uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-3">4. 輔助工具</h2>
                    <div className="flex flex-col gap-6">
                        <FileSplitter 
                            onSelectSegment={handleFileSelect} 
                            isPro={isPro}
                            onRequestUnlock={() => setShowLoginModal(true)}
                        />
                        <AudioExtractor />
                    </div>
                 </div>
            </div>

            </div>
        </div>
      </main>
      </div>
    </div>
  );
};

export default App;
