import { describe, it, expect } from 'vitest'
import { PerfCollector } from '../services/world-map/engine/perf'

describe('PerfCollector', () => {
  it('records positive duration for a started-then-ended stage', () => {
    const c = new PerfCollector()
    c.start('grid')
    c.end('grid')
    const meta = c.finish('seed-1')
    const stage = meta.timings.find(t => t.stage === 'grid')
    expect(stage).toBeDefined()
    expect(stage.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('end without matching start is a no-op', () => {
    const c = new PerfCollector()
    c.end('never-started')
    const meta = c.finish('seed-1')
    expect(meta.timings).toEqual([])
  })

  it('tracks multiple stages independently', () => {
    const c = new PerfCollector()
    c.start('a')
    c.start('b')
    c.end('a')
    c.end('b')
    const meta = c.finish('seed-1')
    const stages = meta.timings.map(t => t.stage)
    expect(stages).toEqual(['a', 'b'])
  })

  it('finish returns totalMs that is non-negative', () => {
    const c = new PerfCollector()
    c.start('a'); c.end('a')
    const meta = c.finish('seed-x')
    expect(meta.totalMs).toBeGreaterThanOrEqual(0)
    expect(meta.seed).toBe('seed-x')
  })

  it('re-timing the same stage replaces the previous entry', () => {
    const c = new PerfCollector()
    c.start('grid'); c.end('grid')
    c.start('grid'); c.end('grid')
    const meta = c.finish('seed-1')
    const matches = meta.timings.filter(t => t.stage === 'grid')
    expect(matches).toHaveLength(1)
  })
})
