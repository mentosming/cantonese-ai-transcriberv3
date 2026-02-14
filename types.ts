
export interface Speaker {
  id: string;
  name: string;
}

export interface TranscriptionSettings {
  model: 'gemini-3-pro-preview' | 'gemini-3-flash-preview';
  language: string[]; // Changed to array for multi-select
  enableDiarization: boolean;
  speakers: Speaker[];
  enableTimestamps: boolean;
  startTime: string; // Format "MM:SS" or "HH:MM:SS"
  customPrompt?: string; 
}

export type ProcessingStatus = 
  | 'idle' 
  | 'uploading' 
  | 'transcribing' 
  | 'completed' 
  | 'error' 
  | 'stopped';

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
