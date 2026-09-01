import react from '@vitejs/plugin-react'
/// <reference types="vitest" />
import { defineConfig } from 'vite'

// Dev serves from the root; only the Pages build needs the /<repo>/ prefix,
// and DEPLOY_BASE overrides it for any other host.
export default defineConfig(({ command }) => ({
  base: process.env.DEPLOY_BASE ?? (command === 'build' ? '/redline/' : '/'),
  // README and `npm run evals` both point at 5180 — the dev server should land
  // where the docs say it does. Pass --port to override for a second instance.
  server: { port: 5180 },
  plugins: [react()],
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },
}))
