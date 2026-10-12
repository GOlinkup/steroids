import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // @mediapipe/hands has no ESM exports (UMD only) — see src/vendor/mediapipe-hands-shim.ts
    alias: [{ find: '@mediapipe/hands', replacement: fileURLToPath(new URL('./src/vendor/mediapipe-hands-shim.ts', import.meta.url)) },
    // one-app absorb: ported Maus modules import via @/ (their convention)
    { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) }],
  },
})
