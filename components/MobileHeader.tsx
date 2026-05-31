import React from 'react';
import { UserCog, Crown } from 'lucide-react';
import { LogoMark } from './Logo';

interface MobileHeaderProps {
  isPro: boolean;
  onLoginClick: () => void;
  statusBadge?: React.ReactNode;
}

const MobileHeader: React.FC<MobileHeaderProps> = ({ isPro, onLoginClick, statusBadge }) => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 pt-[var(--safe-top)] ios-glass border-b border-slate-200/50 dark:border-white/5">
      <div className="px-5 py-2 flex items-center justify-between h-14 relative">
        {/* Left Side: Status Badge or Placeholder */}
        <div className="flex-1 flex justify-start items-center">
          {statusBadge}
        </div>

        {/* Center: Title (iOS Style) */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
          <LogoMark size={26} className="rounded-[8px]" radius={8} />
          <h1 className="text-[17px] font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-1 leading-none">
            Canto AI
            {isPro && <Crown size={12} className="text-amber-500 fill-amber-500" />}
          </h1>
        </div>

        {/* Right Side: Account/Settings */}
        <div className="flex-1 flex justify-end items-center">
            <button 
                onClick={onLoginClick}
                className="p-2 rounded-2xl bg-white/50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 active:scale-90 transition-transform shadow-sm border border-slate-100 dark:border-slate-700"
            >
                <UserCog size={18} />
            </button>
        </div>
      </div>
    </header>
  );
};

export default MobileHeader;
