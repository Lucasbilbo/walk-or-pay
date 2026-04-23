import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/app/',
  build: {
    outDir: 'dist/app',
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
