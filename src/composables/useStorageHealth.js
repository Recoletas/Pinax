import { ref, computed } from 'vue'

/**
 * Estimate localStorage usage and expose health status.
 *
 * - Iterates localStorage.key(i) and sums UTF-16 byte size
 * - Threshold: 70% yellow, 90% red
 * - safeSetItem wraps localStorage.setItem, returns false on QuotaExceededError
 */

const QUOTA_ESTIMATE_BYTES = 5 * 1024 * 1024 // 5 MB conservative browser default

const SIZE_OF_KEY = (key) => key.length * 2 // UTF-16
const SIZE_OF_VALUE = (value) => value.length * 2

export function computeKeySizes() {
  const entries = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    const value = localStorage.getItem(key) || ''
    const bytes = SIZE_OF_KEY(key) + SIZE_OF_VALUE(value)
    entries.push({ key, bytes, length: value.length })
  }
  return entries
}

export function computeUsage() {
  const entries = computeKeySizes()
  const used = entries.reduce((sum, e) => sum + e.bytes, 0)
  return {
    used,
    quota: QUOTA_ESTIMATE_BYTES,
    entries
  }
}

export function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value)
    return { ok: true }
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
      console.error('[useStorageHealth] QuotaExceededError on setItem:', key, e)
      return { ok: false, reason: 'quota', error: e }
    }
    console.warn('[useStorageHealth] setItem error:', e)
    return { ok: false, reason: 'unknown', error: e }
  }
}

export function useStorageHealth({ quotaBytes = QUOTA_ESTIMATE_BYTES, pollIntervalMs = 0 } = {}) {
  const used = ref(0)
  const entries = ref([])
  const lastError = ref(null)
  let timer = null

  function refresh() {
    try {
      const u = computeUsage()
      used.value = u.used
      entries.value = u.entries
    } catch (e) {
      lastError.value = e
    }
  }

  function getTopKeys(n = 10) {
    return [...entries.value].sort((a, b) => b.bytes - a.bytes).slice(0, n)
  }

  function getKeyEntries() {
    return [...entries.value].sort((a, b) => b.bytes - a.bytes)
  }

  const percent = computed(() => quotaBytes === 0 ? 0 : Math.round((used.value / quotaBytes) * 100))
  const level = computed(() => {
    const p = percent.value
    if (p >= 90) return 'critical'
    if (p >= 70) return 'warning'
    return 'ok'
  })
  const isWarning = computed(() => level.value === 'warning')
  const isCritical = computed(() => level.value === 'critical')
  const showChip = computed(() => level.value !== 'ok')

  refresh()
  if (pollIntervalMs > 0) {
    timer = setInterval(refresh, pollIntervalMs)
  }

  return {
    used,
    percent,
    level,
    isWarning,
    isCritical,
    showChip,
    entries,
    lastError,
    refresh,
    getTopKeys,
    getKeyEntries,
    quotaBytes,
    safeSetItem,
    dispose() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
  }
}