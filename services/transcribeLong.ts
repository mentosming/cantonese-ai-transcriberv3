import { extractForSubtitles } from './extractAudio';
import { transcriptToCues, cuesToTranscript, Cue } from './srtUtil';
import { transcribeMedia } from './geminiService';
import { TranscriptionSettings } from '../types';

/**
 * Transcribe a long media file by splitting its audio into ~2-minute chunks,
 * transcribing each, and merging with offset timestamps. Avoids two failure
 * modes of a single long Gemini call: output-token truncation and upstream
 * socket resets. Falls back to a single whole-file call if audio can't be
 * decoded. `onText` receives the FULL merged transcript so far.
 */
export const transcribeLongMedia = async (
  file: File,
  settings: TranscriptionSettings,
  onText: (fullText: string) => void,
  signal: AbortSignal,
  baseOffsetSec = 0,
  onStatus?: (status: string) => void,
): Promise<string> => {
  let chunks: { file: File; startSec: number }[];
  try {
    ({ chunks } = await extractForSubtitles(file, 120));
  } catch {
    // Undecodable audio → single whole-file transcription.
    let text = '';
    await transcribeMedia(file, settings, (c) => { text += c; onText(text); }, signal);
    return text;
  }

  // Timestamps are required to stitch chunks back together in order.
  const chunkSettings: TranscriptionSettings = { ...settings, enableTimestamps: true, startTime: '00:00' };
  const allCues: Cue[] = [];

  for (let ci = 0; ci < chunks.length; ci++) {
    if (signal.aborted) throw { type: 'general', message: 'Transcription stopped by user.' };
    onStatus?.(chunks.length > 1 ? `轉錄中… (${ci + 1}/${chunks.length})` : '轉錄中…');
    const { file: chunkFile, startSec } = chunks[ci];
    const off = baseOffsetSec + startSec;
    const shift = (c: Cue): Cue => ({ ...c, start: c.start + off, end: c.end + off });

    let chunkText = '';
    await transcribeMedia(
      chunkFile,
      chunkSettings,
      (t) => {
        chunkText += t;
        const live = transcriptToCues(chunkText).map(shift);
        onText(cuesToTranscript([...allCues, ...live]));
      },
      signal,
    );
    allCues.push(...transcriptToCues(chunkText).map(shift));
    onText(cuesToTranscript(allCues));
  }

  return cuesToTranscript(allCues);
};
