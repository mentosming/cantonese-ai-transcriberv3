import React, { useState, useRef, useEffect } from 'react';
import { Moon, Sun, Monitor, Type, Check } from 'lucide-react';

interface DisplaySettingsProps {
  currentTheme: 'light' | 'dark';
  currentFontSize: 'normal' | 'large' | 'xl';
  onThemeChange: (theme: 'light' | 'dark') => void;
  onFontSizeChange: (size: 'normal' | 'large' | 'xl') => void;
}

const DisplaySettings: React.FC<DisplaySettingsProps> = ({ 
  currentTheme, 
  currentFontSize, 
  onThemeChange, 
  onFontSizeChange 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fontSizes = [
    { id: 'normal', label: '預設 (Default)', scale: '100%' },
    { id: 'large', label: '大字體 (Large)', scale: '110%' },
    { id: 'xl', label: '超大 (Extra Large)', scale: '125%' },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="text-sm text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 flex items-center gap-1 font-medium transition-colors p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
        title="顯示設定"
      >
        <Monitor size={18} />
        <span className="hidden sm:inline">顯示設定</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-4 z-50 animate-fade-in">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">顯示模式</h3>
            
            {/* Theme Toggle */}
            <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg mb-6">
                <button
                    onClick={() => onThemeChange('light')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
                        currentTheme === 'light' 
                        ? 'bg-white text-blue-600 shadow-sm' 
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                >
                    <Sun size={16} /> 淺色
                </button>
                <button
                    onClick={() => onThemeChange('dark')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
                        currentTheme === 'dark' 
                        ? 'bg-slate-600 text-white shadow-sm' 
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                >
                    <Moon size={16} /> 深色
                </button>
            </div>

            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">字體大小</h3>
            
            {/* Font Size List */}
            <div className="space-y-2">
                {fontSizes.map((size) => (
                    <button
                        key={size.id}
                        onClick={() => onFontSizeChange(size.id as any)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
                            currentFontSize === size.id 
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800' 
                            : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300'
                        }`}
                    >
                        <div className="flex items-center gap-3">
                            <Type size={16} className={currentFontSize === size.id ? 'text-blue-500' : 'text-slate-400'} />
                            <span className="text-sm font-medium">{size.label}</span>
                        </div>
                        {currentFontSize === size.id && <Check size={16} className="text-blue-600 dark:text-blue-400" />}
                    </button>
                ))}
            </div>
        </div>
      )}
    </div>
  );
};

export default DisplaySettings;