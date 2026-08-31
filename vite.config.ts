import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves from /<repo>/; overridden to '/' for other hosts
  base: process.env.DEPLOY_BASE ?? '/redline/',
  plugins: [react()],
})
