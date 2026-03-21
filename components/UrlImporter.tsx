import React, { useState, useRef } from 'react';
import { Globe, Link, Zap, Download, Mic, Loader2, AlertCircle, CheckCircle2, X, Lock } from 'lucide-react';
import Button from './Button';
import { fetchMediaInfo, downloadAudio, MediaInfo } from '../services/downloadService';
import { DownloadStatus } from '../types';

interface URLImporterProps {
  onFileReady: (file: File) => void;
  disabled?: boolean;
  isPro?: boolean;
  onRequestUnlock?: () => void;
}

const URLImporter: React.FC<URLImporterProps> = ({ onFileReady, disabled, isPro, onRequestUnlock }) => {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<DownloadStatus>('idle');
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [bytesReceived, setBytesReceived] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isProcessing = status === 'connecting' || status === 'downloading';

  const resetState = () => {
    setStatus('idle');
    setMediaInfo(null);
    setBytesReceived(0);
    setErrorMsg(null);
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (errorMsg) setErrorMsg(null);
  };

  const handleClearUrl = () => {
    setUrl('');
    resetState();
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  };

  /**
   * 核心下載邏輯（快速匯入與下載 MP3 共用）
   */
  const performDownload = async (): Promise<File | null> => {
    if (!url.trim()) {
      setErrorMsg('請輸入有效的網址');
      return null;
    }

    resetState();
    setStatus('connecting');

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      // 1. 取得影片資訊
      const info = await fetchMediaInfo(url.trim());
      setMediaInfo(info);

      // 2. 下載音訊
      setStatus('downloading');
      const file = await downloadAudio(
        url.trim(),
        (bytes) => setBytesReceived(bytes),
        abortController.signal
      );

      setStatus('complete');
      return file;

    } catch (err: any) {
      if (err.name === 'AbortError') {
        setStatus('idle');
        return null;
      }
      setStatus('error');
      setErrorMsg(err.message || '無法連接至下載伺服器，請檢查網絡');
      return null;
    } finally {
      abortRef.current = null;
    }
  };

  /**
   * 快速匯入：下載後直接送到 FileUpload 進行轉錄
   */
  const handleQuickImport = async () => {
    const file = await performDownload();
    if (file) {
      onFileReady(file);
    }
  };

  /**
   * 下載 MP3：下載後觸發瀏覽器儲存
   */
  const handleDownloadMp3 = async () => {
    if (!isPro) {
      onRequestUnlock?.();
      return;
    }
    const file = await performDownload();
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    }
  };

  /**
   * 取消下載
   */
  const handleCancel = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStatus('idle');
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
      {/* 標題列 */}
      <div className="flex items-center gap-2 mb-3">
        <div className="text-blue-600 dark:text-blue-400">
          <Globe size={20} />
        </div>
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">網絡連結匯入</h3>
        <span className="px-2 py-0.5 bg-purple-600 text-white text-[10px] font-bold rounded-full">
          V5.4 (Download+)
        </span>
      </div>

      {/* 說明 */}
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        從 YouTube、Instagram、TikTok、Facebook 等平台匯入影音進行轉錄。
      </p>

      <div className="flex flex-col gap-3">
        {/* 網址輸入框 */}
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
            <Link size={14} />
          </div>
          <input
            type="text"
            value={url}
            onChange={handleUrlChange}
            placeholder="貼上影片連結 (YouTube, Instagram...)"
            disabled={disabled || isProcessing}
            className="w-full pl-9 pr-8 py-2 text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 transition-colors"
          />
          {url && !isProcessing && (
            <button
              onClick={handleClearUrl}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* 影片資訊預覽 */}
        {mediaInfo && (
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded border border-slate-100 dark:border-slate-700">
            <span className="text-xs text-slate-700 dark:text-slate-300 truncate flex-1">
              {mediaInfo.title}
            </span>
            {mediaInfo.duration > 0 && (
              <span className="text-[10px] text-slate-400 shrink-0">
                {formatDuration(mediaInfo.duration)}
              </span>
            )}
          </div>
        )}

        {/* 三個操作按鈕 */}
        <div className="flex gap-2">
          {isProcessing ? (
            <Button
              onClick={handleCancel}
              variant="danger"
              className="flex-1 text-xs"
            >
              <X size={14} /> 取消
            </Button>
          ) : (
            <>
              <Button
                onClick={handleQuickImport}
                disabled={!url.trim() || disabled}
                className="flex-1 text-xs"
              >
                <Zap size={14} /> 快速匯入
              </Button>
              <Button
                onClick={handleDownloadMp3}
                disabled={!isPro ? false : (!url.trim() || disabled)}
                variant="secondary"
                className={`flex-1 text-xs dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-600 ${!isPro ? 'opacity-80' : ''}`}
                title={!isPro ? '需要 Pro 版才能使用' : undefined}
              >
                {!isPro ? <Lock size={12} /> : <Download size={14} />} 下載 MP3
              </Button>
              <Button
                disabled={true}
                variant="secondary"
                className="flex-1 text-xs dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600"
                title="即將推出"
              >
                <Mic size={14} /> 同步錄製
              </Button>
            </>
          )}
        </div>

        {/* 進度 / 狀態 / 錯誤訊息 */}
        {(status !== 'idle' || errorMsg) && (
          <div className={`text-xs flex items-center gap-2 ${
            errorMsg
              ? 'text-red-600 dark:text-red-400'
              : status === 'complete'
                ? 'text-green-600 dark:text-green-400'
                : 'text-slate-500 dark:text-slate-400'
          }`}>
            {errorMsg ? (
              <AlertCircle size={14} />
            ) : status === 'complete' ? (
              <CheckCircle2 size={14} />
            ) : (
              <Loader2 size={14} className="animate-spin" />
            )}
            <span className="truncate flex-1">
              {errorMsg
                || (status === 'connecting' && '連接中...')
                || (status === 'downloading' && `下載中... ${formatBytes(bytesReceived)}`)
                || (status === 'complete' && `完成！${formatBytes(bytesReceived)}`)
              }
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default URLImporter;
