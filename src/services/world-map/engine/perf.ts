/**
 * 性能分析收集器
 * 在生成管线的每个阶段调用 start/end，最后调用 finish() 拿到 GenerationMeta。
 */

import type { GenerationMeta } from './types'

interface StageRecord {
  stage: string
  startTime: number
  endTime: number
}

export class PerfCollector {
  private starts = new Map<string, number>()
  private records: StageRecord[] = []
  private readonly t0: number

  constructor() {
    this.t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  }

  start(stage: string): void {
    this.starts.set(stage, this.now())
  }

  end(stage: string): void {
    const t = this.starts.get(stage)
    if (t === undefined) return
    this.starts.delete(stage)
    this.records.push({ stage, startTime: t, endTime: this.now() })
  }

  finish(seed: string): GenerationMeta {
    // 关闭任何还在进行的阶段（防御性：理论上不应发生）
    for (const [stage, t] of this.starts) {
      this.records.push({ stage, startTime: t, endTime: this.now() })
    }
    this.starts.clear()
    const timings = this.records.map(r => ({
      stage: r.stage,
      durationMs: Math.max(0, r.endTime - r.startTime),
    }))
    // 同名阶段只保留最后一条
    const deduped: typeof timings = []
    for (const t of timings) {
      const idx = deduped.findIndex(x => x.stage === t.stage)
      if (idx >= 0) deduped[idx] = t
      else deduped.push(t)
    }
    return {
      timings: deduped,
      totalMs: Math.max(0, this.now() - this.t0),
      seed,
    }
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now()
  }
}
