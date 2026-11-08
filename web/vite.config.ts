import { defineConfig } from 'vite'

// o worker usa top-level await (WASM do manifold), que só existe no formato "es"
export default defineConfig({ worker: { format: 'es' } })
