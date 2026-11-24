import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// o worker usa top-level await (WASM do manifold), que só existe no formato "es". Duas páginas: peças (index.html) e editor de mapa (mapa.html).
export default defineConfig({
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('index.html', import.meta.url)),
        mapa: fileURLToPath(new URL('mapa.html', import.meta.url)),
      },
    },
  },
})
