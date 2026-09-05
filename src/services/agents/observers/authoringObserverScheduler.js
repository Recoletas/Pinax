const DEFAULT_IDLE_DELAY_MS = 4000

function defaultDelay(fn, ms) {
  return setTimeout(fn, ms)
}

function defaultCancel(timer) {
  clearTimeout(timer)
}

function resolveScheduleKey(delta = {}) {
  const documentId = String(delta.documentId || '').trim()
  if (documentId) return documentId
  const refs = Array.isArray(delta.sourceRefs) ? delta.sourceRefs.filter(Boolean) : []
  if (refs.length || delta.revision) {
    return `source:${refs.join(',') || 'unknown'}@${String(delta.revision || '')}`
  }
  return ''
}

export function createAuthoringObserverScheduler({
  run,
  invalidate = null,
  onResult = null,
  idleDelayMs = DEFAULT_IDLE_DELAY_MS,
  delayFn = defaultDelay,
  cancelFn = defaultCancel
} = {}) {
  if (typeof run !== 'function') {
    throw new Error('createAuthoringObserverScheduler requires a run function')
  }

  const pending = new Map()

  async function execute(entry) {
    const delta = entry.delta
    // 失效先行：来源 revision 变化时先 stale 旧派生记忆，再重算。
    if (typeof invalidate === 'function') {
      try {
        await invalidate(delta)
      } catch (error) {
        return { ok: false, stage: 'invalidate', error }
      }
    }
    // Stale guard: a delta derived against a superseded revision produces zero writes.
    if (delta.expectedRevision && delta.documentRevision !== delta.expectedRevision) {
      return { ok: true, status: 'stale' }
    }
    try {
      const result = await run(delta)
      if (typeof onResult === 'function' && result && result.status !== 'stale') {
        onResult(result)
      }
      return { ok: true, status: result?.status || 'completed', result }
    } catch (error) {
      // Observer failures never surface into the prose path.
      return { ok: false, stage: 'run', error }
    }
  }

  function enqueue(key, entry) {
    entry.timer = delayFn(async () => {
      pending.delete(key)
      await execute(entry)
    }, Math.max(0, Number(idleDelayMs) || 0))
    pending.set(key, entry)
  }

  function scheduleObservers(delta = {}) {
    const key = resolveScheduleKey(delta)
    if (!key) return { accepted: false, reason: 'missing-document' }

    const existing = pending.get(key)
    if (existing) cancelFn(existing.timer)

    const entry = { delta }
    enqueue(key, entry)

    return { accepted: true, documentId: String(delta.documentId || ''), documentRevision: String(delta.documentRevision || '') }
  }

  // 受控记忆边界：显式调度一个 source revision 失效+重算任务（可 flush 立即执行）。
  function schedule(payload = {}) {
    const key = resolveScheduleKey(payload)
    if (!key) return { accepted: false, reason: 'missing-source' }

    const existing = pending.get(key)
    if (existing) cancelFn(existing.timer)

    const entry = { delta: payload }
    enqueue(key, entry)

    return { accepted: true, key }
  }

  async function flush() {
    const entries = [...pending.entries()]
    for (const [key, entry] of entries) {
      cancelFn(entry.timer)
      pending.delete(key)
    }
    const results = []
    for (const [, entry] of entries) {
      results.push(await execute(entry))
    }
    return results
  }

  function cancelObservers(documentId) {
    const key = String(documentId || '')
    const existing = pending.get(key)
    if (!existing) return false
    cancelFn(existing.timer)
    pending.delete(key)
    return true
  }

  // 会话切换/重置：取消全部待执行任务（含 boundary 独立键），避免旧任务跨会话执行。
  function cancelAll() {
    const keys = [...pending.keys()]
    for (const key of keys) {
      cancelFn(pending.get(key).timer)
      pending.delete(key)
    }
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
