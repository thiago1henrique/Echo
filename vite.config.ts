import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Pin host+port so the dev URL always matches the Spotify Redirect URI
  // (http://127.0.0.1:5173/). strictPort fails loudly instead of silently
  // switching to 5174 if 5173 is taken. 127.0.0.1 (not localhost) because
  // Spotify treats them as different origins.
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  // ffmpeg.wasm ships its own worker; pre-bundling it breaks the worker URL.
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@ffmpeg/core'],
  },
})
