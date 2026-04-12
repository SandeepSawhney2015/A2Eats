import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      recharts: path.resolve(__dirname, 'node_modules/recharts/es6/index.js'),
    },
  },
})
