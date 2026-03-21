import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    // Handle specific security headers required for SharedArrayBuffer (ffmpeg.wasm)
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
    },
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
    // Polyfill process.env for the client-side code
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env.DOWNLOAD_API_URL': JSON.stringify(env.DOWNLOAD_API_URL),
    },
    build: {
      outDir: 'dist',
    },
  };
});