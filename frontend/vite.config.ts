import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { copyFileSync } from 'fs'

export default defineConfig({
  // A project site is served from /LexisGuide/ on GitHub Pages.
  base: process.env.GITHUB_ACTIONS ? '/LexisGuide/' : '/',
  plugins: [
    react(),
    tailwindcss(),
    {
      // GitHub Pages answers unknown paths (such as /auth/callback after Google or Apple
      // sign-in) with 404.html, so ship the app there too.
      name: 'spa-404-fallback',
      apply: 'build',
      closeBundle() {
        copyFileSync(path.resolve(import.meta.dirname, 'dist/index.html'), path.resolve(import.meta.dirname, 'dist/404.html'))
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
