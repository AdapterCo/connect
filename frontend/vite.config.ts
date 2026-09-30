import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Backend usado pelo proxy de desenvolvimento; deve bater com a PORT do .env.
const backend = process.env.BACKEND_URL || 'http://localhost:3000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: backend,
        changeOrigin: true
      },
      '/uploads': {
        target: backend,
        changeOrigin: true
      },
      '/socket.io': {
        target: backend,
        changeOrigin: true,
        ws: true
      }
    }
  }
})
