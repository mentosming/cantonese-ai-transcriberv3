
export const MAX_FILE_SIZE_INLINE = 20 * 1024 * 1024; // Reverted to 20MB (Standard Google API limit)

export const LANGUAGES = [
  { 
    id: 'yue', 
    name: '廣東話 (Cantonese)', 
    instruction: `
- **Primary Language:** Cantonese (Hong Kong).
- **Orthography:** Use proper Cantonese characters (正字), e.g., 嘅, 喺, 咁, 唔, 係.
- **No SWC:** Do NOT convert to Standard Written Chinese. Write exactly what is heard.` 
  },
  { 
    id: 'en', 
    name: 'English', 
    instruction: `
- **Language:** English.
- **Accuracy:** Transcribe exactly what is said.` 
  },
  { 
    id: 'zh-TW', 
    name: '國語 (繁體中文)', 
    instruction: `
- **Language:** Traditional Chinese (Taiwan/Hong Kong).
- **Accuracy:** Transcribe exactly what is said.` 
  },
  { 
    id: 'zh-CN', 
    name: '普通話 (简体中文)', 
    instruction: `
- **Language:** Simplified Chinese.
- **Accuracy:** Transcribe exactly what is said.` 
  },
  { 
    id: 'id', 
    name: '印尼語 (Bahasa Indonesia)', 
    instruction: `
- **Language:** Indonesian.
- **Accuracy:** Transcribe exactly what is said.` 
  },
  { 
    id: 'fil', 
    name: '菲律賓語 (Filipino/Tagalog)', 
    instruction: `
- **Language:** Filipino (Tagalog).
- **Accuracy:** Transcribe exactly what is said.` 
  },
  { 
    id: 'ja', 
    name: '日本語 (Japanese)', 
    instruction: `
- **Language:** Japanese.` 
  },
  { 
    id: 'ko', 
    name: '韓語 (Korean)', 
    instruction: `
- **Language:** Korean.` 
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
