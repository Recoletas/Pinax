/**
 * useDebounce - 通用 debounce + flushPending helper
 *
 * - trailing-only 默认(leading: false)
 * - debounced.flush() 立即触发该 debounced 的 pending 调用
 * - flushPending() 立即触发所有 pending 调用(全局)
 * - SSR-safe(typeof window === 'undefined' 时返回 no-op)
 *
 * 不替代 lodash.debounce;Pinax 0 useDebounce 时手写轻量。
 */

const pendingFlushes = new Set()

export function debounce(fn, ms, { leading = false, trailing = true } = {}) {
  if (typeof window === 'undefined' || typeof setTimeout === 'undefined') {
    // SSR: pass-through (no timer available)
    function ssrPassThrough(...args) {
      fn.apply(this, args)
    }
    ssrPassThrough.flush = () => {}
    return ssrPassThrough
  }
  let timerId = null
  let lastArgs = null
  let lastThis = null

  function run() {
    if (trailing && lastArgs) fn.apply(lastThis, lastArgs)
    lastArgs = null
    lastThis = null
    if (timerId !== null) {
      clearTimeout(timerId)
      timerId = null
    }
    pendingFlushes.delete(flush)
  }

  function debounced(...args) {
    lastArgs = args
    lastThis = this
    if (leading && timerId === null) fn.apply(this, args)
    if (timerId !== null) clearTimeout(timerId)
    timerId = setTimeout(run, ms)
    pendingFlushes.add(flush)
  }

  function flush() {
    if (timerId !== null) {
      run()
    }
  }

  debounced.flush = flush
  return debounced
}

export function flushPending() {
  if (typeof window === 'undefined') return
  // Snapshot first to avoid mutation during iteration
  const flushes = Array.from(pendingFlushes)
  for (const flush of flushes) {
    flush()
  }
  pendingFlushes.clear()
}

export default { debounce, flushPending }
