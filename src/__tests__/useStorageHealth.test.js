import { describe, expect, it, beforeEach } from 'vitest'
import {
  useStorageHealth,
  computeKeySizes,
  computeUsage,
  safeSetItem
} from '../composables/useStorageHealth'

describe('useStorageHealth', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts with used=0 and level=ok when empty', () => {
    const h = useStorageHealth()
    expect(h.used.value).toBe(0)
    expect(h.percent.value).toBe(0)
    expect(h.level.value).toBe('ok')
    expect(h.isWarning.value).toBe(false)
    expect(h.isCritical.value).toBe(false)
    expect(h.showChip.value).toBe(false)
  })

  it('records key sizes in bytes', () => {
    localStorage.setItem('a', 'hello')
    const sizes = computeKeySizes()
    expect(sizes.length).toBe(1)
    expect(sizes[0].key).toBe('a')
    expect(sizes[0].bytes).toBe(2 * (1 + 5))
  })

  it('level=warning at >=70%, level=critical at >=90%', () => {
    // UTF-16: each char = 2 bytes. Quota 1000 bytes means 500 chars of value.
    const quota = 1000
    const h = useStorageHealth({ quotaBytes: quota })

    // 0 bytes — ok
    expect(h.level.value).toBe('ok')

    // ~70% bytes — warning (350 chars × 2 = 700 bytes; 70% of 1000)
    localStorage.setItem('x', 'a'.repeat(348))
    h.refresh()
    expect(h.percent.value).toBeGreaterThanOrEqual(70)
    expect(h.level.value).toBe('warning')
    expect(h.isWarning.value).toBe(true)
    expect(h.showChip.value).toBe(true)

    // ~90% bytes — critical
    localStorage.setItem('x', 'a'.repeat(448))
    h.refresh()
    expect(h.percent.value).toBeGreaterThanOrEqual(90)
    expect(h.level.value).toBe('critical')
    expect(h.isCritical.value).toBe(true)
  })

  it('getTopKeys returns sorted by size desc', () => {
    localStorage.setItem('small', 'a')
    localStorage.setItem('big', 'a'.repeat(100))
    const h = useStorageHealth()
    h.refresh()
    const top = h.getTopKeys(2)
    expect(top[0].key).toBe('big')
    expect(top[1].key).toBe('small')
  })

  it('safeSetItem returns ok=true on success', () => {
    const r = safeSetItem('k', 'v')
    expect(r.ok).toBe(true)
  })

  it('safeSetItem catches quota error (simulated)', () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function () {
      const e = new Error('quota')
      e.name = 'QuotaExceededError'
      throw e
    }
    try {
      const r = safeSetItem('k', 'v')
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('quota')
    } finally {
      Storage.prototype.setItem = original
    }
  })

  it('refresh updates entries and used', () => {
    const h = useStorageHealth()
    localStorage.setItem('x', 'abc')
    h.refresh()
    expect(h.used.value).toBeGreaterThan(0)
    expect(h.entries.value.length).toBe(1)
  })
})

describe('computeUsage', () => {
  beforeEach(() => localStorage.clear())

  it('sums used across all keys', () => {
    localStorage.setItem('a', '1')
    localStorage.setItem('b', '22')
    const u = computeUsage()
    expect(u.used).toBe(2 * (1 + 1) + 2 * (1 + 2))
    expect(u.entries.length).toBe(2)
  })
})