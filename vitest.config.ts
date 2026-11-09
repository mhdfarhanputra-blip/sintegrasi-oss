import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Konfigurasi Vitest untuk pengujian unit helper murni (Node environment).
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
    },
  },
})
