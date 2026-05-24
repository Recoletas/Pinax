import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vue 核心
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          // Markdown 处理
          'markdown': ['marked', 'turndown'],
          // AI 服务
          'ai-services': [
            './src/services/textExpander.js',
            './src/services/textRewriter.js',
            './src/services/shotExporter.js'
          ]
        }
      }
    },
    // 提高 chunk 大小警告阈值
    chunkSizeWarningLimit: 600
  }
})