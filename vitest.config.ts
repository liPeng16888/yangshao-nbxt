import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue() as never],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    server: { deps: { inline: ['vue-element-plus-x'] } },
    environment: 'jsdom',
    globals: true,
    exclude: [
      ...configDefaults.exclude,
      '**/.worktrees/**',
      '**/.pnpm-store/**',
      '**/.superpowers/**'
    ]
  }
})
