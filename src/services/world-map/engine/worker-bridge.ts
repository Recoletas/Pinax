/**
 * Worker 桥接 — 主线程调用入口
 * 通过 comlink.wrap 把 Worker 暴露为可远程调用的 proxy，60s 超时由 Promise.race 包装。
 * 公共 API（generateMapInWorker / terminateWorker / serializeConfigForWorker）保持不变。
 */

import { wrap, type Remote } from 'comlink'
import type { MapGenConfig, GenerationMeta, VoronoiMapData } from './types'

/** 单次生成请求的最大等待时间 */
const REQUEST_TIMEOUT_MS = 60_000
type WorkerErrorCode = 'TIMEOUT' | 'ENGINE'

interface WorkerApi {
  generateMap(
    config: MapGenConfig,
    options: { debugPerf?: boolean },
  ): Promise<{ data: VoronoiMapData; meta: GenerationMeta }>
}

let worker: Worker | null = null
let api: Remote<WorkerApi> | null = null

class WorkerBridgeError extends Error {
  code: WorkerErrorCode
  override cause?: unknown

  constructor(code: WorkerErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'WorkerBridgeError'
    this.code = code
    if (cause !== undefined) this.cause = cause
  }
}

function getApi(): Remote<WorkerApi> {
  if (!worker || !api) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    api = wrap(worker)
  }
  return api
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

function isWorkerBridgeError(error: unknown): error is WorkerBridgeError {
  return error instanceof WorkerBridgeError
}

function toEngineError(error: unknown): WorkerBridgeError {
  if (isWorkerBridgeError(error)) return error
  const message = error instanceof Error ? error.message : String(error ?? '未知错误')
  return new WorkerBridgeError('ENGINE', `地图生成失败：${message}`, error)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new WorkerBridgeError('TIMEOUT', `地图生成超时（${ms / 1000}s）`))
    }, ms)

    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(toEngineError(error))
      },
    )
  })
}

/**
 * 在 Web Worker 中生成地图 — 主线程完全不阻塞
 * 单次请求超过 REQUEST_TIMEOUT_MS 后会主动 reject，避免挂起
 */
export function generateMapInWorker(
  config: MapGenConfig = {},
  options: { debugPerf?: boolean } = {},
): Promise<{ data: VoronoiMapData; meta: GenerationMeta }> {
  const plainConfig = serializeConfigForWorker(config)
  const call = getApi().generateMap(plainConfig, options)
  return withTimeout(call, REQUEST_TIMEOUT_MS)
}

/**
 * 主动终止 Worker 并拒绝所有未完成的请求。
 * 适用于组件卸载 / 应用切后台 / 用户主动取消等场景。
 */
export function terminateWorker() {
  if (worker) {
    worker.terminate()
    worker = null
    api = null
  }
}
