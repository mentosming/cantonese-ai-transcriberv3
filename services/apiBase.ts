// Single source of truth for the API server origin.
// Priority:
//   1. explicit VITE_API_BASE (set at build time) — wins everywhere
//   2. localhost during local dev → local server on :3001
//   3. anything else (e.g. the Vercel production site) → the deployed server
// This means the Vercel build needs NO env var: it auto-targets the live server,
// while `npm run dev` on localhost still hits your local :3001.
const PROD_API = "https://canto-ai.zeabur.app";

const isLocalHost = (): boolean => {
  if (typeof location === "undefined") return false;
  return /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?)/.test(location.hostname);
};

export const API_BASE: string =
  (import.meta as any).env?.VITE_API_BASE ||
  (isLocalHost() ? "http://localhost:3001" : PROD_API);
