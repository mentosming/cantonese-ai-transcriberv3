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
  model?: string; // Gemini model id (e.g. gemini-3-flash-preview, gemini-3-pro-preview)
  subtitleMode?: boolean; // produce short per-line cues with precise timestamps
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

// --- Billing / Subscription Types ---
export type PlanId = 'free' | 'payg' | 'monthly';
export type SubscriptionStatus = 'none' | 'active' | 'past_due' | 'canceled' | 'expired';
export type BillingPlatform = 'web' | 'ios' | 'admin';

export interface UserProfile {
  uid: string;
  email?: string | null;
  plan: PlanId;
  // Pay-as-you-go balance, stored as whole minutes of transcription.
  creditMinutes: number;
  subscriptionStatus: SubscriptionStatus;
  // ms epoch; for monthly plan, the current period end.
  subscriptionRenewsAt?: number | null;
  platform?: BillingPlatform;
  stripeCustomerId?: string | null;
  isAdmin?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

// Result of an entitlement check before a transcription job runs.
export interface EntitlementCheck {
  allowed: boolean;
  reason?: 'free_limit' | 'insufficient_credit' | 'subscription_inactive';
  // Minutes the user is still allowed to transcribe in this job.
  remainingMinutes: number;
  message?: string;
}