import { normalizeAuthoringObserverTarget } from './authoringObservationContract.js'

const DEFAULT_IDLE_DELAY_MS = 4000
const COMPLETED_FINGERPRINT_LIMIT = 256

function defaultDelay(fn, ms) {
  return setTimeout(fn, ms)
}

function defaultCancel(timer) {
  clearTimeout(timer)
}

function resolveScheduleKey(delta = {}) {
  const explicitKey = String(delta.scheduleKey || '').trim()
  if (explicitKey) return explicitKey
  const documentId = String(delta.documentId || '').trim()
  if (documentId) return documentId
  const refs = Array.isArray(delta.sourceRefs) ? delta.sourceRefs.filter(Boolean) : []
  if (refs.length || delta.revision) {
    return `source:${refs.join(',') || 'unknown'}@${String(delta.revision || '')}`
  }
  return ''
}

function resolveDeltaRevision(delta = {}) {
  return String(delta.documentRevision || delta.revision || '').trim()
}

function extractRangeText(range, fullText) {
  if (typeof range === 'string') return range.trim()
  if (!range || typeof range !== 'object') return ''
  for (const key of ['changedText', 'text', 'content']) {
    const value = range[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  const start = Number(range.start ?? range.from ?? range.startOffset)
  const end = Number(range.end ?? range.to ?? range.endOffset)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return ''
  return fullText.slice(
    Math.max(0, Math.min(fullText.length, start)),
    Math.max(0, Math.min(fullText.length, end))
  ).trim()
}

function resolveDeltaContent(delta = {}) {
  const hasChangedText = typeof delta.changedText === 'string'
  const changedText = hasChangedText ? delta.changedText.trim() : ''
  if (changedText) return changedText

  const fullText = String(delta.text || '')
  const rawRanges = delta.changedRanges ?? delta.changedRange
  const hasChangedRanges = rawRanges !== undefined && rawRanges !== null
  const ranges = Array.isArray(rawRanges) ? rawRanges : (rawRanges ? [rawRanges] : [])
  const rangeText = ranges
    .map((range) => extractRangeText(range, fullText))
    .filter(Boolean)
    .join('\n')
    .trim()
  if (rangeText) return rangeText
  return hasChangedText || hasChangedRanges ? '' : fullText
}

function createContentFingerprint(delta = {}) {
  const content = resolveDeltaContent(delta).replace(/\s+/g, ' ').trim()
  let hash = 2166136261
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${content.length}:${(hash >>> 0).toString(36)}`
}

function createExecutionIdentity(key, delta = {}) {
  return `${key}\u0000${resolveDeltaRevision(delta)}\u0000${createContentFingerprint(delta)}`
}

export function createAuthoringObserverScheduler({
  run,
  invalidate = null,
  onResult = null,
  onSettled = null,
  idleDelayMs = DEFAULT_IDLE_DELAY_MS,
  delayFn = defaultDelay,
  cancelFn = defaultCancel
} = {}) {
  if (typeof run !== 'function') {
    throw new Error('createAuthoringObserverScheduler requires a run function')
  }

  const pending = new Map()
  const inFlight = new Map()
  const completed = new Map()
  const latestIdentityByKey = new Map()
  let generation = 0

  function isEntryCurrent(entry) {
    return entry.generation === generation && latestIdentityByKey.get(entry.key) === entry.identity
  }

  function settledPayload(entry, execution) {
    const status = !execution?.ok
      ? 'failed'
      : execution.status === 'stale' ? 'stale' : 'completed'
    return Object.freeze({
      status,
      key: entry.key,
      target: normalizeAuthoringObserverTarget(entry.delta),
      result: execution?.result || null,
      error: execution?.error || null
    })
  }

  async function emitSettled(entry, execution) {
    const settled = settledPayload(entry, execution)
    if (typeof onResult === 'function' && settled.status === 'completed' && settled.result) {
      try {
        await onResult(settled.result)
      } catch {
        // 结果监听器失败不能改变后台观察器的执行结果。
      }
    }
    if (typeof onSettled === 'function') {
      try {
        await onSettled(settled)
      } catch {
        // settled 监听器失败不能反向污染正文或调度器状态。
      }
    }
    return settled
  }

  async function execute(entry) {
    const delta = entry.delta
    if (!isEntryCurrent(entry)) return { ok: true, status: 'stale', result: null }
    // 失效先行：来源 revision 变化时先 stale 旧派生记忆，再重算。
    if (typeof invalidate === 'function') {
      try {
        await invalidate(delta)
      } catch (error) {
        if (!isEntryCurrent(entry)) return { ok: true, status: 'stale', result: null }
        return { ok: false, stage: 'invalidate', error }
      }
    }
    if (!isEntryCurrent(entry)) return { ok: true, status: 'stale', result: null }
    // Stale guard: a delta derived against a superseded revision produces zero writes.
    if (delta.expectedRevision && delta.documentRevision !== delta.expectedRevision) {
      return { ok: true, status: 'stale', result: null }
    }
    try {
      const result = await run(delta, {
        isCurrent: () => isEntryCurrent(entry)
      })
      if (!isEntryCurrent(entry) || result?.status === 'stale') {
        return {
          ok: true,
          status: 'stale',
          result: result && result.status === 'stale' ? result : { ...result, status: 'stale' }
        }
      }
      return { ok: true, status: result?.status || 'completed', result }
    } catch (error) {
      if (!isEntryCurrent(entry)) return { ok: true, status: 'stale', result: null }
      // Observer failures never surface into the prose path.
      return { ok: false, stage: 'run', error }
    }
  }

  function rememberCompleted(entry) {
    completed.set(entry.identity, entry.key)
    while (completed.size > COMPLETED_FINGERPRINT_LIMIT) {
      completed.delete(completed.keys().next().value)
    }
  }

  async function executeEntry(entry) {
    inFlight.set(entry.identity, entry)
    let result
    try {
      result = await execute(entry)
      if (isEntryCurrent(entry) && result.ok && result.status !== 'stale') {
        rememberCompleted(entry)
      }
    } finally {
      if (inFlight.get(entry.identity) === entry) inFlight.delete(entry.identity)
    }
    await emitSettled(entry, result)
    return result
  }

  function enqueue(key, entry) {
    entry.timer = delayFn(async () => {
      if (pending.get(key) !== entry) return
      pending.delete(key)
      await executeEntry(entry)
    }, Math.max(0, Number(idleDelayMs) || 0))
    pending.set(key, entry)
  }

  function scheduleEntry(delta, missingReason) {
    const key = resolveScheduleKey(delta)
    if (!key) return { accepted: false, skipped: true, reason: missingReason }

    const identity = createExecutionIdentity(key, delta)
    const existing = pending.get(key)
    if (existing?.identity === identity || inFlight.has(identity)) {
      return { accepted: false, skipped: true, reason: 'duplicate-pending', key }
    }
    if (completed.has(identity)) {
      return { accepted: false, skipped: true, reason: 'duplicate-executed', key }
    }
    if (existing) cancelFn(existing.timer)

    const entry = { delta, key, identity, generation }
    latestIdentityByKey.set(key, identity)
    enqueue(key, entry)
    return { accepted: true, key }
  }

  function scheduleObservers(delta = {}) {
    const result = scheduleEntry(delta, 'missing-document')
    return {
      ...result,
      scheduleKey: resolveScheduleKey(delta),
      documentId: String(delta.documentId || ''),
      documentRevision: String(delta.documentRevision || '')
    }
  }

  // 受控记忆边界：显式调度一个 source revision 失效+重算任务（可 flush 立即执行）。
  function schedule(payload = {}) {
    return scheduleEntry(payload, 'missing-source')
  }

  async function flush() {
    const entries = [...pending.entries()]
    for (const [key, entry] of entries) {
      cancelFn(entry.timer)
      pending.delete(key)
    }
    const results = []
    for (const [, entry] of entries) {
      results.push(await executeEntry(entry))
    }
    return results
  }

  function cancelObservers(documentId) {
    const key = String(documentId || '').trim()
    const existing = pending.get(key)
    if (existing) {
      cancelFn(existing.timer)
      pending.delete(key)
    }
    const hasInFlight = [...inFlight.values()].some((entry) => entry.key === key)
    // 删除 latest identity 同时使已进入 run() 的 isCurrent() 失效。
    if (existing || hasInFlight) latestIdentityByKey.delete(key)
    return Boolean(existing || hasInFlight)
  }

  // 会话切换/重置：取消全部待执行任务（含 boundary 独立键），避免旧任务跨会话执行。
  function cancelAll() {
    const keys = [...pending.keys()]
    for (const key of keys) {
      cancelFn(pending.get(key).timer)
      pending.delete(key)
    }
    generation += 1
    completed.clear()
    latestIdentityByKey.clear()
    return keys.length
  }

  function pendingCount() {
    return pending.size
  }

  return Object.freeze({
    scheduleObservers,
    schedule,
    flush,
    cancelObservers,
    cancelAll,
    pendingCount
  })
}
