/**
 * Worker 桥接 — 主线程调用入口
 * 管理 Worker 生命周期，将 generateMap 移至独立线程执行
 */

import type { MapGenConfig, GenerationMeta, VoronoiMapData } from './types'

/** 单次生成请求的最大等待时间 */
const REQUEST_TIMEOUT_MS = 60_000

interface PendingRequest {
  resolve: (result: { data: VoronoiMapData; meta: GenerationMeta }) => void
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
    worker.onmessage = (e: MessageEvent<{ id: number; data?: VoronoiMapData; meta?: GenerationMeta; error?: string }>) => {
      const { id, data, meta, error } = e.data
      const p = pending.get(id)
      if (!p) return
      pending.delete(id)
      clearTimeout(p.timer)
      if (error) p.reject(new Error(error))
      else if (data) p.resolve({ data, meta: meta ?? { timings: [], totalMs: 0, seed: '' } })
    }
    worker.onerror = (e) => {
      rejectAllPending(new Error(e.message || 'Worker error'))
      worker = null
    }
  }
  return worker
}

/**
 * 把 cfg 序列化为可 postMessage 的纯对象
 *
 * Worker postMessage 内部走 structuredClone，Vue 响应式 proxy（嵌套数组等）
 * 不能被 structuredClone 克隆。这里在边界处强制走 JSON 走一遍 proxy
 * 读路径，输出纯对象/纯数组。
 *
 * cfg 体积小（<1KB），速度差异可忽略；用 JSON 是因为它会沿 proxy 的 get trap
 * 拿到序列化值，而 structuredClone/toRaw 只能剥一层。
 */
export function serializeConfigForWorker<T>(config: T): T {
  return JSON.parse(JSON.stringify(config)) as T
}

/**
 * 在 Web Worker 中生成地图 — 主线程完全不阻塞
 * 单次请求超过 REQUEST_TIMEOUT_MS 后会主动 reject，避免挂起
 */
export function generateMapInWorker(
  config: MapGenConfig = {},
  options: { debugPerf?: boolean } = {},
): Promise<{ data: VoronoiMapData; meta: GenerationMeta }> {
  return new Promise((resolve, reject) => {
    const id = ++requestId
    const timer = setTimeout(() => {
      if (pending.delete(id)) {
        reject(new Error(`地图生成超时（${REQUEST_TIMEOUT_MS / 1000}s）`))
      }
    }, REQUEST_TIMEOUT_MS)
    pending.set(id, { resolve, reject, timer })
    try {
      const plainConfig = serializeConfigForWorker(config)
      getWorker().postMessage({ id, config: plainConfig, debugPerf: options.debugPerf === true })
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
