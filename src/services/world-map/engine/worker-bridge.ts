/**
 * Worker 桥接 — 主线程调用入口
 * 管理 Worker 生命周期，将 generateMap 移至独立线程执行
 */

import type { MapGenConfig, VoronoiMapData } from './types'

/** 单次生成请求的最大等待时间 */
const REQUEST_TIMEOUT_MS = 60_000

interface PendingRequest {
  resolve: (data: VoronoiMapData) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let worker: Worker | null = null
let requestId = 0
const pending = new Map<number, PendingRequest>()

function rejectAllPending(err: Error) {
  for (const [, p] of pending) {
    clearTimeout(p.timer)
    p.reject(err)
  }
  pending.clear()
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; data?: VoronoiMapData; error?: string }>) => {
      const { id, data, error } = e.data
      const p = pending.get(id)
      if (!p) return
      pending.delete(id)
      clearTimeout(p.timer)
      if (error) p.reject(new Error(error))
      else if (data) p.resolve(data)
    }
    worker.onerror = (e) => {
      rejectAllPending(new Error(e.message || 'Worker error'))
      worker = null
    }
  }
  return worker
}

/**
 * 在 Web Worker 中生成地图 — 主线程完全不阻塞
 * 单次请求超过 REQUEST_TIMEOUT_MS 后会主动 reject，避免挂起
 */
export function generateMapInWorker(config: MapGenConfig = {}): Promise<VoronoiMapData> {
  return new Promise((resolve, reject) => {
    const id = ++requestId
    const timer = setTimeout(() => {
      if (pending.delete(id)) {
        reject(new Error(`地图生成超时（${REQUEST_TIMEOUT_MS / 1000}s）`))
      }
    }, REQUEST_TIMEOUT_MS)
    pending.set(id, { resolve, reject, timer })
    try {
      getWorker().postMessage({ id, config })
    } catch (err) {
      pending.delete(id)
      clearTimeout(timer)
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

/**
 * 主动终止 Worker 并拒绝所有未完成的请求。
 * 适用于组件卸载 / 应用切后台 / 用户主动取消等场景。
 */
export function terminateWorker() {
  if (worker) {
    worker.terminate()
    worker = null
  }
  rejectAllPending(new Error('Worker terminated'))
}
