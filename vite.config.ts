import react from '@vitejs/plugin-react'
/// <reference types="vitest" />
import { defineConfig } from 'vite'

// Dev serves from the root; only the Pages build needs the /<repo>/ prefix,
// and DEPLOY_BASE overrides it for any other host.
export default defineConfig(({ command }) => ({
  base: process.env.DEPLOY_BASE ?? (command === 'build' ? '/redline/' : '/'),
  plugins: [react()],
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },
}))
