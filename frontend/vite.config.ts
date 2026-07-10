import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/static/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/shorten': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // Proxy short code redirects (matching 6-12 urlsafe chars)
      '^/[a-zA-Z0-9_-]{6,12}$': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: '../backend/static',
    emptyOutDir: true,
  }
})
