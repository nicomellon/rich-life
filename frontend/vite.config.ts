import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { ProxyOptions } from 'vite'
import { defineConfig } from 'vitest/config'

// The app calls the API on its own origin (/api/v1/...), so the bundle carries no configuration.
// Here the dev and preview servers pass /api through to the backend; in production the web server
// that serves the build does the same.
const apiProxy: Record<string, ProxyOptions> = {
  '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:8000' },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  // Twelve-factor: never load .env files. Settings come from the real environment only, and
  // whatever starts Vite provides them (`make frontend` injects the root .env).
  envDir: false,
  server: { port: 5173, strictPort: true, proxy: apiProxy },
  preview: { proxy: apiProxy },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
