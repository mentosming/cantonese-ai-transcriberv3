import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    // NOTE: No COOP/COEP headers — they break Firebase Auth popups, and we no
    // longer use ffmpeg.wasm/SharedArrayBuffer (rendering uses WebCodecs).
    optimizeDeps: {
      // Native-only / uninstalled plugins must not be pre-bundled by the dev
      // optimizer (they have no web build and would crash optimization).
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@revenuecat/purchases-capacitor', 'capacitor-voice-recorder'],
    },
    // NOTE: API_KEY is intentionally NOT exposed to the client. All Gemini
    // calls go through the server (VITE_API_BASE). Only the public download
    // URL is safe to inline.
    define: {
      'process.env.DOWNLOAD_API_URL': JSON.stringify(env.DOWNLOAD_API_URL),
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        // Native-only Capacitor plugin; provided at runtime on iOS, never in the
        // web bundle (its code paths are guarded by isNativeIOS()).
        external: ['@revenuecat/purchases-capacitor'],
      },
    },
  };
});