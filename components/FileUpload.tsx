import React, { useRef, useState } from 'react';
import { Upload, FileAudio, FileVideo, X } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  onClear: () => void;
  disabled?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, selectedFile, onClear, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      validateAndSetFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    const validTypes = [
      'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/aac', 'audio/flac', 'audio/ogg', 'audio/mp4', 'audio/webm',
      'video/mp4', 'video/quicktime', 'video/webm'
    ];
    // Simple check (can be expanded)
    if (validTypes.some(type => file.type.includes(type.split('/')[1]) || file.type.startsWith('audio/') || file.type.startsWith('video/'))) {
      onFileSelect(file);
    } else {
      alert("不支援的檔案格式。請上載音訊或影片檔案。");
    }
  };

  if (selectedFile) {
    const isVideo = selectedFile.type.startsWith('video');
    const sizeInMB = (selectedFile.size / (1024 * 1024)).toFixed(2);

    return (
      <div className="w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm transition-colors">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 shrink-0">
              {isVideo ? <FileVideo size={24} /> : <FileAudio size={24} />}
            </div>
            <div className="min-w-0">
              <h3 className="font-medium text-slate-900 dark:text-white truncate">{selectedFile.name}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{sizeInMB} MB • {selectedFile.type}</p>
            </div>
          </div>
          {!disabled && (
            <button onClick={onClear} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-red-500 transition-colors">
              <X size={20} />
            </button>
          )}
        </div>
        
        {/* Preview Player */}
        <div className="w-full bg-black rounded-lg overflow-hidden border border-slate-800">
          {isVideo ? (
            <video 
              controls 
              className="w-full max-h-[300px]" 
              src={URL.createObjectURL(selectedFile)} 
            />
          ) : (
            <audio 
              controls 
              className="w-full" 
              src={URL.createObjectURL(selectedFile)} 
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        w-full h-48 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all
        ${isDragging 
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
          : 'border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 bg-white dark:bg-slate-900'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed hover:bg-white dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700' : ''}
      `}
    >
      <input 
        type="file" 
        ref={inputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept="audio/*,video/*"
        disabled={disabled}
      />
      <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full mb-3 text-slate-500 dark:text-slate-400">
        <Upload size={24} />
      </div>
      <p className="text-slate-900 dark:text-slate-100 font-medium">點擊或拖放檔案以上載</p>
      <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">支援 MP3, WAV, M4A, MP4, MOV, WEBM</p>
    </div>
  );
};

export default FileUpload;