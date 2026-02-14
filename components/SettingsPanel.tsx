
import React, { useState } from 'react';
import { Settings2, Plus, Trash2, Clock, Globe, MessageSquarePlus, CheckSquare, Square } from 'lucide-react';
import { TranscriptionSettings, Speaker } from '../types';
import { LANGUAGES } from '../constants';

interface SettingsPanelProps {
  settings: TranscriptionSettings;
  onChange: (s: TranscriptionSettings) => void;
  disabled?: boolean;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onChange, disabled }) => {
  const [newSpeakerName, setNewSpeakerName] = useState('');

  const toggleDiarization = () => {
    onChange({ ...settings, enableDiarization: !settings.enableDiarization });
  };

  const toggleTimestamps = () => {
    onChange({ ...settings, enableTimestamps: !settings.enableTimestamps });
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...settings, model: e.target.value as any });
  };
  
  const toggleLanguage = (langId: string) => {
    if (disabled) return;
    
    let newLangs = [...settings.language];
    if (newLangs.includes(langId)) {
        // Don't allow removing if it's the only one
        if (newLangs.length > 1) {
            newLangs = newLangs.filter(id => id !== langId);
        }
    } else {
        if (newLangs.length < 3) {
            newLangs.push(langId);
        } else {
            alert("最多只能選擇 3 種語言 (Maximum 3 languages)");
            return;
        }
    }
    onChange({ ...settings, language: newLangs });
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

  return (
    <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
      <div className="flex items-center gap-2 mb-4 text-slate-800 dark:text-slate-100">
        <Settings2 size={20} />
        <h2 className="font-semibold text-lg">AI 設定</h2>
      </div>

      <div className="space-y-6">
        {/* Language Selection (Multi-select) */}
        <div>
           <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 flex justify-between">
               <span>音訊語言 (可多選, 最多3項)</span>
               <span className="text-xs text-slate-400">{settings.language.length}/3</span>
           </label>
           <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin">
              {LANGUAGES.map(lang => {
                  const isSelected = settings.language.includes(lang.id);
                  return (
                    <button
                        key={lang.id}
                        onClick={() => toggleLanguage(lang.id)}
                        disabled={disabled}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium text-left transition-all
                            ${isSelected 
                                ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300' 
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-600'}
                            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        {isSelected ? <CheckSquare size={14} className="shrink-0"/> : <Square size={14} className="shrink-0"/>}
                        <span className="truncate">{lang.name}</span>
                    </button>
                  );
              })}
           </div>
        </div>

        {/* Model Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">模型選擇</label>
          <select 
            value={settings.model}
            onChange={handleModelChange}
            disabled={disabled}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm text-slate-900 dark:text-slate-100"
          >
            <option value="gemini-3-pro-preview">Gemini 3.0 Pro (最佳準確度)</option>
            <option value="gemini-3-flash-preview">Gemini 3.0 Flash (速度優先)</option>
          </select>
          {settings.model === 'gemini-3-pro-preview' && (
              <p className="text-[10px] text-green-600 dark:text-green-400 mt-1">
                  * 推薦使用 Pro 模型以獲得最精準的時間戳對齊。
              </p>
          )}
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
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono text-slate-900 dark:text-slate-100"
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
             className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm min-h-[80px] resize-y text-slate-900 dark:text-slate-100 placeholder-slate-400"
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
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">分辨說話者 (Speaker Diarization)</span>
            <input 
              type="checkbox" 
              checked={settings.enableDiarization}
              onChange={toggleDiarization}
              disabled={disabled}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
          </label>
        </div>

        {/* Speaker Management */}
        {settings.enableDiarization && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">預設說話者名稱 (選填)</label>
            <div className="flex gap-2 mb-3">
              <input 
                type="text" 
                placeholder="輸入名字 (例如: Peter)" 
                value={newSpeakerName}
                onChange={(e) => setNewSpeakerName(e.target.value)}
                disabled={disabled}
                onKeyDown={(e) => e.key === 'Enter' && addSpeaker()}
                className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button 
                onClick={addSpeaker}
                disabled={disabled || !newSpeakerName.trim()}
                className="p-2 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 disabled:opacity-50"
              >
                <Plus size={18} />
              </button>
            </div>
            
            <div className="space-y-2 max-h-[150px] overflow-y-auto scrollbar-thin">
              {settings.speakers.map((s, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-700 rounded text-sm">
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
