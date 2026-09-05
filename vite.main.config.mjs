import { defineConfig } from 'vite'

export default defineConfig(({ forgeConfigSelf } = {}) => ({
  build: {
    lib: {
      entry: forgeConfigSelf?.entry || 'electron/main.mjs',
      fileName: () => 'main.js',
      formats: ['es']
    },
    rollupOptions: {
      external: ['electron', 'better-sqlite3']
    }
  }
}))
