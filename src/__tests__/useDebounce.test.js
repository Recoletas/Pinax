import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { debounce, flushPending } from '../composables/useDebounce'

describe('useDebounce (trailing-only by default, SSR-safe, .flush() per-debounced + global flushPending())', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('trailing-only: 5 calls within ms trigger once after ms, last args win', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 500, { leading: false, trailing: true })

    for (let i = 0; i < 5; i++) debounced(i)
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(4)
  })

  it('flushPending() triggers immediately, no need to wait for ms', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 500, { trailing: true })
    debounced('arg1')

    flushPending()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('arg1')

    // No further call after ms
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('flushPending() with no pending does not throw and is idempotent', () => {
    expect(() => flushPending()).not.toThrow()
    expect(() => flushPending()).not.toThrow()  // idempotent
  })
})
