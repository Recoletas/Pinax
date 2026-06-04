/**
 * Web Worker 入口 — 在独立线程中运行 generateMap
 * 通过 comlink.expose 暴露 generateMap 为主线程可远程调用的方法。
 */

import { expose } from 'comlink'
import { generateMap } from './generate'
import { PerfCollector } from './perf'
import type { MapGenConfig, GenerationMeta, VoronoiMapData } from './types'

const api = {
  generateMap(
    config: MapGenConfig,
    options: { debugPerf?: boolean } = {},
  ): { data: VoronoiMapData; meta: GenerationMeta } {
    const collector = options.debugPerf ? new PerfCollector() : null
    const data = generateMap(config, collector ?? undefined)
    const meta = collector
      ? collector.finish(config.seed ?? 'unknown')
      : { timings: [], totalMs: 0, seed: config.seed ?? 'unknown' }
    return { data, meta }
  },
}

expose(api)
