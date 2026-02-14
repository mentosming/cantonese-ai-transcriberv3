import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');

  // Logic to prioritize: API_KEY (Vercel System) > VITE_API_KEY > GOOGLE_API_KEY
  const apiKey = env.API_KEY || env.VITE_API_KEY || env.GOOGLE_API_KEY || '';

  console.log(`[Build] API Key Detected: ${apiKey ? 'Yes (Hidden)' : 'No'}`);

  return {
    plugins: [react()],
    define: {
      // 1. Shim process.env for libraries that expect it (like the Gemini SDK if it checks process.env)
      // 2. Inject the specifically resolved API_KEY
      'process.env': {
        API_KEY: apiKey,
        NODE_ENV: JSON.stringify(mode),
      },
      // Also define it directly for safety if accessed via process.env.API_KEY
      'process.env.API_KEY': JSON.stringify(apiKey),
    },
    server: {
      headers: {
        // Strict COOP/COEP headers removed to allow Firebase Auth Popup to function correctly.
        // Re-enable only if you implement ffmpeg.wasm with SharedArrayBuffer in the future.
      },
    },
    build: {
      target: 'esnext',
    }
  };
});