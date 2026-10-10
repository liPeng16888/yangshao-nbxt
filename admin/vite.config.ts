import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { labTotalMonitorDevPlugin } from '../shared/labTotalMonitorDevPlugin'

export default defineConfig({
  base: '/admin/',
  plugins: [vue(), labTotalMonitorDevPlugin('admin')],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/uploads': 'http://127.0.0.1:3000'
    }
  }
})
