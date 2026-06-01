/**
 * Web Worker 入口 — 在独立线程中运行 generateMap
 * 主线程通过 postMessage 发送 config，Worker 返回完整 VoronoiMapData
 */

import { generateMap } from './generate'
import type { MapGenConfig } from './types'

interface WorkerRequest {
  id: number
  config: MapGenConfig
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, config } = e.data
  try {
    const data = generateMap(config)
    self.postMessage({ id, data })
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
