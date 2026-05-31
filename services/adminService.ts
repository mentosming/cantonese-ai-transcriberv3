import { db } from "./firebase";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  where,
  limit as fbLimit,
} from "firebase/firestore";
import { UserProfile } from "../types";

const USAGE_LOGS = "usageLogs";   // metadata + short preview (cheap to list)
const TRANSCRIPTS = "transcripts"; // full content, loaded on demand
const USERS = "users";

// Firestore hard limit is 1 MiB/doc; stay well under for the whole document.
const MAX_TRANSCRIPT_CHARS = 900_000;
const PREVIEW_CHARS = 300;

export interface UsageLog {
  id?: string;
  uid: string;
  email?: string | null;
  fileName?: string;
  durationMinutes: number;
  model?: string;
  languages?: string[];
  charCount: number;
  preview?: string;        // first ~300 chars, stored on the metadata doc
  truncated?: boolean;     // true if full transcript exceeded the cap
  transcript?: string;     // populated only after getTranscript()
  createdAt: number;
}

/**
 * Record a completed transcription job. Splits storage into a small metadata
 * doc (for listing) and a separate full-content doc (loaded on demand) to keep
 * list reads cheap and avoid the 1 MiB document limit. Best-effort.
 */
export const logUsage = async (
  log: Omit<UsageLog, "createdAt" | "id" | "preview" | "truncated"> & { transcript: string }
): Promise<void> => {
  try {
    const full = log.transcript || "";
    const truncated = full.length > MAX_TRANSCRIPT_CHARS;
    const stored = truncated ? full.slice(0, MAX_TRANSCRIPT_CHARS) : full;

    const metaRef = await addDoc(collection(db, USAGE_LOGS), {
      uid: log.uid,
      email: log.email ?? null,
      fileName: log.fileName ?? "",
      durationMinutes: log.durationMinutes,
      model: log.model ?? "",
      languages: log.languages ?? [],
      charCount: log.charCount,
      preview: full.slice(0, PREVIEW_CHARS),
      truncated,
      createdAt: Date.now(),
    });

    // Full content keyed by the same id, in its own collection.
    await setDoc(doc(db, TRANSCRIPTS, metaRef.id), {
      uid: log.uid,
      text: stored,
      truncated,
      createdAt: Date.now(),
    });
  } catch (e) {
    console.warn("logUsage failed:", e);
  }
};

/** Load the full transcript for a given usage-log id (on demand). */
export const getTranscript = async (id: string): Promise<string> => {
  try {
    const snap = await getDoc(doc(db, TRANSCRIPTS, id));
    return snap.exists() ? ((snap.data() as any).text || "") : "";
  } catch (e) {
    console.warn("getTranscript failed:", e);
    return "";
  }
};

/** Admin: list all user profiles (requires admin Firestore rule). */
export const listUsers = async (): Promise<UserProfile[]> => {
  const snap = await getDocs(collection(db, USERS));
  return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) } as UserProfile));
};

export interface Purchase {
  id?: string;
  uid: string;
  email?: string | null;
  source: 'stripe' | 'revenuecat';
  platform?: string;
  type: string;          // credit / subscription / renewal
  productId?: string;
  minutes?: number;
  amount?: number;       // currency minor units (cents)
  currency?: string;
  createdAt: number;
}

/** Admin: list recent purchases (newest first). */
export const listPurchases = async (max = 200): Promise<Purchase[]> => {
  const q = query(collection(db, "purchases"), orderBy("createdAt", "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Purchase));
};

/** Admin: list recent usage logs (newest first). */
export const listUsageLogs = async (max = 200): Promise<UsageLog[]> => {
  const q = query(
    collection(db, USAGE_LOGS),
    orderBy("createdAt", "desc"),
    fbLimit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as UsageLog));
};

/** A user's own transcription history (newest first). */
export const listMyUsage = async (uid: string, max = 100): Promise<UsageLog[]> => {
  if (!uid) return [];
  // Filter by uid then sort client-side to avoid needing a composite index.
  const q = query(collection(db, USAGE_LOGS), where("uid", "==", uid), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) } as UsageLog))
    .sort((a, b) => b.createdAt - a.createdAt);
};

/** Aggregate stats for the dashboard header. */
export const summarizeUsage = (logs: UsageLog[]) => {
  const totalMinutes = logs.reduce((a, l) => a + (l.durationMinutes || 0), 0);
  const uniqueUsers = new Set(logs.map((l) => l.uid)).size;
  return { totalJobs: logs.length, totalMinutes, uniqueUsers };
};
