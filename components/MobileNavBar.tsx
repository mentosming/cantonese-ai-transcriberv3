import React from 'react';
import { Mic, History, Settings, Sparkles } from 'lucide-react';

interface MobileNavBarProps {
  activeTab: string;
  onTabChange: (tab: any) => void;
}

const MobileNavBar: React.FC<MobileNavBarProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'record', label: '錄音 / 匯入', icon: <Mic size={20} /> },
    { id: 'history', label: '轉錄結果', icon: <History size={20} /> },
    { id: 'summary', label: 'AI 摘要', icon: <Sparkles size={20} /> },
    { id: 'settings', label: '設定', icon: <Settings size={20} /> },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 px-6 pb-[calc(var(--safe-bottom)+10px)] pt-3 ios-glass border-t border-slate-200/50 dark:border-slate-800/50">
      <div className="max-w-md mx-auto flex justify-between items-center">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center gap-1 transition-all duration-300 ${
              activeTab === tab.id 
                ? 'text-blue-600 dark:text-blue-400 scale-110' 
                : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <div className={`p-1 rounded-xl ${activeTab === tab.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
              {tab.icon}
            </div>
            <span className="text-[10px] font-bold tracking-tight uppercase">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default MobileNavBar;
