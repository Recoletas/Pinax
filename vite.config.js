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
      },
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
        changeOrigin: true
      },
      // dev 下文档 markdown 由 Express 静态目录提供, 与生产 nginx 对齐
      '/docs/user-manual': {
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
            './src/services/shotExporter.js'
          ]
        }
      }
    },
    // 提高 chunk 大小警告阈值
    chunkSizeWarningLimit: 600
  },
  worker: {
    // 来源 adapter 含有 PDF/DOCX 的动态依赖，Worker 需要 ES module
    // 输出才能保留拆分 chunk；IIFE 会在 Rollup 代码分割时直接失败。
    format: 'es'
  }
})
