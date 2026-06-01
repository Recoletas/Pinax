import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// We have to control the URL flag the composable reads. The composable
// reads window.location.search at module-load time, so we mock window.location
// before importing the composable in each test.

// Mock helper: replace window.location with an object whose .search is settable.
function mockLocation(search) {
  delete window.location
  window.location = { search }
}

describe('usePerf', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('record is a no-op when ?debug=perf is not in the URL', async () => {
    mockLocation('')
    const { usePerf } = await import('../composables/usePerf')
    const { record, history } = usePerf()
    record({ timings: [{ stage: 'grid', durationMs: 10 }], totalMs: 10, seed: 's' })
    expect(history.value).toEqual([])
  })

  it('record pushes to history when ?debug=perf is in the URL', async () => {
    mockLocation('?debug=perf')
    const { usePerf } = await import('../composables/usePerf')
    const { record, history, latest } = usePerf()
    const meta = { timings: [{ stage: 'grid', durationMs: 10 }], totalMs: 10, seed: 's1' }
    record(meta)
    expect(history.value).toHaveLength(1)
    expect(latest.value).toEqual(meta)
  })

  it('latest returns the most recent entry', async () => {
    mockLocation('?debug=perf')
    const { usePerf } = await import('../composables/usePerf')
    const { record, history, latest } = usePerf()
    record({ timings: [], totalMs: 1, seed: 'first' })
    record({ timings: [], totalMs: 2, seed: 'second' })
    expect(history.value).toHaveLength(2)
    expect(latest.value.seed).toBe('second')
  })

  it('clear empties history', async () => {
    mockLocation('?debug=perf')
    const { usePerf } = await import('../composables/usePerf')
    const { record, clear, history } = usePerf()
    record({ timings: [], totalMs: 1, seed: 's' })
    clear()
    expect(history.value).toEqual([])
  })

  it('record(undefined) does not throw', async () => {
    mockLocation('?debug=perf')
    const { usePerf } = await import('../composables/usePerf')
    const { record, history } = usePerf()
    expect(() => record(undefined)).not.toThrow()
    expect(history.value).toEqual([])
  })
})
