import React, { useEffect, useState } from 'react';
import {
  X, Check, Zap, CalendarClock, Coins, Crown, Loader2, Sparkles,
  ShieldCheck, Gauge, Clapperboard, Wand2, Languages, Download,
} from 'lucide-react';
import { CREDIT_PACKS, MONTHLY_PLAN, FREE_TIER_MAX_MINUTES } from '../constants';
import { buyCreditPack, subscribeMonthly } from '../services/checkoutService';
import { UserProfile } from '../types';

interface PricingModalProps {
  profile: UserProfile | null;
  onClose: () => void;
}

// What every paid tier unlocks — used for the value strip.
const PERKS: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string }[] = [
  { icon: Gauge, label: '高速 + 高準確雙引擎' },
  { icon: Clapperboard, label: '多軌影片字幕工作室' },
  { icon: Wand2, label: 'AI 一鍵字幕風格化' },
  { icon: Sparkles, label: '30+ 模板 · 多層字幕' },
  { icon: Languages, label: '雙語翻譯字幕' },
  { icon: Download, label: '本地高清匯出 MP4' },
];

const PricingModal: React.FC<PricingModalProps> = ({ profile, onClose }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (id: string, fn: () => Promise<void>) => {
    if (!profile) { setError('帳戶初始化中，請稍候再試。'); return; }
    setBusy(id); setError('');
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message || '購買流程發生錯誤，請稍後再試。');
    } finally {
      setBusy(null);
    }
  };

  // Per-minute pricing for the "省 X%" comparison (baseline = smallest pack).
  const basePerMin = CREDIT_PACKS[0].priceHKD / CREDIT_PACKS[0].minutes;
  const perMin = (price: number, mins: number) => price / mins;
  const savePct = (price: number, mins: number) =>
    Math.max(0, Math.round((1 - perMin(price, mins) / basePerMin) * 100));
  const fmtPerMin = (price: number, mins: number) => `HK$${perMin(price, mins).toFixed(2)}`;
  const monthlySave = savePct(MONTHLY_PLAN.priceHKD, MONTHLY_PLAN.monthlyMinutes);
  const isActive = profile?.subscriptionStatus === 'active';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 dark:bg-black/70 backdrop-blur-md p-3 sm:p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-surface dark:bg-ink-900 border border-line dark:border-ink-700 rounded-[1.5rem] shadow-lift w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Decorative ambient glow */}
        <div className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-20 w-80 h-80 rounded-full bg-amber-300/10 blur-3xl" />

        {/* Header */}
        <div className="relative shrink-0 px-6 pt-6 pb-5 border-b border-line dark:border-ink-700/70">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-9 h-9 grid place-items-center rounded-full text-ink-muted dark:text-paper-muted hover:bg-canvas-sunk dark:hover:bg-ink-800 hover:text-ink dark:hover:text-white transition-colors"
            aria-label="關閉"
          >
            <X size={18} />
          </button>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-500/12 text-teal-600 dark:text-teal-300 text-[11px] font-bold tracking-wide mb-3">
            <Crown size={13} className="text-amber-400" /> 升級 Canto AI Pro
          </div>
          <h3 className="font-display text-2xl sm:text-[28px] font-extrabold text-ink dark:text-white leading-tight">
            解鎖完整轉錄 + 影片字幕工作室
          </h3>
          <p className="text-sm text-ink-muted dark:text-paper-muted mt-1.5">
            長片無限轉錄、AI 一鍵字幕、多軌剪輯，一次過搞掂。
          </p>

          {/* Balance pill */}
          {profile && (
            <div className="mt-4 inline-flex items-center gap-2.5 rounded-full bg-canvas-sunk dark:bg-ink-800/70 border border-line dark:border-ink-700 pl-3 pr-1.5 py-1.5 text-sm">
              <Coins size={15} className="text-amber-400" />
              <span className="text-ink-muted dark:text-paper-muted">餘額</span>
              <span className="font-bold text-ink dark:text-white tnum">
                {profile.isAdmin ? '無限' : `${profile.creditMinutes} 分鐘`}
              </span>
              {isActive && (
                <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 text-[10px] font-bold rounded-full">月費生效中</span>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="relative px-6 py-6 overflow-y-auto scrollbar-thin">
          {/* Monthly hero */}
          <div className="relative rounded-[1.25rem] p-[1.5px] bg-gradient-to-br from-teal-400 via-teal-500 to-emerald-400 shadow-lift mb-7">
            <div className="relative rounded-[1.15rem] bg-surface dark:bg-ink-850 p-5 sm:p-6 overflow-hidden">
              <div className="pointer-events-none absolute -top-16 -right-10 w-48 h-48 rounded-full bg-teal-400/15 blur-2xl" />
              <div className="flex flex-col sm:flex-row sm:items-start gap-5">
                {/* Left: price */}
                <div className="sm:w-[42%] sm:border-r sm:border-line dark:sm:border-ink-700/70 sm:pr-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center gap-1.5 text-teal-600 dark:text-teal-300 font-bold">
                      <CalendarClock size={17} /> {MONTHLY_PLAN.label}
                    </span>
                    <span className="px-2 py-0.5 bg-teal-500 text-white text-[10px] font-extrabold rounded-full shadow">最抵</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-display text-4xl sm:text-5xl font-extrabold text-ink dark:text-white tnum">HK${MONTHLY_PLAN.priceHKD}</span>
                    <span className="text-ink-muted dark:text-paper-muted text-sm">/ 月</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[12px] text-ink-muted dark:text-paper-muted">
                      每月 <b className="text-ink dark:text-white tnum">{MONTHLY_PLAN.monthlyMinutes}</b> 分鐘
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-600 dark:text-amber-300 text-[11px] font-bold tnum">
                      ≈ {fmtPerMin(MONTHLY_PLAN.priceHKD, MONTHLY_PLAN.monthlyMinutes)} / 分鐘
                    </span>
                  </div>
                  {monthlySave > 0 && (
                    <div className="mt-1.5 text-[12px] font-bold text-emerald-600 dark:text-emerald-400">
                      比單買慳 {monthlySave}%
                    </div>
                  )}
                </div>

                {/* Right: perks + CTA */}
                <div className="flex-1">
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm text-ink dark:text-paper mb-4">
                    {[
                      `每月 ${MONTHLY_PLAN.monthlyMinutes} 分鐘額度`,
                      'AI 一鍵字幕 · 免扣分鐘',
                      '解除單檔長度限制',
                      '優先高準確引擎',
                      '多軌字幕工作室全功能',
                      '本地高清匯出 MP4',
                    ].map((t) => (
                      <li key={t} className="flex items-start gap-2">
                        <span className="mt-0.5 w-4 h-4 shrink-0 grid place-items-center rounded-full bg-emerald-500/15">
                          <Check size={11} className="text-emerald-500" strokeWidth={3} />
                        </span>
                        <span className="text-ink-muted dark:text-paper-muted">{t}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => run('monthly', () => subscribeMonthly(profile!.uid))}
                    disabled={!!busy || isActive}
                    className="w-full h-12 rounded-xl bg-teal-500 hover:bg-teal-400 active:scale-[0.99] text-white font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-60 shadow-lg shadow-teal-500/25"
                  >
                    {busy === 'monthly' ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                    {isActive ? '月費生效中' : '立即訂閱月費'}
                  </button>
                  <p className="text-[11px] text-ink-faint dark:text-paper-muted text-center mt-2">隨時於帳戶取消 · 額度每期重置</p>
                </div>
              </div>
            </div>
          </div>

          {/* PAYG packs */}
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center gap-1.5 text-ink-muted dark:text-paper-muted text-[11px] font-bold uppercase tracking-wider">
              <Zap size={13} className="text-amber-400" /> 或按用量購買 · 永久有效
            </span>
            <span className="flex-1 h-px bg-line dark:bg-ink-700/70" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-7">
            {CREDIT_PACKS.map((pack) => {
              const pct = savePct(pack.priceHKD, pack.minutes);
              const popular = (pack as any).popular;
              return (
                <div
                  key={pack.id}
                  className={`group relative rounded-2xl border p-5 flex flex-col transition-all hover:-translate-y-1 hover:shadow-lift ${
                    popular
                      ? 'border-teal-400 dark:border-teal-500/60 bg-gradient-to-b from-teal-50 to-surface dark:from-teal-500/10 dark:to-ink-850 ring-1 ring-teal-400/30'
                      : 'border-line dark:border-ink-700/70 bg-surface dark:bg-ink-850 hover:border-teal-300 dark:hover:border-teal-500/50'
                  }`}
                >
                  {popular && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-teal-500 text-white text-[10px] font-extrabold rounded-full shadow-md whitespace-nowrap">
                      ★ 最受歡迎
                    </span>
                  )}
                  <div className="flex items-baseline justify-between">
                    <div className="font-display text-xl font-extrabold text-ink dark:text-white tnum">{pack.minutes}<span className="text-sm font-semibold text-ink-muted dark:text-paper-muted"> 分鐘</span></div>
                    {pct > 0 && (
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">省 {pct}%</span>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold text-ink dark:text-white tnum">HK${pack.priceHKD}</span>
                  </div>
                  <div className="text-[11px] text-ink-faint dark:text-paper-muted tnum mb-4">≈ {fmtPerMin(pack.priceHKD, pack.minutes)} / 分鐘</div>
                  <button
                    onClick={() => run(pack.id, () => buyCreditPack(profile!.uid, pack.id))}
                    disabled={!!busy}
                    className={`mt-auto h-10 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-60 ${
                      popular
                        ? 'bg-teal-500 hover:bg-teal-400 text-white shadow-md shadow-teal-500/25'
                        : 'bg-canvas-sunk dark:bg-ink-700 text-ink dark:text-white hover:bg-line dark:hover:bg-ink-600'
                    }`}
                  >
                    {busy === pack.id ? <Loader2 size={15} className="animate-spin" /> : <Coins size={15} />}
                    購買
                  </button>
                </div>
              );
            })}
          </div>

          {/* Value strip */}
          <div className="rounded-2xl border border-line dark:border-ink-700/70 bg-canvas-sunk/60 dark:bg-ink-800/40 p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-faint dark:text-paper-muted mb-3">付費即享</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              {PERKS.map((p) => (
                <div key={p.label} className="flex items-center gap-2.5">
                  <span className="w-8 h-8 shrink-0 grid place-items-center rounded-lg bg-teal-500/12 text-teal-600 dark:text-teal-300">
                    <p.icon size={16} />
                  </span>
                  <span className="text-[12.5px] text-ink dark:text-paper leading-tight">{p.label}</span>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="mt-5 p-3 bg-red-500/10 text-red-500 dark:text-red-300 text-xs rounded-xl border border-red-500/30 text-center">
              {error}
            </div>
          )}
        </div>

        {/* Footer trust bar */}
        <div className="shrink-0 px-6 py-3.5 border-t border-line dark:border-ink-700/70 bg-canvas-sunk/40 dark:bg-ink-900/60 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[11px] text-ink-faint dark:text-paper-muted">
          <span className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-teal-500" /> Stripe 安全付款</span>
          <span className="flex items-center gap-1.5"><Coins size={13} className="text-amber-400" /> 分鐘數永久有效</span>
          <span className="flex items-center gap-1.5"><Zap size={13} className="text-teal-500" /> 即時到帳</span>
          <span>免費版單檔最長 {FREE_TIER_MAX_MINUTES} 分鐘</span>
        </div>
      </div>
    </div>
  );
};

export default PricingModal;
