export interface Speaker {
  id: string;
  name: string;
}

export interface TranscriptionSettings {
  language: string[]; // Changed from string to string[] for multi-language support
  enableDiarization: boolean;
  speakers: Speaker[];
  enableTimestamps: boolean;
  startTime: string; // Format "MM:SS" or "HH:MM:SS"
  customPrompt?: string; // Additional user instructions
}

export type ProcessingStatus =
  | 'idle'
  | 'uploading'
  | 'transcribing'
  | 'completed'
  | 'error'
  | 'stopped';

export type DownloadStatus = 'idle' | 'connecting' | 'downloading' | 'complete' | 'error';

export interface TranscriptionError {
  code?: string | number;
  message: string;
  type: 'network' | 'quota' | 'auth' | 'safety' | 'timeout' | 'general' | 'limit';
}

export interface TranscriptionSegment {
  text: string;
  timestamp?: string;
  speaker?: string;
}

// Auth Types
export interface UserLicense {
  isPro: boolean;
  licenseKey?: string;
  activatedAt?: number;
}