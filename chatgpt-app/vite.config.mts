import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  root: path.resolve(__dirname, 'src/widget'),
  plugins: [react()],
  base: '/widget/',
  build: {
    outDir: path.resolve(__dirname, 'assets/widget'),
    emptyOutDir: true,
  },
})
