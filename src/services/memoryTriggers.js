import { createMemoryCandidate, queueMemoryCandidate } from './memoryCandidates'

// 第一阶段只实现四类边界中的三类本地触发；context-resolve 由 ProjectKnowledgeFacade 承担。
const DERIVE_TYPES = new Set(['prose-commit', 'boundary', 'explicit'])
const BOUNDED_TYPES = new Set(['keystroke', 'cursor-move'])

function text(value) {
  return String(value ?? '').trim()
}

function normalizeSourceRefs(value) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : []
}

export function createMemoryTriggers({
  derive = null,
  invalidate = null,
  queue = null,
  isAgentEnabled = null,
  clock = () => Date.now()
} = {}) {
  const boundaryDedupe = new Map()

  function agentEnabled() {
    return typeof isAgentEnabled === 'function' ? Boolean(isAgentEnabled()) : true
  }

  function buildPayload(event, type) {
    return {
      type,
      projectId: text(event.projectId),
      sessionId: text(event.sessionId),
      scopeKey: text(event.scopeKey),
      text: String(event.text || ''),
      sourceRefs: normalizeSourceRefs(event.sourceRefs),
      revision: text(event.revision),
      range: event.range || null,
      at: Number(clock())
    }
  }

  async function handle(event = {}) {
    const type = text(event.type).toLowerCase()
    if (type === 'context-resolve') {
      return { handled: false, reason: 'delegated-to-facade' }
    }
    if (!DERIVE_TYPES.has(type)) {
      if (BOUNDED_TYPES.has(type)) return { handled: false, reason: 'non-durable-boundary' }
      return { handled: false, reason: 'unknown-trigger' }
    }

    const payload = buildPayload(event, type)

    if (type === 'boundary') {
      const dedupeKey = `${payload.projectId}:${payload.sessionId}:${text(event.scopeKey)}`
      if (boundaryDedupe.get(dedupeKey) === payload.revision) {
        return { handled: false, reason: 'duplicate-boundary' }
      }
      boundaryDedupe.set(dedupeKey, payload.revision)
    }

    // Agent 关闭时不发生自动模型提取；显式“记住”的本地候选由 rememberExplicitly 单独创建。
    if (!agentEnabled()) {
      return { handled: true, type, derived: false, reason: 'agent-disabled' }
    }
    if (typeof derive !== 'function') {
      return { handled: true, type, derived: false, reason: 'no-derive' }
    }
    await derive(payload)
    return { handled: true, type, derived: true }
  }

  async function rememberExplicitly({
    content = '',
    projectId = '',
    scope = 'project',
    scopeId = '',
    kind = 'project-fact',
    sourceRefs = [],
    sourceRevision = '',
    confirm = false
  } = {}) {
    const trimmedContent = text(content)
    if (!trimmedContent) {
      return { success: false, skipped: true, reason: 'empty-content' }
    }
    const candidate = createMemoryCandidate({
      content: trimmedContent,
      scope,
      scopeId: scope === 'global-author' ? '' : (text(scopeId) || text(projectId)),
      kind,
      status: confirm ? 'active' : 'pending',
      authority: confirm && scope === 'global-author' ? 'accepted' : undefined,
      derivedBy: 'explicit',
      sourceRefs: normalizeSourceRefs(sourceRefs),
      // 显式记住同样要带来源 revision，否则确认时无法通过 durable 来源约束。
      sourceRevision: text(sourceRevision)
    })
    const result = typeof queue === 'function'
      ? queue(candidate)
      : queueMemoryCandidate(candidate)
    const queuedCandidate = result?.candidate || candidate

    // 可选语义提取：只在 Agent 开启时进行，失败/跳过不影响本地候选。
    let derivation = { derived: false, reason: agentEnabled() ? 'no-derive' : 'agent-disabled' }
    if (agentEnabled() && typeof derive === 'function') {
      try {
        await derive(buildPayload({ ...arguments[0], projectId: queuedCandidate.scopeId }, 'explicit'))
        derivation = { derived: true }
      } catch (error) {
        derivation = { derived: false, reason: 'derive-failed', error: String(error?.message || error) }
      }
    }

    return { success: true, candidate: queuedCandidate, ...derivation }
  }

  async function emitInvalidation(event = {}) {
    const payload = {
      sourceRefs: normalizeSourceRefs(event.sourceRefs),
      revision: text(event.revision),
      reason: text(event.reason) || 'prose-undo',
      at: Number(clock())
    }
    if (typeof invalidate === 'function') {
      await invalidate(payload)
    }
    return payload
  }

  return Object.freeze({
    handle,
    rememberExplicitly,
    invalidate: emitInvalidation
  })
}
