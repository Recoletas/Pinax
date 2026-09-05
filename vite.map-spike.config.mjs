/**
 * P1 spike 专用 vite 配置——独立入口，不影响主应用首包与路由。
 * 运行：node_modules/.bin/vite --config vite.map-spike.config.mjs --port 5199
 */

import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: 'prototype/map-spike',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    fs: {
      allow: ['../..'],
    },
  },
  build: {
    outDir: '/tmp/map-spike-dist',
    emptyOutDir: true,
  },
})
