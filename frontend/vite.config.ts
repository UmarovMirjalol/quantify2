import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/plotly.js') || id.includes('node_modules/react-plotly.js')) {
            return 'plotly'
          }
          if (id.includes('node_modules/three')) {
            return 'three'
          }
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  server: {
    // Bind all interfaces so Cursor port-forward / Simple Browser can reach it.
    host: '0.0.0.0',
    port: 43127,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
      },
    },
  },
})
