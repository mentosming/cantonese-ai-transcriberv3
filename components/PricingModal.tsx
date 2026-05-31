import React, { useState } from 'react';
import { X, Check, Zap, CalendarClock, Coins, Crown, Loader2, Sparkles } from 'lucide-react';
import { CREDIT_PACKS, MONTHLY_PLAN, FREE_TIER_MAX_MINUTES } from '../constants';
import { buyCreditPack, subscribeMonthly } from '../services/checkoutService';
import { UserProfile } from '../types';

interface PricingModalProps {
  profile: UserProfile | null;
  onClose: () => void;
}

const PricingModal: React.FC<PricingModalProps> = ({ profile, onClose }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-surface dark:bg-ink-900 border border-line dark:border-ink-700 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-line dark:border-ink-700 bg-gradient-to-r from-teal-500/20 to-teal-500/5">
          <h3 className="font-bold text-ink dark:text-white flex items-center gap-2 text-lg">
            <Crown size={20} className="text-amber-400" /> 升級方案
          </h3>
          <button onClick={onClose} className="text-ink-muted dark:text-paper-muted hover:text-ink dark:hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {profile && (
            <div className="mb-6 flex items-center justify-between rounded-xl bg-canvas-sunk dark:bg-ink-800/60 border border-line dark:border-ink-700 px-4 py-3 text-sm">
              <span className="text-ink-muted dark:text-paper-muted">目前餘額</span>
              <span className="font-bold text-ink dark:text-white flex items-center gap-1.5">
                <Coins size={16} className="text-amber-400" />
                {profile.isAdmin ? '無限 (管理員)' : `${profile.creditMinutes} 分鐘`}
                {profile.subscriptionStatus === 'active' && (
                  <span className="ml-2 px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] rounded-full">月費生效中</span>
                )}
              </span>
            </div>
          )}

          {/* Monthly plan — hero */}
          <div className="relative rounded-2xl border border-teal-300 dark:border-teal-500/50 bg-gradient-to-br from-teal-50 to-teal-100/50 dark:from-teal-500/20 dark:to-ink-800/40 p-5 mb-6 overflow-hidden">
            <span className="absolute top-4 right-4 px-2.5 py-1 bg-teal-500 text-white text-[10px] font-bold rounded-full">最抵</span>
            <div className="flex items-center gap-2 text-teal-700 dark:text-teal-300 font-semibold mb-1">
              <CalendarClock size={18} /> {MONTHLY_PLAN.label}（月費）
            </div>
            <div className="flex items-baseline gap-1 mb-3">
              <span className="text-3xl font-extrabold text-ink dark:text-white">HK${MONTHLY_PLAN.priceHKD}</span>
              <span className="text-ink-muted dark:text-paper-muted text-sm">/ 月</span>
            </div>
            <ul className="space-y-1.5 text-sm text-ink-muted dark:text-paper-muted mb-4">
              <li className="flex items-center gap-2"><Check size={15} className="text-emerald-400" /> 每月 {MONTHLY_PLAN.monthlyMinutes} 分鐘轉錄額度</li>
              <li className="flex items-center gap-2"><Check size={15} className="text-emerald-400" /> 解除單檔長度限制 + 分割器</li>
              <li className="flex items-center gap-2"><Check size={15} className="text-emerald-400" /> 優先使用高準確引擎</li>
              <li className="flex items-center gap-2"><Check size={15} className="text-emerald-400" /> 本地影片字幕渲染 (HyperFrames)</li>
            </ul>
            <button
              onClick={() => run('monthly', () => subscribeMonthly(profile!.uid))}
              disabled={!!busy}
              className="w-full h-11 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy === 'monthly' ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              訂閱月費
            </button>
          </div>

          {/* PAYG credit packs */}
          <div className="flex items-center gap-2 text-ink-muted dark:text-paper-muted text-xs font-semibold uppercase tracking-wider mb-3">
            <Zap size={14} /> 或按用量購買分鐘數 (Pay As You Go)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
            {CREDIT_PACKS.map((pack) => (
              <div
                key={pack.id}
                className={`relative rounded-xl border p-4 flex flex-col ${
                  pack.popular ? 'border-amber-400/60 bg-amber-400/5' : 'border-line dark:border-ink-700/70 bg-canvas-sunk dark:bg-ink-800/40'
                }`}
              >
                {pack.popular && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-teal-500 text-white text-[10px] font-bold rounded-full">熱門</span>
                )}
                <div className="text-ink dark:text-paper font-bold text-lg">{pack.label}</div>
                <div className="text-ink-muted dark:text-paper-muted text-sm mb-3">HK${pack.priceHKD}</div>
                <button
                  onClick={() => run(pack.id, () => buyCreditPack(profile!.uid, pack.id))}
                  disabled={!!busy}
                  className="mt-auto h-9 rounded-lg bg-ink dark:bg-ink-700 hover:opacity-90 text-white text-sm font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  {busy === pack.id ? <Loader2 size={15} className="animate-spin" /> : <Coins size={15} />}
                  購買
                </button>
              </div>
            ))}
          </div>

          <p className="text-xs text-ink-faint dark:text-paper-muted mt-4 text-center">
            免費版可轉錄單檔最長 {FREE_TIER_MAX_MINUTES} 分鐘。分鐘數永久有效；月費額度每期重置。
          </p>

          {error && (
            <div className="mt-4 p-3 bg-red-500/10 text-red-300 text-xs rounded-lg border border-red-500/30 text-center">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PricingModal;
