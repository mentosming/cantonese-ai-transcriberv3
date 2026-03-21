import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { TranscriptionSettings, TranscriptionError } from "../types";
import { MAX_FILE_SIZE_INLINE, LANGUAGES, ERROR_MESSAGES } from "../constants";

// Helper to encode file to Base64
const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Helper to upload large file to Gemini Files API via REST (Frontend workaround)
const uploadFileToGemini = async (file: File, apiKey: string): Promise<string> => {
  const metadata = { file: { displayName: file.name } };
  
  // 1. Initiate Resumable Upload
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': file.size.toString(),
        'X-Goog-Upload-Header-Content-Type': file.type || 'application/octet-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initRes.ok) {
    const errorText = await initRes.text();
    throw new Error(`Init upload failed: ${initRes.status} - ${errorText}`);
  }

  const uploadUrlHeader = initRes.headers.get('x-goog-upload-url');
  if (!uploadUrlHeader) throw new Error("Failed to initiate upload: Missing upload URL");

  // Fix for 400 Error: Ensure API Key is attached to the upload URL
  const uploadUrl = uploadUrlHeader.includes('key=') 
    ? uploadUrlHeader 
    : `${uploadUrlHeader}&key=${apiKey}`;

  // 2. Upload Bytes
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: file,
  });

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    throw new Error(`Upload bytes failed: ${uploadRes.status} - ${errorText}`);
  }

  const uploadResult = await uploadRes.json();
  const fileUri = uploadResult.file.uri;
  const fileState = uploadResult.file.state;

  // 3. Wait for processing if necessary (Active)
  if (fileState === 'PROCESSING') {
    let attempts = 0;
    while (attempts < 60) { // Wait up to 2 minutes
      await new Promise(r => setTimeout(r, 2000));
      const getRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/files/${uploadResult.file.name.split('/').pop()}?key=${apiKey}`
      );
      
      if (!getRes.ok) {
         console.warn("Check file status failed, retrying...");
         continue;
      }

      const getJson = await getRes.json();
      if (getJson.state === 'ACTIVE') return getJson.uri;
      if (getJson.state === 'FAILED') throw new Error("File processing failed on server");
      attempts++;
    }
    throw new Error("File processing timed out");
  }

  return fileUri;
};

export const transcribeMedia = async (
  file: File,
  settings: TranscriptionSettings,
  onProgress: (text: string) => void,
  signal: AbortSignal
) => {
  if (!process.env.API_KEY) {
    throw { type: 'auth', message: "API Key not found in environment" } as TranscriptionError;
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // 1. Build System Instruction for Multiple Languages
  const selectedLangIds = settings.language;
  const selectedLangs = LANGUAGES.filter(l => selectedLangIds.includes(l.id));
  
  // Fallback to Cantonese if empty (should not happen via UI)
  if (selectedLangs.length === 0) selectedLangs.push(LANGUAGES[0]);

  const langNames = selectedLangs.map(l => l.name).join(', ');
  const langInstructions = selectedLangs.map(l => `### ${l.name} Rules:\n${l.instruction}`).join('\n\n');

  let systemInstruction = `
You are a professional Transcriber. 
Your task is to transcribe the **ENTIRE** audio/video file into text with high accuracy.
The audio may contain one or more of the following languages: **${langNames}**.

**CRITICAL INSTRUCTION: FULL DURATION**
- The audio file may be long (e.g., > 3 minutes). 
- You MUST continue transcribing until the audio completely ends.
- **Do not stop** at long pauses or silence.
- **Do not stop** after the first minute.
- If the audio is silent for a while, write [Silence], then continue listening for speech.

**Language Rules:**
${langInstructions}

**Mixed Language Handling (Code-Switching):**
If the audio switches between the selected languages (e.g., Cantonese mixed with English), transcribe each part in its respective language script accurately.
`;

  // Formatting & Timestamp Logic
  if (settings.enableTimestamps) {
    systemInstruction += `
**Formatting:**
- Output specific format per line: \`[MM:SS - MM:SS] Speaker Name: Content\`
- Example: \`[00:00 - 00:05] Peter: Hello.\`
- Unknown speaker: "Unknown".
- No Markdown bolding for metadata.
- **Every sentence** must have a timestamp.
- **IMPORTANT:** Always start timestamps from **00:00** relative to the beginning of THIS specific file. Do not attempt to calculate offsets from previous files.`;
  } else {
    systemInstruction += `
**Formatting:**
- Output: \`Speaker Name: Content\`
- No timestamps.`;
  }

  if (settings.enableDiarization) {
    systemInstruction += "\n\n**Speaker Diarization:** Identify different speakers.";
    if (settings.speakers.length > 0) {
      const speakerMap = settings.speakers.map(s => `${s.id} is ${s.name}`).join(', ');
      systemInstruction += `\nUse these known speakers if voices match: ${speakerMap}.`;
    } else {
      systemInstruction += `\nLabel as "Speaker 1", "Speaker 2", etc.`;
    }
  }

  // --- NEW: Custom Prompt / Remarks ---
  if (settings.customPrompt && settings.customPrompt.trim()) {
    systemInstruction += `\n\n**ADDITIONAL USER INSTRUCTIONS (High Priority):**\n${settings.customPrompt.trim()}`;
  }

  try {
    let contentPart: any;

    // 2. Handle File Upload (Inline vs Cloud)
    if (file.size > MAX_FILE_SIZE_INLINE) {
      try {
        const fileUri = await uploadFileToGemini(file, process.env.API_KEY);
        contentPart = {
          fileData: {
            mimeType: file.type || 'application/octet-stream',
            fileUri: fileUri
          }
        };
      } catch (e: any) {
        console.error("Upload failed", e);
        throw { 
          type: 'network', 
          message: `File upload error: ${e.message}. The file is too large for inline processing (>20MB) and upload failed.` 
        } as TranscriptionError;
      }
    } else {
      // Small/Medium file flow (Inline Base64)
      const part = await fileToGenerativePart(file);
      contentPart = part;
    }

    // 3. Generate Stream
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3-pro-preview', // HARDCODED
      contents: [
        {
          role: 'user',
          parts: [
            contentPart,
            { text: "Transcribe the audio file word-for-word. Please ensure you process the FULL duration of the file, not just the beginning. Do not summarize." }
          ]
        }
      ],
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.2,
        maxOutputTokens: 65536,
        thinkingConfig: { thinkingBudget: 0 },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ]
      }
    });

    // 4. Consume Stream
    for await (const chunk of responseStream) {
      if (signal.aborted) {
        throw { type: 'general', message: "Transcription stopped by user." };
      }
      const text = chunk.text;
      if (text) {
        onProgress(text);
      }
    }

  } catch (error: any) {
    if (signal.aborted) return;
    if (error.type && error.message) throw error;

    const errObj: TranscriptionError = {
      message: error.message || ERROR_MESSAGES.GENERAL,
      type: 'general'
    };

    if (error.message?.includes('403')) errObj.type = 'auth';
    if (error.message?.includes('429')) errObj.type = 'quota';
    if (error.message?.includes('fetch')) errObj.type = 'network';
    if (error.response?.promptFeedback?.blockReason) errObj.type = 'safety';

    throw errObj;
  }
};

// New Function for Summarization
export const generateSummary = async (text: string): Promise<string> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key not found");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
請根據提供的轉錄文字，生成一份極其詳盡的「問答式摘要」(Q&A Summary)。

**轉錄內容：**
${text.slice(0, 100000)} ... (截取部分內容以符合 Context Window，若內容過長)

**指令與要求：**
1. **角色**：你是一位專業的案件分析師或書記。
2. **格式**：必須使用「問答形式」(Q&A)，例如：
   Q: 當事人為何出現在現場？
   A: 根據錄音，當事人表示...
3. **內容深度**：
   - 必須涵蓋「背景資訊」及「案情/事件詳細經過」。
   - **關鍵要求**：摘要長度與細節量必須保留原文至少 **50%** 的資訊。絕不要只做簡短總結。
   - 保留具體的人名、地名、時間、關鍵對話細節。
4. **語言**：繁體中文 (Traditional Chinese)。
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', // HARDCODED
      contents: [
          { role: 'user', parts: [{ text: text }, { text: prompt }] } // Send full text as first part context
      ],
      config: {
        temperature: 0.3,
      }
    });
    return response.text || "無法生成摘要。";
  } catch (error: any) {
    console.error("Summary generation error:", error);
    throw new Error(error.message || "生成摘要時發生錯誤");
  }
};