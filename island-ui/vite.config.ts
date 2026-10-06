import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // @mediapipe/hands has no ESM exports (UMD only) — see src/vendor/mediapipe-hands-shim.ts
    alias: [{ find: '@mediapipe/hands', replacement: fileURLToPath(new URL('./src/vendor/mediapipe-hands-shim.ts', import.meta.url)) }],
  },
})
