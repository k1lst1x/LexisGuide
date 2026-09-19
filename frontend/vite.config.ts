import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // A project site is served from /LexisGuide/ on GitHub Pages.
  base: process.env.GITHUB_ACTIONS ? '/LexisGuide/' : '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
