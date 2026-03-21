import React, { useState, useRef, useEffect } from 'react';
import { Mic, AlertCircle, PlayCircle, StopCircle, CheckCircle2, Loader2, UploadCloud, FileText, Sparkles, BookOpen, ChevronUp, ChevronDown, Coffee, Lock, UserCog, Unlock, Crown, X, Chrome, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import FileUpload from './components/FileUpload';
import SettingsPanel from './components/SettingsPanel';
import TranscriptionView from './components/TranscriptionView';
import SummaryPanel from './components/SummaryPanel';
import FileSplitter from './components/FileSplitter';
import AudioExtractor from './components/AudioExtractor';
import URLImporter from './components/URLImporter';
import Button from './components/Button';
import AdminPanel from './components/AdminPanel';
import DisplaySettings from './components/DisplaySettings';
import { TranscriptionSettings, ProcessingStatus, TranscriptionError } from './types';
import { transcribeMedia } from './services/geminiService';
import { loginAdminWithGoogle, validateLicenseKey, saveLicense, getStoredLicense, clearLicense, logoutAdmin, ADMIN_EMAIL } from './services/authService';
import { MAX_FILE_SIZE_INLINE } from './constants';

const App: React.FC = () => {
  // State
  const [file, setFile] = useState<File | null>(null);
  const [transcription, setTranscription] = useState('');
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [error, setError] = useState<TranscriptionError | null>(null);
  const [activeTab, setActiveTab] = useState<'transcription' | 'summary'>('transcription');
  const [showGuide, setShowGuide] = useState(true);
  
  // Display State
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'light');
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'xl'>(() => (localStorage.getItem('fontSize') as 'normal' | 'large' | 'xl') || 'normal');

  // Auth State
  const [isPro, setIsPro] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [licenseInput, setLicenseInput] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const [settings, setSettings] = useState<TranscriptionSettings>({
    language: ['yue'], // Default to Cantonese (Array)
    enableDiarization: true,
    enableTimestamps: true, // Default to true for better table view experience
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

  // Theme & Font Size Effect
  useEffect(() => {
    // Apply Theme
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);

    // Apply Font Size (Scale REM root)
    const sizeMap = {
        'normal': '16px',
        'large': '18px',
        'xl': '20px'
    };
    document.documentElement.style.fontSize = sizeMap[fontSize];
    localStorage.setItem('fontSize', fontSize);
  }, [theme, fontSize]);

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

  // Helper to check duration
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
            resolve(0); // Cannot determine, allow but might fail later
            URL.revokeObjectURL(objectUrl);
        };
        media.src = objectUrl;
    });
  };

  const handleStart = async () => {
    if (!file) return;

    // --- PRO LIMIT CHECK ---
    if (!isPro) {
        setStatus('idle'); // Ensure status doesn't stick
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
        // Admin automatically gets Pro features temporarily while logged in contextually
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
    // Reset pro if it was just admin logic, but if they have a key stored, keep it.
    const savedKey = getStoredLicense();
    if (!savedKey) setIsPro(false);
  };

  // Status Badge Component
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
        return <span className="inline-flex items-center text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 px-3 py-1 rounded-full text-sm font-medium"><StopCircle size={16} className="mr-2"/> 已停止</span>;
    }
  };

  return (
    <div className="h-screen bg-slate-50 dark:bg-slate-950 flex flex-col overflow-hidden transition-colors duration-200">
      {/* Admin Panel Overlay */}
      {showAdminPanel && <AdminPanel onLogout={handleLogout} />}

      {/* Login / License Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
             <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700">
                <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-700">
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <UserCog size={20} className="text-blue-600 dark:text-blue-400"/> 系統登入 / 解鎖
                    </h3>
                    <button onClick={() => setShowLoginModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto">
                    {/* Section 1: User License */}
                    <div className="mb-8">
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
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
                            解鎖後可解除 7 分鐘限制並使用分割器。
                        </p>
                    </div>

                    <div className="relative flex py-2 items-center mb-6">
                        <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
                        <span className="flex-shrink-0 mx-4 text-slate-400 text-xs">管理員區域</span>
                        <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
                    </div>

                    {/* Section 2: Admin Login (Google) */}
                    <div>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                            <Crown size={16} className="text-amber-500"/> 管理員登入
                        </h4>
                        <div className="space-y-3">
                            <Button 
                                onClick={handleAdminLogin} 
                                isLoading={authLoading} 
                                variant="secondary" 
                                className="w-full relative h-12 border-slate-300 hover:bg-slate-50 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-600"
                            >
                                <Chrome size={20} className="mr-2 text-slate-600 dark:text-slate-300"/> 
                                使用 Google 帳號登入
                            </Button>
                            <p className="text-[10px] text-slate-400 text-center">
                                僅限授權帳號
                            </p>
                        </div>
                    </div>

                    {authError && (
                        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-lg flex items-center border border-red-100 dark:border-red-900/50">
                            <AlertCircle size={14} className="mr-2 shrink-0"/> {authError}
                        </div>
                    )}
                </div>
             </div>
        </div>
      )}

      {/* Navbar */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0 z-20 shadow-sm relative transition-colors">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center text-white shadow-md">
              <Mic size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                Cantonese AI Transcriber
                {isPro && <span className="px-2 py-0.5 bg-gradient-to-r from-amber-200 to-yellow-400 text-amber-900 text-[10px] font-bold rounded-full shadow-sm">PRO</span>}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide">廣東話語音轉文字</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             {/* Auth Buttons */}
             {!isPro && (
                 <button 
                    onClick={() => setShowLoginModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-full transition-colors"
                 >
                    <Lock size={14} /> <span>解鎖 Pro / 登入</span>
                 </button>
             )}
             {isPro && (
                 <div className="flex items-center gap-2">
                     <span className="text-xs text-amber-600 dark:text-amber-400 font-bold flex items-center"><Crown size={14} className="mr-1"/> 完全版已啟用</span>
                     <button onClick={() => setShowLoginModal(true)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 dark:text-slate-500">
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
             
             {/* Display Settings */}
             <DisplaySettings 
                currentTheme={theme}
                currentFontSize={fontSize}
                onThemeChange={setTheme}
                onFontSizeChange={setFontSize}
             />

             <button 
                onClick={() => setShowGuide(!showGuide)}
                className="text-sm text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 flex items-center gap-1 font-medium transition-colors p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
             >
                <BookOpen size={18} />
                <span className="hidden sm:inline">{showGuide ? "隱藏說明" : "使用說明"}</span>
                {showGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
             </button>
             <StatusBadge />
          </div>
        </div>

        {/* Introduction & Usage Panel (Revamped) */}
        {showGuide && (
            <div className="absolute top-16 left-0 right-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-xl z-30 animate-fade-in max-h-[85vh] overflow-y-auto">
                <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        
                        {/* Column 1: Core Features */}
                        <div className="space-y-5">
                            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-2">
                                <Sparkles size={18} className="text-blue-600 dark:text-blue-400"/> 核心功能與優勢
                            </h3>
                            <ul className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
                                <li className="flex gap-3">
                                    <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 p-2 rounded-lg shrink-0 h-fit"><Mic size={18}/></div>
                                    <div>
                                        <strong className="block text-slate-800 dark:text-slate-100 mb-1">廣東話 (HK) 專用引擎</strong>
                                        <p className="leading-relaxed">針對香港語言習慣優化，能精準識別<strong>中英夾雜 (Code-mixing)</strong>、廣東話口語助詞及專有名詞。</p>
                                    </div>
                                </li>
                                <li className="flex gap-3">
                                    <div className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 p-2 rounded-lg shrink-0 h-fit"><FileText size={18}/></div>
                                    <div>
                                        <strong className="block text-slate-800 dark:text-slate-100 mb-1">智能會議紀錄與摘要</strong>
                                        <p className="leading-relaxed">自動區分不同說話者 (Speaker Diarization) 並標註時間戳記。內建 AI 摘要功能，一鍵生成重點問答 (Q&A)。</p>
                                    </div>
                                </li>
                                <li className="flex gap-3">
                                    <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 p-2 rounded-lg shrink-0 h-fit"><ShieldCheck size={18}/></div>
                                    <div>
                                        <strong className="block text-slate-800 dark:text-slate-100 mb-1">隱私優先設計</strong>
                                        <p className="leading-relaxed">所有檔案僅經由加密通道傳輸至 Google 企業級 API 處理，不會被第三方儲存或用於訓練模型。</p>
                                    </div>
                                </li>
                            </ul>
                        </div>

                        {/* Column 2: Workflow */}
                        <div className="space-y-5">
                             <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-2">
                                <Zap size={18} className="text-amber-500"/> 簡易操作流程
                            </h3>
                             <ol className="relative border-l-2 border-slate-200 dark:border-slate-700 ml-3 space-y-6 text-sm text-slate-600 dark:text-slate-300 my-4">
                                <li className="ml-6 relative">
                                    <span className="absolute -left-[31px] top-0 w-6 h-6 bg-slate-800 dark:bg-slate-600 text-white rounded-full flex items-center justify-center text-xs font-bold ring-4 ring-white dark:ring-slate-900">1</span>
                                    <div>
                                        <strong className="text-slate-800 dark:text-slate-100">上載影音</strong>
                                        <p className="mt-1">直接拖放檔案 (支援 MP3, M4A, WAV, MP4, MOV)。系統會自動檢測格式。</p>
                                    </div>
                                </li>
                                <li className="ml-6 relative">
                                    <span className="absolute -left-[31px] top-0 w-6 h-6 bg-slate-400 dark:bg-slate-500 text-white rounded-full flex items-center justify-center text-xs font-bold ring-4 ring-white dark:ring-slate-900">2</span>
                                    <div>
                                        <strong className="text-slate-800 dark:text-slate-100">AI 設定與微調</strong>
                                        <p className="mt-1">選擇模型 (Pro/Flash)，並可於「額外提示」中輸入專有名詞或人名，提升準確度。</p>
                                    </div>
                                </li>
                                <li className="ml-6 relative">
                                    <span className="absolute -left-[31px] top-0 w-6 h-6 bg-slate-400 dark:bg-slate-500 text-white rounded-full flex items-center justify-center text-xs font-bold ring-4 ring-white dark:ring-slate-900">3</span>
                                    <div>
                                        <strong className="text-slate-800 dark:text-slate-100">轉錄、編輯與導出</strong>
                                        <p className="mt-1">即時預覽轉錄結果，可直接在表格中編輯修正，最後導出為 TXT, CSV 或生成 AI 摘要。</p>
                                    </div>
                                </li>
                            </ol>
                        </div>

                        {/* Column 3: Pro Features & Support (Call to Action) */}
                        <div className="bg-gradient-to-br from-amber-50 to-orange-100 dark:from-amber-900/20 dark:to-orange-900/20 rounded-2xl p-6 border border-amber-200/60 dark:border-amber-700/50 relative overflow-hidden flex flex-col shadow-sm">
                            <div className="absolute -top-6 -right-6 p-4 opacity-10 pointer-events-none">
                                <Coffee size={140} className="text-amber-600"/>
                            </div>
                            
                            <h3 className="flex items-center gap-2 text-base font-bold text-amber-900 dark:text-amber-400 uppercase tracking-wider mb-4 relative z-10">
                                <Crown size={20} className="fill-amber-500 text-amber-700 dark:text-amber-500"/> 支持開發與解鎖功能
                            </h3>
                            
                            <div className="space-y-4 text-sm text-amber-900/90 dark:text-amber-200/90 mb-6 relative z-10 flex-1">
                                <p className="leading-relaxed font-medium">
                                    此工具由個人開發者維護。免費版提供 <strong>7 分鐘</strong> 的體驗長度。
                                </p>
                                <div className="bg-white/60 dark:bg-black/30 p-4 rounded-xl backdrop-blur-sm border border-amber-200 dark:border-amber-800">
                                    <h4 className="font-bold text-amber-800 dark:text-amber-400 mb-2 flex items-center gap-2">
                                        <Unlock size={14}/> 完全版 (Pro) 權限：
                                    </h4>
                                    <ul className="space-y-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                                        <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-green-600 dark:text-green-400"/> 解除 7 分鐘時間限制 (無限長度)</li>
                                        <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-green-600 dark:text-green-400"/> 啟用長檔案智能分割器 (Splitter)</li>
                                        <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-green-600 dark:text-green-400"/> 優先使用 Gemini Pro 高階模型</li>
                                    </ul>
                                </div>
                                <p className="text-xs opacity-80">
                                    只需透過 Buy Me a Coffee 贊助，即可獲得永久通行的 License Key。
                                </p>
                            </div>

                            <a 
                                href="https://buymeacoffee.com/cantonese.ai.transcriber" 
                                target="_blank" 
                                rel="noreferrer"
                                className="relative z-10 block w-full text-center py-3.5 bg-[#FFDD00] hover:bg-[#ffea00] hover:scale-[1.02] active:scale-[0.98] text-slate-900 font-extrabold rounded-xl shadow-md hover:shadow-lg transition-all text-sm flex items-center justify-center gap-2 group"
                            >
                                <Coffee size={18} className="group-hover:animate-bounce"/>
                                <span>請我喝杯咖啡 & 獲取通行碼</span>
                                <ArrowRight size={16} className="opacity-50 group-hover:translate-x-1 transition-transform"/>
                            </a>
                        </div>

                    </div>
                </div>
            </div>
        )}
      </header>

      {/* Main Layout - 3 Columns */}
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
                     <span className="text-xs text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-300 px-2 py-1 rounded flex items-center max-w-[300px] truncate" title={error.message}>
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
                        <URLImporter
                            onFileReady={handleFileSelect}
                            disabled={status === 'uploading' || status === 'transcribing'}
                            isPro={isPro}
                            onRequestUnlock={() => setShowLoginModal(true)}
                        />
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
  );
};

export default App;