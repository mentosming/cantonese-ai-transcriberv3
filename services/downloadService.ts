/**
 * 後端下載 API 客戶端
 * 與 cantonese-transcriber-api 後端通訊
 */

import { DOWNLOAD_API_URL } from '../constants';

export interface MediaInfo {
  title: string;
  duration: number;
  thumbnail: string;
}

/**
 * 取得影片資訊（標題、時長、縮圖）
 */
export async function fetchMediaInfo(url: string): Promise<MediaInfo> {
  const response = await fetch(`${DOWNLOAD_API_URL}/api/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || getErrorMessage(response.status));
  }

  return response.json();
}

/**
 * 下載音訊，支援進度回報與取消
 * 回傳 File 物件，可直接傳入 handleFileSelect()
 */
export async function downloadAudio(
  url: string,
  onProgress: (bytesReceived: number) => void,
  signal: AbortSignal
): Promise<File> {
  const response = await fetch(`${DOWNLOAD_API_URL}/api/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || getErrorMessage(response.status));
  }

  // 從回應標頭取得影片資訊
  const encodedTitle = response.headers.get('X-Media-Title') || 'download';
  const title = decodeURIComponent(encodedTitle);

  // 串流讀取回應
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('瀏覽器不支援串流下載');
  }

  const chunks: Uint8Array[] = [];
  let bytesReceived = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    bytesReceived += value.length;
    onProgress(bytesReceived);
  }

  // 組合成 File 物件
  const blob = new Blob(chunks, { type: 'audio/mpeg' });
  const fileName = `${title}.mp3`;
  return new File([blob], fileName, { type: 'audio/mpeg' });
}

/**
 * 根據 HTTP 狀態碼回傳中文錯誤訊息
 */
function getErrorMessage(status: number): string {
  switch (status) {
    case 400: return '無法識別此連結，請確認網址正確';
    case 404: return '找不到影片，可能為私人或已刪除';
    case 429: return '請求過於頻繁，請稍後再試';
    case 504: return '下載逾時，請嘗試較短的影片';
    default: return '下載伺服器發生錯誤';
  }
}
