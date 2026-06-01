/**
 * Worker 桥接 — 主线程调用入口
 * 管理 Worker 生命周期，将 generateMap 移至独立线程执行
 */

import type { MapGenConfig, VoronoiMapData } from './types'

let worker: Worker | null = null
let requestId = 0
const pending = new Map<number, { resolve: (data: VoronoiMapData) => void; reject: (err: Error) => void }>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; data?: VoronoiMapData; error?: string }>) => {
      const { id, data, error } = e.data
      const p = pending.get(id)
      if (!p) return
      pending.delete(id)
      if (error) p.reject(new Error(error))
      else if (data) p.resolve(data)
    }
    worker.onerror = (e) => {
      // 拒绝所有 pending 请求
      for (const [, p] of pending) {
        p.reject(new Error(e.message || 'Worker error'))
      }
      pending.clear()
      // 重置 worker，下次调用会重建
      worker = null
    }
  }
  return worker
}

/**
 * 在 Web Worker 中生成地图 — 主线程完全不阻塞
 */
export function generateMapInWorker(config: MapGenConfig = {}): Promise<VoronoiMapData> {
  return new Promise((resolve, reject) => {
    const id = ++requestId
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, config })
  })
}
