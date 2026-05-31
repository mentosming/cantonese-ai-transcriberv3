export const MAX_FILE_SIZE_INLINE = 20 * 1024 * 1024; // Reverted to 20MB (Standard Google API limit)

export const DOWNLOAD_API_URL = process.env.DOWNLOAD_API_URL || '';

export const LANGUAGES = [
  { 
    id: 'yue', 
    name: '廣東話 (Cantonese)', 
    instruction: `
1. **Language:** Output strictly in **Cantonese (Hong Kong)**.
2. **Orthography:** Use proper Cantonese characters (正字), such as:
   - 嘅 (ge3)
   - 喺 (hai2)
   - 咁 (gam3/gam2)
   - 唔 (m4)
   - 係 (hai6)
3. **No SWC:** Do NOT convert the text into Standard Written Chinese (SWC). Write exactly what is said.
4. **Code-Mixing:** Accurately transcribe English words or phrases mixed into sentences (e.g., "今日個 project 好 rush").` 
  },
  { 
    id: 'zh-TW', 
    name: '國語 (繁體中文)', 
    instruction: `
1. **Language:** Output strictly in **Traditional Chinese (Taiwan/Hong Kong)**.
2. **Accuracy:** Transcribe exactly what is said. Do not summarize.` 
  },
  { 
    id: 'zh-CN', 
    name: '普通話 (简体中文)', 
    instruction: `
1. **Language:** Output strictly in **Simplified Chinese**.
2. **Accuracy:** Transcribe exactly what is said. Do not summarize.` 
  },
  { 
    id: 'en', 
    name: 'English', 
    instruction: `
1. **Language:** Output strictly in **English**.
2. **Accuracy:** Transcribe exactly what is said.` 
  },
  { 
    id: 'ja', 
    name: '日本語 (Japanese)', 
    instruction: `
1. **Language:** Output strictly in **Japanese**.
2. **Accuracy:** Transcribe exactly what is said.` 
  },
  { 
    id: 'ko', 
    name: '韓語 (Korean)', 
    instruction: `
1. **Language:** Output strictly in **Korean**.
2. **Accuracy:** Transcribe exactly what is said.` 
  },
  { 
    id: 'id', 
    name: '印尼語 (Indonesian)', 
    instruction: `
1. **Language:** Output strictly in **Indonesian (Bahasa Indonesia)**.
2. **Accuracy:** Transcribe exactly what is said.` 
  },
  { 
    id: 'fil', 
    name: '菲律賓語 (Filipino)', 
    instruction: `
1. **Language:** Output strictly in **Filipino (Tagalog)**.
2. **Taglish:** Accurately transcribe Taglish (Tagalog-English code-switching) exactly as spoken.` 
  }
];

// NOTE: `id` is the real backend model (server-side only, never shown).
// `name`/`description` are user-facing and intentionally vendor-neutral.
export const MODELS = [
  {
    id: 'gemini-3.5-flash',
    name: '高速引擎',
    description: '快速、時間戳零偏移 (推薦)'
  },
  {
    id: 'gemini-pro-latest',
    name: '高準確引擎',
    description: '最高準確度，較慢（自動使用最新 Pro）'
  },
  {
    id: 'gemini-3-flash-preview',
    name: '標準引擎 (舊)',
    description: '舊版，時間戳約 +1 秒'
  }
];

export const DEFAULT_MODEL = 'gemini-3.5-flash';

// --- Billing / Pricing ---
// One-time starter credit granted to a newly signed-in (Google) account.
// Shared across transcription + subtitle studio.
export const FREE_STARTER_MINUTES = 5;
// Legacy display constant (kept for copy that references a free cap).
export const FREE_TIER_MAX_MINUTES = 5;

// Pay-as-you-go credit packs. `minutes` are added to the user's creditMinutes
// balance. `priceHKD` is display-only; the real amount lives in Stripe/RevenueCat.
export const CREDIT_PACKS = [
  { id: 'pack_60', minutes: 60, priceHKD: 30, label: '60 分鐘', stripePriceEnv: 'STRIPE_PRICE_PACK_60', iosProductId: 'cai.credits.60' },
  { id: 'pack_180', minutes: 180, priceHKD: 78, label: '180 分鐘', popular: true, stripePriceEnv: 'STRIPE_PRICE_PACK_180', iosProductId: 'cai.credits.180' },
  { id: 'pack_600', minutes: 600, priceHKD: 228, label: '600 分鐘', stripePriceEnv: 'STRIPE_PRICE_PACK_600', iosProductId: 'cai.credits.600' },
];

// Monthly subscription. `monthlyMinutes` is the per-period allowance refilled
// each renewal; treat large values as effectively unlimited for the tier.
// RevenueCat iOS public SDK key. Currently the Test Store key (for dev/TestFlight
// testing without App Store Connect). Swap to the production `appl_…` key once a
// real App Store app is created in RevenueCat. Public keys are safe to ship.
export const REVENUECAT_IOS_SDK_KEY = 'test_lDXPyEWyNZJDhBYbLxydrofeAgN';

export const MONTHLY_PLAN = {
  id: 'monthly',
  priceHKD: 88,
  monthlyMinutes: 1200,
  label: '月費無憂',
  stripePriceEnv: 'STRIPE_PRICE_MONTHLY',
  iosProductId: 'cai.sub.monthly',
};

// AI 合併分析計費：每 job 最少 2 分鐘，之後按合併內容字數計（每 8000 字 = 1 分鐘）。
export const ANALYSIS_COST = { minPerJob: 2, charsPerMinute: 8000 };
export const analysisCostMinutes = (totalChars: number): number =>
  Math.max(ANALYSIS_COST.minPerJob, Math.ceil(totalChars / ANALYSIS_COST.charsPerMinute));

export const ERROR_MESSAGES = {
  NETWORK: "網絡連接中斷，請檢查您的互聯網連接。",
  QUOTA: "API 配額已滿 (429)。請稍後再試或檢查您的帳單設定。",
  AUTH: "無效的 API Key (403)。請檢查您的權限。",
  SAFETY: "內容因觸發安全過濾而被攔截。",
  TIMEOUT: "檔案處理逾時。請嘗試使用下方的分割工具切割檔案。",
  GENERAL: "發生未知的錯誤。"
};