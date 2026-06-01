/**
 * Web Worker 入口 — 在独立线程中运行 generateMap
 * 主线程通过 postMessage 发送 { id, config, debugPerf }，
 * Worker 返回 { id, data, meta }；debugPerf 为真时 meta 携带各阶段耗时，
 * 否则 meta 为占位空对象（timings: []，totalMs: 0）。
 */

import { generateMap } from './generate'
import { PerfCollector } from './perf'
import type { MapGenConfig, GenerationMeta, VoronoiMapData } from './types'

interface WorkerRequest {
  id: number
  config: MapGenConfig
  debugPerf?: boolean
}

interface WorkerResponse {
  id: number
  data?: VoronoiMapData
  meta?: GenerationMeta
  error?: string
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, config, debugPerf } = e.data
  const collector = debugPerf ? new PerfCollector() : null
  try {
    const data = generateMap(config, collector ?? undefined)
    const meta = collector
      ? collector.finish(config.seed ?? 'unknown')
      : { timings: [], totalMs: 0, seed: config.seed ?? 'unknown' }
    const response: WorkerResponse = { id, data, meta }
    self.postMessage(response)
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
