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

export const ERROR_MESSAGES = {
  NETWORK: "網絡連接中斷，請檢查您的互聯網連接。",
  QUOTA: "API 配額已滿 (429)。請稍後再試或檢查您的帳單設定。",
  AUTH: "無效的 API Key (403)。請檢查您的權限。",
  SAFETY: "內容因觸發安全過濾而被攔截。",
  TIMEOUT: "檔案處理逾時。請嘗試使用下方的分割工具切割檔案。",
  GENERAL: "發生未知的錯誤。"
};