import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // These integration tests stub browser-global fetch and storage. Running
    // files concurrently makes those shared browser seams race and turns valid
    // messaging tests into intermittent timeouts on constrained CI runners.
    fileParallelism: false,
  },
})
