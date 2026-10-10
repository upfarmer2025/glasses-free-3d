import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

// GitHub Pages serves this file for unknown paths. The app has no client router;
// the copy keeps a direct visit to a missing URL on the static host usable.
function spaFallback(): Plugin {
  return {
    name: 'spa-fallback',
    apply: 'build',
    writeBundle() {
      const dist = resolve(root, 'dist')
      copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'))
    },
  }
}

// Transformers.js loads WASM and ONNX files with its own dynamic imports.
// Prebundling that package in Vite breaks the runtime paths.
export default defineConfig({
  // Leave local `npm run dev` / `npm run build` at `/`.
  // Set VITE_BASE_PATH=./ when publishing under a subpath such as GitHub Pages.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss(), spaFallback()],
  resolve: {
    alias: {
      '@': `${root}/src`,
    },
  },
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  worker: {
    format: 'es',
  },
  server: {
    host: '127.0.0.1',
    port: 43127,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 43127,
    strictPort: true,
  },
})
