import React, { useState, useRef, useEffect } from 'react';
import { Mic, AlertCircle, PlayCircle, StopCircle, CheckCircle2, Loader2, UploadCloud, FileText, Sparkles, BookOpen, ChevronUp, ChevronDown, Lock, UserCog, Unlock, Crown, X, Chrome, ArrowRight, ShieldCheck, Zap, Coins, History, Film, Clapperboard } from 'lucide-react';
import { Logo, LogoMark } from './components/Logo';
import FileUpload from './components/FileUpload';
import VoiceRecorder from './components/VoiceRecorder';
import LinkTranscribe from './components/LinkTranscribe';
import LegalModal from './components/LegalModal';
import SettingsPanel from './components/SettingsPanel';
import TranscriptionView from './components/TranscriptionView';
import SummaryPanel from './components/SummaryPanel';
import AudioExtractor from './components/AudioExtractor';
import Button from './components/Button';
import AdminPanel from './components/AdminPanel';
import DisplaySettings from './components/DisplaySettings';
import MultiTrackEditor from './components/MultiTrackEditor';
import PricingModal from './components/PricingModal';
import HistoryModal from './components/HistoryModal';
import { TranscriptionSettings, ProcessingStatus, TranscriptionError, UserProfile } from './types';
import { transcribeMedia, transcribeUrl, analyzeCombinedTranscripts } from './services/geminiService';
import { transcribeLongMedia } from './services/transcribeLong';
import { transcriptToCues } from './services/srtUtil';
import { loginAdminWithGoogle, loginWithGoogle, completeRedirectLogin, logoutUser, validateLicenseKey, saveLicense, getStoredLicense, clearLicense, logoutAdmin, ADMIN_EMAIL } from './services/authService';
import { auth } from './services/firebase';
import { ensureUser, subscribeToProfile, loadOrCreateProfile, checkEntitlement, deductMinutes, secondsToBillableMinutes } from './services/billingService';
import { configureRevenueCat } from './services/checkoutService';
import { logUsage, getTranscript, UsageLog } from './services/adminService';
import { analysisCostMinutes } from './constants';
import { MAX_FILE_SIZE_INLINE, DEFAULT_MODEL } from './constants';

const App: React.FC = () => {
  // State
  const [file, setFile] = useState<File | null>(null);
  const [transcription, setTranscription] = useState('');
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [error, setError] = useState<TranscriptionError | null>(null);
  const [activeTab, setActiveTab] = useState<'transcription' | 'summary'>('transcription');
  const [showGuide, setShowGuide] = useState(false);
  
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

  // Billing State
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(true); // not signed in with a real account
  const [showLogin, setShowLogin] = useState(false);
  const [legalTab, setLegalTab] = useState<'privacy' | 'terms' | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showPricing, setShowPricing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [showMT, setShowMT] = useState(false);

  const [settings, setSettings] = useState<TranscriptionSettings>({
    language: ['yue'], // Default to Cantonese (Array)
    enableDiarization: true,
    enableTimestamps: true, // Default to true for better table view experience
    speakers: [],
    startTime: "00:00",
    customPrompt: "",
    model: DEFAULT_MODEL
  });

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- Initialization: ensure a Firebase identity + load billing profile ---
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        // Complete a Google redirect sign-in if we just returned from one.
        await completeRedirectLogin();
        const p = await ensureUser();
        setProfile(p);
        setIsAnonymous(auth.currentUser?.isAnonymous ?? true);
        unsub = subscribeToProfile(p.uid, (live) => { if (live) setProfile(live); });
        // iOS: bind RevenueCat purchases to this Firebase uid (no-op on web).
        configureRevenueCat(p.uid);
      } catch (e) {
        console.warn('Billing profile init failed (offline?):', e);
      }
      // Legacy license-key support: still honour previously issued keys.
      const savedKey = getStoredLicense();
      if (savedKey && (await validateLicenseKey(savedKey))) setIsPro(true);
      else if (savedKey) clearLicense();
    })();
    // If returning from Stripe checkout, refresh shortly after.
    if (typeof window !== 'undefined' && window.location.search.includes('checkout=success')) {
      setTimeout(async () => {
        const u = (await import('./services/firebase')).auth.currentUser;
        if (u) setProfile(await loadOrCreateProfile(u));
      }, 1500);
    }
    return () => { if (unsub) unsub(); };
  }, []);

  // Derived entitlement: admin, active subscription, legacy key, or has credits.
  const hasEntitlement =
    isPro ||
    !!profile?.isAdmin ||
    profile?.subscriptionStatus === 'active' ||
    (profile?.creditMinutes ?? 0) > 0;

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

  // --- User (Google) login: popup, with redirect fallback if blocked ---
  const handleUserLogin = async () => {
    setLoginLoading(true); setLoginError('');
    try {
      const user = await loginWithGoogle();
      if (user) {
        const p = await loadOrCreateProfile(user);
        setProfile(p);
        setIsAnonymous(false);
        setShowLogin(false);
        setLoginLoading(false);
      }
      // user === null → redirect started; the page navigates away.
    } catch (err: any) {
      setLoginError(err?.message || '登入失敗');
      setLoginLoading(false);
    }
  };

  const handleUserLogout = async () => {
    await logoutUser();
    window.location.reload();
  };

  const handleStart = async () => {
    if (!file) return;
    // Login required to use functions.
    if (isAnonymous && !isPro) { setShowLogin(true); return; }

    // Duration drives both metering and the long-file decision.
    setStatus('idle');
    const durationSec = await getMediaDuration(file) || 0;

    // --- ENTITLEMENT CHECK (credits / subscription) ---
    // Legacy license-key (isPro) users skip metering entirely.
    let billedMinutes = 0;
    if (!isPro) {
        billedMinutes = secondsToBillableMinutes(durationSec);
        const check = checkEntitlement(profile, billedMinutes);
        if (!check.allowed) {
            setError({ type: 'limit', message: check.message || '額度不足，請購買分鐘數或訂閱月費。' });
            setShowPricing(true);
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

    let prefix = transcription;
    if (isAppend || hasOffset) {
      prefix = transcription + `\n\n--- [接續檔案: ${file.name} | Start: ${settings.startTime}] ---\n\n`;
      setTranscription(prefix);
    }

    // Long files (>12 min) auto-chunk so they never truncate or reset.
    const useChunked = durationSec > 720;
    const tp = settings.startTime.split(':').map(Number);
    const baseOffset = tp.length === 3 ? tp[0] * 3600 + tp[1] * 60 + tp[2] : tp.length === 2 ? tp[0] * 60 + tp[1] : 0;

    let jobText = '';
    try {
      if (useChunked) {
        jobText = await transcribeLongMedia(
          file, settings,
          (full) => { setStatus('transcribing'); jobText = full; setTranscription(prefix + full); },
          abortController.signal, baseOffset,
        );
      } else {
        await transcribeMedia(
          file, settings,
          (chunkText) => { setStatus('transcribing'); jobText += chunkText; setTranscription(prev => prev + chunkText); },
          abortController.signal
        );
      }
      setStatus('completed');
      // Meter usage after a successful job (no-op for admin/free/legacy).
      if (!isPro && profile && billedMinutes > 0) {
        try { await deductMinutes(profile.uid, billedMinutes); } catch (e) { console.warn('deduct failed', e); }
      }
      // Record the job for the admin usage dashboard (best-effort).
      logUsage({
        uid: profile?.uid || 'anonymous',
        email: profile?.email,
        fileName: file.name,
        durationMinutes: billedMinutes || secondsToBillableMinutes(durationSec),
        model: settings.model,
        languages: settings.language,
        charCount: jobText.length,
        transcript: jobText,
      });
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

  // Transcribe a YouTube / media URL directly via Gemini (no download).
  const handleTranscribeUrl = async (url: string) => {
    if (!url.trim()) return;
    if (isAnonymous && !isPro) { setShowLogin(true); return; }
    // We don't know the duration up-front; require *some* entitlement, then
    // meter from the transcript's timestamps afterwards.
    if (!isPro) {
      const check = checkEntitlement(profile, 1);
      if (!check.allowed) {
        setError({ type: 'limit', message: check.message || '額度不足，請購買分鐘數或訂閱月費。' });
        setShowPricing(true);
        return;
      }
    }
    setFile(null);
    setStatus('transcribing');
    setError(null);
    setActiveTab('transcription');
    setShowGuide(false);
    const isAppend = transcription.length > 0;
    if (isAppend) setTranscription(prev => prev + `\n\n--- [連結轉錄: ${url}] ---\n\n`);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    let jobText = '';
    try {
      await transcribeUrl(url, settings, (chunkText) => {
        setStatus('transcribing');
        jobText += chunkText;
        setTranscription(prev => prev + chunkText);
      }, abortController.signal);
      setStatus('completed');
      // Meter from the last timestamp in the transcript (best estimate).
      const cues = transcriptToCues(jobText);
      const seconds = cues.length ? cues[cues.length - 1].end : 0;
      const billed = secondsToBillableMinutes(seconds);
      if (!isPro && profile && billed > 0) {
        try { await deductMinutes(profile.uid, billed); } catch (e) { console.warn('deduct failed', e); }
      }
      logUsage({
        uid: profile?.uid || 'anonymous',
        email: profile?.email,
        fileName: url,
        durationMinutes: billed,
        model: settings.model,
        languages: settings.language,
        charCount: jobText.length,
        transcript: jobText,
      });
    } catch (err: any) {
      if (err.message === 'Transcription stopped by user.') setStatus('stopped');
      else { setStatus('error'); setError(err); }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // --- Merge multiple past transcripts → billed AI analysis ---
  const handleAnalyzeLogs = async (logs: UsageLog[]) => {
    if (!logs.length) return;
    setShowHistory(false);
    setAnalysisLoading(true);
    setAnalysisResult(null);
    setError(null);
    try {
      // Fetch full transcripts for the selected jobs.
      const texts = await Promise.all(
        logs.map(async (l) => ({
          label: l.fileName || new Date(l.createdAt).toLocaleString('zh-HK'),
          content: l.id ? await getTranscript(l.id) : (l.preview || ''),
        }))
      );
      const totalChars = texts.reduce((a, t) => a + t.content.length, 0);
      const cost = analysisCostMinutes(totalChars);

      // Entitlement check (legacy/admin exempt).
      if (!isPro) {
        const check = checkEntitlement(profile, cost);
        if (!check.allowed) {
          setAnalysisLoading(false);
          setError({ type: 'limit', message: `合併分析需 ${cost} 分鐘額度。${check.message || ''}` });
          setShowPricing(true);
          return;
        }
      }

      const result = await analyzeCombinedTranscripts(texts);
      setAnalysisResult(result);

      // Bill + record the analysis job.
      if (!isPro && profile) {
        try { await deductMinutes(profile.uid, cost); } catch (e) { console.warn('deduct failed', e); }
      }
      logUsage({
        uid: profile?.uid || 'anonymous',
        email: profile?.email,
        fileName: `[AI 合併分析] ${logs.length} 段對話`,
        durationMinutes: cost,
        model: settings.model,
        languages: settings.language,
        charCount: result.length,
        transcript: result,
      });
    } catch (err: any) {
      setError({ type: 'general', message: err?.message || '合併分析失敗' });
    } finally {
      setAnalysisLoading(false);
    }
  };

  // --- Auth Handlers ---
  const handleAdminLogin = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
        const user = await loginAdminWithGoogle();
        setShowLoginModal(false);
        setShowAdminPanel(true);
        // Admin automatically gets Pro features temporarily while logged in contextually
        setIsPro(true);
        try { setProfile(await loadOrCreateProfile(user)); } catch (e) { console.warn(e); }
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
        return <span className="inline-flex items-center text-teal-600 bg-teal-50 dark:bg-teal-500/15 dark:text-teal-300 px-3 py-1 rounded-full text-sm font-medium"><UploadCloud size={16} className="mr-2 animate-bounce"/> 上載至雲端中...</span>;
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
    <div className="h-screen bg-canvas text-ink dark:bg-ink-950 dark:text-white flex flex-col overflow-hidden transition-colors">
      {/* Admin Panel Overlay */}
      {showAdminPanel && <AdminPanel onLogout={handleLogout} />}

      {/* Pricing / Paywall */}
      {showPricing && <PricingModal profile={profile} onClose={() => setShowPricing(false)} />}

      {/* Login gate (Google) */}
      {showLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface dark:bg-ink-900 border border-line dark:border-ink-700 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center">
              <LogoMark size={52} className="mx-auto mb-4 rounded-[15px] shadow-[0_8px_20px_-6px_rgba(17,156,137,0.55)]" radius={15} />
              <h3 className="font-display font-bold text-lg text-ink dark:text-white mb-1">登入以開始使用</h3>
              <p className="text-sm text-ink-muted dark:text-paper-muted mb-5">新用戶登入即送 <strong className="text-teal-600 dark:text-teal-400">5 分鐘</strong> 免費額度（轉錄 + 字幕工作室共用）。</p>
              <Button onClick={handleUserLogin} isLoading={loginLoading} className="w-full h-11"><Chrome size={18} className="mr-2" /> 使用 Google 登入</Button>
              {loginError && <p className="text-xs text-red-500 mt-3">{loginError}</p>}
              <button onClick={() => setShowLogin(false)} className="text-xs text-ink-faint dark:text-paper-muted mt-4 hover:underline">稍後再說</button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Video Studio (multi-track editor) */}
      {showMT && (
        <MultiTrackEditor
          isPro={hasEntitlement}
          profile={profile}
          onConsume={(m) => { if (profile && !isPro) deductMinutes(profile.uid, m).catch(() => {}); }}
          onRequestUnlock={() => (isAnonymous && !isPro) ? setShowLogin(true) : setShowPricing(true)}
          onClose={() => setShowMT(false)}
        />
      )}

      {/* User transcription history */}
      {showHistory && profile && (
        <HistoryModal uid={profile.uid} onClose={() => setShowHistory(false)} onLoad={(t) => setTranscription(t)} onAnalyze={handleAnalyzeLogs} />
      )}

      {/* Merged AI analysis result / loading */}
      {(analysisLoading || analysisResult) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface dark:bg-ink-900 border border-line dark:border-ink-700 rounded-2xl shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-line dark:border-ink-700">
              <h3 className="font-bold text-ink dark:text-white flex items-center gap-2"><Sparkles size={18} className="text-teal-500" /> 合併 AI 分析</h3>
              <button onClick={() => { setAnalysisResult(null); setAnalysisLoading(false); }} className="text-ink-muted dark:text-paper-muted hover:text-ink dark:hover:text-white"><X size={20} /></button>
            </div>
            {analysisLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-ink-muted dark:text-paper-muted gap-3">
                <Loader2 size={32} className="animate-spin text-teal-500" />
                <p>AI 正在綜合分析所選對話...</p>
              </div>
            ) : (
              <>
                <pre className="flex-1 overflow-y-auto scrollbar-thin p-5 text-sm text-ink dark:text-paper whitespace-pre-wrap leading-relaxed">{analysisResult}</pre>
                <div className="p-3 border-t border-line dark:border-ink-700 flex justify-end">
                  <Button variant="secondary" onClick={() => { if (analysisResult) navigator.clipboard.writeText(analysisResult); }} className="text-sm">複製分析</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Navbar */}
      <header className="bg-surface/85 dark:bg-ink-900/85 backdrop-blur-md border-b border-line dark:border-ink-700/70 shrink-0 z-40 relative">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Logo
            size={38}
            subtitle="廣東話語音轉文字"
            badge={isPro && <span className="px-1.5 py-0.5 bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 text-[9px] font-bold tracking-wider rounded-md">PRO</span>}
          />
          <div className="flex items-center gap-2">
             {/* Plan / Credit badge */}
             {profile?.isAdmin ? (
                 <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 text-xs font-semibold rounded-full"><Crown size={13}/> 管理員</span>
             ) : isPro ? (
                 <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 text-xs font-semibold rounded-full"><Crown size={13}/> 完全版</span>
             ) : profile?.subscriptionStatus === 'active' ? (
                 <button onClick={() => setShowPricing(true)} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 text-xs font-semibold rounded-full hover:bg-teal-100">
                    <Crown size={13}/> 月費 · <span className="tnum">{profile.creditMinutes}</span> 分鐘
                 </button>
             ) : (
                 <button onClick={() => setShowPricing(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-canvas-sunk dark:bg-ink-800 hover:bg-line dark:hover:bg-ink-700 text-ink-muted dark:text-paper-muted text-xs font-medium rounded-full transition-colors">
                    <Coins size={13} className="text-teal-500"/> <span className="tnum">{profile ? `${profile.creditMinutes} 分鐘` : '...'}</span>
                 </button>
             )}

             {/* Upgrade CTA */}
             {!profile?.isAdmin && !isPro && (
                 <button onClick={() => setShowPricing(true)} className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold rounded-full transition-all shadow-[0_2px_8px_-2px_rgba(17,156,137,0.5)] group" title="升級方案">
                    <Sparkles size={14} className="group-hover:scale-110 transition-transform" /> 升級
                 </button>
             )}

             {/* Login state */}
             {isAnonymous && !isPro ? (
                 <button onClick={() => setShowLogin(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-ink dark:bg-white text-white dark:text-ink text-xs font-semibold rounded-full hover:opacity-90 transition-opacity">
                    <Chrome size={14} /> 登入
                 </button>
             ) : !profile?.isAdmin && !isPro ? (
                 <span className="hidden md:flex items-center gap-1.5 text-xs text-ink-muted dark:text-paper-muted max-w-[170px]">
                    <span className="w-6 h-6 rounded-full bg-teal-500 text-white flex items-center justify-center text-[10px] font-bold shrink-0">{(profile?.email || '?').charAt(0).toUpperCase()}</span>
                    <span className="truncate">{profile?.email}</span>
                    <button onClick={handleUserLogout} className="text-ink-faint hover:text-red-500 ml-0.5" title="登出"><X size={13} /></button>
                 </span>
             ) : null}

             <button onClick={() => setShowHistory(true)} className="p-2 hover:bg-canvas-sunk dark:hover:bg-ink-800 rounded-lg text-ink-faint dark:text-paper-muted hover:text-ink dark:hover:text-white transition-colors" title="我的轉換記錄">
                 <History size={17} />
             </button>
             {profile?.isAdmin && (
                 <button onClick={() => setShowAdminPanel(true)} className="p-2 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg text-amber-500 transition-colors" title="管理員後台">
                     <ShieldCheck size={17} />
                 </button>
             )}

             <div className="w-px h-6 bg-line dark:bg-ink-700 mx-1"></div>

             <DisplaySettings currentTheme={theme} currentFontSize={fontSize} onThemeChange={setTheme} onFontSizeChange={setFontSize} />

             <button onClick={() => setShowGuide(!showGuide)} className="text-sm text-ink-faint dark:text-paper-muted hover:text-teal-600 dark:hover:text-teal-400 flex items-center gap-1 font-medium transition-colors p-2 rounded-lg hover:bg-canvas-sunk dark:hover:bg-ink-800">
                <BookOpen size={18} />
                <span className="hidden sm:inline">{showGuide ? "隱藏說明" : "使用說明"}</span>
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
                                <Sparkles size={18} className="text-teal-600 dark:text-teal-400"/> 核心功能與優勢
                            </h3>
                            <ul className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
                                <li className="flex gap-3">
                                    <div className="bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 p-2 rounded-lg shrink-0 h-fit"><Mic size={18}/></div>
                                    <div>
                                        <strong className="block text-slate-800 dark:text-slate-100 mb-1">廣東話 (HK) 專用引擎</strong>
                                        <p className="leading-relaxed">精準識別<strong>中英夾雜</strong>、口語助詞、人名專名；自動分辨說話者並標註<strong>時間戳（零偏移）</strong>，內建一鍵 AI 摘要 (Q&A)。</p>
                                    </div>
                                </li>
                                <li className="flex gap-3">
                                    <div className="bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 p-2 rounded-lg shrink-0 h-fit"><Film size={18}/></div>
                                    <div>
                                        <strong className="block text-slate-800 dark:text-slate-100 mb-1">字幕工作室 + AI 自動剪重點</strong>
                                        <p className="leading-relaxed">影片預覽、時間線、模板字幕（含 karaoke 逐字）。AI 由逐字稿自動揀出精華片段，一鍵剪出精華片，瀏覽器本地輸出。</p>
                                    </div>
                                </li>
                                <li className="flex gap-3">
                                    <div className="bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 p-2 rounded-lg shrink-0 h-fit"><Clapperboard size={18}/></div>
                                    <div>
                                        <strong className="block text-slate-800 dark:text-slate-100 mb-1">瀏覽器剪片工作室</strong>
                                        <p className="leading-relaxed">匯入多個影片＋相片，排序、剪裁、設定相片秒數，一鍵合成輸出 MP4 —— 全程喺瀏覽器處理。</p>
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
                                    <span className="absolute -left-[31px] top-0 w-6 h-6 bg-teal-500 text-white rounded-full flex items-center justify-center text-xs font-bold ring-4 ring-white dark:ring-slate-900">1</span>
                                    <div>
                                        <strong className="text-slate-800 dark:text-slate-100">Google 登入</strong>
                                        <p className="mt-1">一鍵登入即可使用，<strong className="text-teal-600 dark:text-teal-400">新用戶送 5 分鐘</strong>免費額度（所有功能共用）。</p>
                                    </div>
                                </li>
                                <li className="ml-6 relative">
                                    <span className="absolute -left-[31px] top-0 w-6 h-6 bg-slate-400 dark:bg-slate-500 text-white rounded-full flex items-center justify-center text-xs font-bold ring-4 ring-white dark:ring-slate-900">2</span>
                                    <div>
                                        <strong className="text-slate-800 dark:text-slate-100">上載 + 轉錄</strong>
                                        <p className="mt-1">拖放影音 (MP3/M4A/WAV/MP4/MOV)，揀引擎、加「額外提示」(人名/專名)，即時預覽逐字稿。</p>
                                    </div>
                                </li>
                                <li className="ml-6 relative">
                                    <span className="absolute -left-[31px] top-0 w-6 h-6 bg-slate-400 dark:bg-slate-500 text-white rounded-full flex items-center justify-center text-xs font-bold ring-4 ring-white dark:ring-slate-900">3</span>
                                    <div>
                                        <strong className="text-slate-800 dark:text-slate-100">編輯 · 摘要 · 導出</strong>
                                        <p className="mt-1">表格內直接修正，生成 AI 摘要，或導出 TXT / CSV / <strong>SRT 字幕</strong>。</p>
                                    </div>
                                </li>
                                <li className="ml-6 relative">
                                    <span className="absolute -left-[31px] top-0 w-6 h-6 bg-teal-500 text-white rounded-full flex items-center justify-center text-xs font-bold ring-4 ring-white dark:ring-slate-900">4</span>
                                    <div>
                                        <strong className="text-slate-800 dark:text-slate-100">字幕 / 剪片工作室</strong>
                                        <p className="mt-1">右欄「字幕工作室」加字幕＋AI 剪重點；「剪片工作室」匯入影片＋相片合成 —— 一鍵輸出 MP4。</p>
                                    </div>
                                </li>
                            </ol>
                        </div>

                        {/* Column 3: Plans & Upgrade */}
                        <div className="bg-gradient-to-br from-teal-50 to-teal-100/60 dark:from-teal-500/10 dark:to-teal-500/5 rounded-2xl p-6 border border-teal-200/70 dark:border-teal-500/20 relative overflow-hidden flex flex-col shadow-sm">
                            <div className="absolute -top-6 -right-6 p-4 opacity-[0.07] pointer-events-none">
                                <Crown size={140} className="text-teal-600"/>
                            </div>

                            <h3 className="flex items-center gap-2 text-base font-bold text-teal-800 dark:text-teal-300 mb-4 relative z-10">
                                <Crown size={20} className="text-teal-600 dark:text-teal-400"/> 升級方案
                            </h3>

                            <div className="space-y-4 text-sm text-ink-muted dark:text-paper-muted mb-6 relative z-10 flex-1">
                                <p className="leading-relaxed">
                                    登入即送 <strong className="text-ink dark:text-white">5 分鐘</strong> 免費額度（所有功能共用）。用完可按用量購買分鐘數，或訂閱月費。
                                </p>
                                <div className="bg-surface/70 dark:bg-ink-900/50 p-4 rounded-xl border border-teal-100 dark:border-teal-500/20">
                                    <h4 className="font-bold text-teal-700 dark:text-teal-300 mb-2 flex items-center gap-2">
                                        <Unlock size={14}/> 升級後
                                    </h4>
                                    <ul className="space-y-2 text-xs font-medium text-ink dark:text-paper">
                                        <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-teal-500"/> 更多分鐘數（轉錄／字幕／剪片共用）</li>
                                        <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-teal-500"/> 長檔案智能分割器</li>
                                        <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-teal-500"/> AI 自動剪重點 + 合併分析 + 高準確引擎</li>
                                    </ul>
                                </div>
                            </div>

                            <button
                                onClick={() => { setShowPricing(true); setShowGuide(false); }}
                                className="relative z-10 w-full py-3.5 bg-teal-500 hover:bg-teal-600 hover:scale-[1.01] active:scale-[0.98] text-white font-bold rounded-xl shadow-[0_6px_16px_-4px_rgba(17,156,137,0.6)] transition-all text-sm flex items-center justify-center gap-2 group"
                            >
                                <Sparkles size={18}/>
                                <span>查看方案 & 升級</span>
                                <ArrowRight size={16} className="opacity-60 group-hover:translate-x-1 transition-transform"/>
                            </button>
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
                    <h2 className="flex items-baseline gap-2 mb-3 border-b border-line dark:border-ink-700 pb-2">
                      <span className="font-display font-extrabold text-teal-500 text-base leading-none tnum">01</span>
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted dark:text-paper-muted">上載影音</span>
                    </h2>
                    <FileUpload
                        onFileSelect={handleFileSelect}
                        selectedFile={file}
                        onClear={handleClearFile}
                        disabled={status === 'uploading' || status === 'transcribing'}
                    />
                    {!file && (
                      <div className="mt-3">
                        {(isAnonymous && !isPro) ? (
                          <button onClick={() => setShowLogin(true)}
                            className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-left hover:border-teal-400 transition-colors">
                            <span className="w-11 h-11 shrink-0 rounded-full bg-red-500/90 text-white flex items-center justify-center"><Mic size={20} /></span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">麥克風錄音</span>
                              <span className="block text-xs text-amber-500">登入後即可直接錄音轉文字</span>
                            </span>
                          </button>
                        ) : (
                          <VoiceRecorder
                            onRecordingComplete={handleFileSelect}
                            disabled={status === 'uploading' || status === 'transcribing'}
                          />
                        )}
                      </div>
                    )}
                    <div className="mt-3">
                      <LinkTranscribe
                        onTranscribe={handleTranscribeUrl}
                        busy={status === 'transcribing' || status === 'uploading'}
                      />
                    </div>
                </section>

                <section>
                    <h2 className="flex items-baseline gap-2 mb-3 border-b border-line dark:border-ink-700 pb-2">
                      <span className="font-display font-extrabold text-teal-500 text-base leading-none tnum">02</span>
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted dark:text-paper-muted">AI 設定</span>
                    </h2>
                    <SettingsPanel 
                        settings={settings}
                        onChange={setSettings}
                        disabled={status === 'uploading' || status === 'transcribing'}
                    />
                </section>

                <div className="sticky bottom-0 bg-canvas/90 dark:bg-ink-950/90 backdrop-blur pt-2 pb-2 z-10">
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
                        className="w-full h-12 text-lg shadow-teal-200 dark:shadow-none shadow-md relative overflow-hidden"
                        >
                        {!profile?.isAdmin && !isPro && file && (
                          <div className="absolute top-0 right-0 bg-amber-400 text-[9px] px-2 py-0.5 text-amber-900 font-bold rounded-bl">
                            {isAnonymous ? '登入送 5 分鐘' : `餘 ${profile?.creditMinutes ?? 0} 分鐘`}
                          </div>
                        )}
                        <PlayCircle className="mr-2" /> 開始轉錄
                        </Button>
                    )}
                </div>
            </div>

            {/* MIDDLE COLUMN: Output (6 cols) */}
            <div className="lg:col-span-6 flex flex-col h-full overflow-hidden">
                {/* Tabs Header */}
                <div className="flex items-center justify-between mb-3 shrink-0">
                   <div className="flex bg-canvas-sunk dark:bg-ink-800 p-1 rounded-xl">
                      <button
                        onClick={() => setActiveTab('transcription')}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'transcription' ? 'bg-surface dark:bg-ink-600 text-teal-700 dark:text-teal-300 shadow-sm' : 'text-ink-muted dark:text-paper-muted hover:text-ink dark:hover:text-white'}`}
                      >
                         <FileText size={16} /> 轉錄結果
                      </button>
                      <button
                        onClick={() => setActiveTab('summary')}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'summary' ? 'bg-surface dark:bg-ink-600 text-teal-700 dark:text-teal-300 shadow-sm' : 'text-ink-muted dark:text-paper-muted hover:text-ink dark:hover:text-white'}`}
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
                 {/* Featured: Unified Video Studio (multi-track editor) */}
                 <button
                    onClick={() => (isAnonymous && !isPro) ? setShowLogin(true) : setShowMT(true)}
                    className="group w-full text-left rounded-2xl p-[1.5px] bg-gradient-to-br from-teal-400 via-teal-500 to-fuchsia-500 shadow-md hover:shadow-card transition-all"
                 >
                    <div className="rounded-2xl bg-white dark:bg-slate-900 p-4">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-500 to-fuchsia-500 text-white flex items-center justify-center"><Clapperboard size={15} /></span>
                                影片工作室
                                {(isAnonymous && !isPro) && <Lock size={12} className="text-amber-500" />}
                            </span>
                            <ArrowRight size={16} className="text-teal-500 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">自由多軌剪輯 + 字幕 AI（生成/設計/逐句動畫/翻譯/配樂）+ 畫中畫 + 轉場，一個工具搞掂，輸出 MP4。</p>
                    </div>
                 </button>

                 <div>
                    <h2 className="flex items-baseline gap-2 mb-3 border-b border-line dark:border-ink-700 pb-2">
                      <span className="font-display font-extrabold text-teal-500 text-base leading-none tnum">04</span>
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted dark:text-paper-muted">輔助工具</span>
                    </h2>
                    <div className="flex flex-col gap-6">
                        {/* URL importer (download) + FileSplitter removed: long files
                            now auto-chunk in the main transcription, and links go
                            through the Gemini-direct LinkTranscribe in section 01. */}
                        <AudioExtractor gated={isAnonymous && !isPro} onRequireLogin={() => setShowLogin(true)} />
                    </div>
                 </div>
            </div>

            </div>
        </div>
      </main>

      <footer className="border-t border-line dark:border-ink-700 mt-8 py-6 px-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-ink-faint dark:text-paper-muted">
          <span>© {new Date().getFullYear()} Canto AI</span>
          <div className="flex items-center gap-4">
            <button onClick={() => setLegalTab('privacy')} className="hover:text-teal-500 transition-colors">私隱政策</button>
            <button onClick={() => setLegalTab('terms')} className="hover:text-teal-500 transition-colors">服務條款</button>
            <a href="mailto:km520daisy@gmail.com" className="hover:text-teal-500 transition-colors">聯絡我們</a>
          </div>
        </div>
      </footer>

      {legalTab && <LegalModal tab={legalTab} onClose={() => setLegalTab(null)} />}
    </div>
  );
};

export default App;