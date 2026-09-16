import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { readFileSync } from 'node:fs'
import { resolveBuildInfo } from './scripts/lib/resolve-build-info.mjs'

// 仅 dev server 代理读取，不进入前端构建；多工作树各自指向本树后端，默认保持 3001。
function resolveDevBackendOrigin(raw) {
  const origin = String(raw || '').trim().replace(/\/+$/, '')
  if (!origin) return 'http://127.0.0.1:3001'
  if (/^wss?:\/\//.test(origin)) return origin
  if (/^https?:\/\//.test(origin)) return origin
  return `http://${origin}`
}

const devBackendOrigin = resolveDevBackendOrigin(process.env.PINAX_DEV_BACKEND_ORIGIN)
const devBackendWsOrigin = devBackendOrigin.replace(/^http/, 'ws')

// 白名单构建身份：版本/短commit/channel/dirty；无 .git 时 commit 为 unknown。
const pkgInfo = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'))
const buildInfo = resolveBuildInfo({ version: pkgInfo.version, root: __dirname })

export default defineConfig({
  plugins: [vue()],
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo)
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: devBackendOrigin,
        changeOrigin: true
      },
      '/ws': {
        target: devBackendWsOrigin,
        ws: true,
        changeOrigin: true
      },
      // dev 下文档 markdown 由 Express 静态目录提供, 与生产 nginx 对齐
      '/docs/user-manual': {
        target: devBackendOrigin,
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
            './src/services/media/shotExporter.js'
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
