import React, { useState, useRef, useEffect } from 'react';
import { Settings2, Plus, Trash2, Clock, Globe, MessageSquarePlus, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { TranscriptionSettings, Speaker } from '../types';
import { LANGUAGES } from '../constants';

interface SettingsPanelProps {
  settings: TranscriptionSettings;
  onChange: (s: TranscriptionSettings) => void;
  disabled?: boolean;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onChange, disabled }) => {
  const [newSpeakerName, setNewSpeakerName] = useState('');
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setIsLangMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDiarization = () => {
    onChange({ ...settings, enableDiarization: !settings.enableDiarization });
  };

  const toggleTimestamps = () => {
    onChange({ ...settings, enableTimestamps: !settings.enableTimestamps });
  };

  // Multi-select Language Handler
  const toggleLanguage = (langId: string) => {
      if (disabled) return;
      
      const current = settings.language;
      const exists = current.includes(langId);

      let updated: string[];
      if (exists) {
          // Prevent deselecting the last language
          if (current.length <= 1) return;
          updated = current.filter(id => id !== langId);
      } else {
          // Limit to 3 languages
          if (current.length >= 3) return;
          updated = [...current, langId];
      }
      onChange({ ...settings, language: updated });
  };
  
  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...settings, startTime: e.target.value });
  };

  const handleCustomPromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ ...settings, customPrompt: e.target.value });
  };

  const addSpeaker = () => {
    if (!newSpeakerName.trim()) return;
    const newSpeaker: Speaker = {
      id: `Speaker ${settings.speakers.length + 1}`,
      name: newSpeakerName.trim()
    };
    onChange({ ...settings, speakers: [...settings.speakers, newSpeaker] });
    setNewSpeakerName('');
  };

  const removeSpeaker = (index: number) => {
    const updated = settings.speakers.filter((_, i) => i !== index);
    onChange({ ...settings, speakers: updated });
  };

  // Helper to get display text for selected languages
  const getSelectedLangNames = () => {
      const names = LANGUAGES.filter(l => settings.language.includes(l.id)).map(l => l.name);
      return names.join(', ');
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
      <div className="flex items-center gap-2 mb-4 text-slate-800 dark:text-slate-100">
        <Settings2 size={20} />
        <h2 className="font-semibold text-lg">AI 設定</h2>
      </div>

      <div className="space-y-6">
        {/* Language Selection (Multi-Select) */}
        <div>
           <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
               音訊語言 (最多 3 種)
           </label>
           <div className="relative" ref={langMenuRef}>
              <button 
                type="button"
                onClick={() => !disabled && setIsLangMenuOpen(!isLangMenuOpen)}
                className={`w-full pl-3 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm text-slate-900 dark:text-slate-100 flex items-center justify-between text-left ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <Globe size={16} className="text-slate-400 shrink-0" />
                    <span className="truncate block">{getSelectedLangNames()}</span>
                  </div>
                  {isLangMenuOpen ? <ChevronUp size={16} className="text-slate-400"/> : <ChevronDown size={16} className="text-slate-400"/>}
              </button>

              {isLangMenuOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-20 max-h-60 overflow-y-auto animate-fade-in">
                      {LANGUAGES.map(lang => {
                          const isSelected = settings.language.includes(lang.id);
                          const isDisabled = !isSelected && settings.language.length >= 3;
                          
                          return (
                              <div 
                                key={lang.id}
                                onClick={() => !isDisabled && toggleLanguage(lang.id)}
                                className={`px-4 py-2.5 text-sm flex items-center justify-between transition-colors ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                              >
                                  <div className="flex items-center gap-2">
                                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-500'}`}>
                                          {isSelected && <Check size={12} className="text-white" />}
                                      </div>
                                      <span className="text-slate-700 dark:text-slate-200">{lang.name}</span>
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              )}
           </div>
           <p className="text-xs text-slate-400 mt-1">若音訊包含多種語言 (Mixed)，請勾選所有對應的語言。</p>
        </div>
        
        {/* Start Time Config */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">起始時間 (Start Timestamp)</label>
          <div className="relative">
            <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="00:00" 
              value={settings.startTime}
              onChange={handleStartTimeChange}
              disabled={disabled}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono text-slate-900 dark:text-slate-100"
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">用於接續轉錄時，校正該片段的開始時間 (格式: MM:SS)</p>
        </div>

        {/* Custom Prompt (Remarks) */}
        <div>
           <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
             <MessageSquarePlus size={16} className="text-slate-400" />
             額外提示 (Remarks)
           </label>
           <textarea
             value={settings.customPrompt || ''}
             onChange={handleCustomPromptChange}
             disabled={disabled}
             placeholder="輸入特定的指令，例如：'這是一場關於法律的討論，請特別留意專有名詞' 或 '請將 John 識別為 律師'"
             className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm min-h-[80px] resize-y text-slate-900 dark:text-slate-100"
           />
           <p className="text-xs text-slate-400 mt-1">AI 會根據這些提示調整轉錄風格或關注點。</p>
        </div>

        {/* Toggles */}
        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">顯示時間戳 [開始 - 結束]</span>
            <input 
              type="checkbox" 
              checked={settings.enableTimestamps}
              onChange={toggleTimestamps}
              disabled={disabled}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">分辨說話者 (Speaker Diarization)</span>
            <input 
              type="checkbox" 
              checked={settings.enableDiarization}
              onChange={toggleDiarization}
              disabled={disabled}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600"
            />
          </label>
        </div>

        {/* Speaker Management */}
        {settings.enableDiarization && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">預設說話者名稱 (選填)</label>
            <div className="flex gap-2 mb-3">
              <input 
                type="text" 
                placeholder="輸入名字 (例如: Peter)" 
                value={newSpeakerName}
                onChange={(e) => setNewSpeakerName(e.target.value)}
                disabled={disabled}
                onKeyDown={(e) => e.key === 'Enter' && addSpeaker()}
                className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button 
                onClick={addSpeaker}
                disabled={disabled || !newSpeakerName.trim()}
                className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/60 disabled:opacity-50"
              >
                <Plus size={18} />
              </button>
            </div>
            
            <div className="space-y-2 max-h-[150px] overflow-y-auto scrollbar-thin">
              {settings.speakers.map((s, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded text-sm border border-transparent dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-300 font-medium">Speaker {idx + 1}: {s.name}</span>
                  <button 
                    onClick={() => removeSpeaker(idx)}
                    disabled={disabled}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {settings.speakers.length === 0 && (
                <p className="text-xs text-slate-400 italic">未添加名稱，AI 將使用 "Speaker 1" 等標籤。</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPanel;