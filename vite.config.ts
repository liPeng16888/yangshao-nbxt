import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { labTotalMonitorDevPlugin } from './shared/labTotalMonitorDevPlugin'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaOptions } from './src/pwa/options'

export default defineConfig({
  plugins: [vue(), VitePWA(pwaOptions), labTotalMonitorDevPlugin('frontend')],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      }
    }
  }
})
