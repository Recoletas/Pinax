import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage'

export const MEMORY_SCHEMA_VERSION = 1

export const MEMORY_KINDS = [
  { value: 'author-preference', label: '作者偏好' },
  { value: 'project-fact', label: '作品事实' },
  { value: 'character-state', label: '角色状态' },
  { value: 'plot-event', label: '剧情事件' },
  { value: 'style-sample', label: '风格样本' },
  { value: 'constraint', label: '约束' }
]

export const MEMORY_SCOPES = [
  { value: 'global-author', label: '全局作者' },
  { value: 'project', label: '当前作品' },
  { value: 'session', label: '当前会话' }
]

export const MEMORY_STATUSES = ['pending', 'active', 'rejected', 'stale']

const MEMORY_CONTEXT_SECTIONS = [
  { scope: 'global-author', label: '全局作者记忆' },
  { scope: 'project', label: '当前作品记忆' },
  { scope: 'session', label: '当前会话记忆' }
]

export function listMemoryCandidates({ scope = null, scopeId = null, status = null } = {}) {
  const stored = getItem(STORAGE_KEYS.MEMORY_CANDIDATES)
  const list = Array.isArray(stored) ? stored : []

  return list
    .filter((item) => !scope || item.scope === scope)
    .filter((item) => !scopeId || item.scopeId === scopeId)
    .filter((item) => !status || item.status === status)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
}

export function createMemoryCandidate(input = {}) {
  const now = Date.now()
  const content = normalizeText(input.content)

  return {
    id: input.id || `mem_${now}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: MEMORY_SCHEMA_VERSION,
    scope: normalizeScope(input.scope),
    scopeId: normalizeText(input.scopeId),
    kind: normalizeKind(input.kind),
    content,
    confidence: clampConfidence(input.confidence),
    sourceRef: normalizeText(input.sourceRef),
    status: normalizeStatus(input.status),
    metadata: normalizeMetadata(input.metadata),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now
  }
}

export function queueMemoryCandidate(input = {}) {
  const candidate = createMemoryCandidate(input)
  if (!candidate.content) {
    return { success: false, skipped: true }
  }

  const current = listMemoryCandidates()
  const next = [candidate, ...current]
  setItem(STORAGE_KEYS.MEMORY_CANDIDATES, next)
  emitMemoryCandidateEvent(candidate)
  return { success: true, queued: true, candidate }
}

export function updateMemoryCandidate(candidateId, patch = {}) {
  const current = listMemoryCandidates()
  const now = Date.now()
  let updated = null

  const next = current.map((item) => {
    if (item.id !== candidateId) return item
    updated = {
      ...item,
      ...patch,
      scope: patch.scope ? normalizeScope(patch.scope) : item.scope,
      scopeId: patch.scopeId !== undefined ? normalizeText(patch.scopeId) : item.scopeId,
      kind: patch.kind ? normalizeKind(patch.kind) : item.kind,
      status: patch.status ? normalizeStatus(patch.status) : item.status,
      content: patch.content !== undefined ? normalizeText(patch.content) : item.content,
      confidence: patch.confidence !== undefined ? clampConfidence(patch.confidence) : item.confidence,
      metadata: patch.metadata ? normalizeMetadata(patch.metadata) : item.metadata,
      updatedAt: now
    }
    return updated
  })

  if (!updated) return null
  setItem(STORAGE_KEYS.MEMORY_CANDIDATES, next)
  return updated
}

export function confirmMemoryCandidate(candidateId) {
  return updateMemoryCandidate(candidateId, { status: 'active' })
}

export function rejectMemoryCandidate(candidateId) {
  return updateMemoryCandidate(candidateId, { status: 'rejected' })
}

export function listScopedActiveMemoryCandidates({
  authorId = '',
  projectId = '',
  sessionId = '',
  limitPerScope = 4
} = {}) {
  const normalizedAuthorId = normalizeText(authorId)
  const normalizedProjectId = normalizeText(projectId)
  const normalizedSessionId = normalizeText(sessionId)
  const limit = Math.max(1, Math.floor(Number(limitPerScope) || 4))
  const active = listMemoryCandidates({ status: 'active' })

  return MEMORY_CONTEXT_SECTIONS.flatMap(({ scope }) => active
    .filter((candidate) => candidate.scope === scope)
    .filter((candidate) => {
      if (scope === 'global-author') {
        return !normalizedAuthorId || !candidate.scopeId || candidate.scopeId === normalizedAuthorId
      }
      if (scope === 'project') {
        return Boolean(normalizedProjectId) && candidate.scopeId === normalizedProjectId
      }
      return Boolean(normalizedSessionId) && candidate.scopeId === normalizedSessionId
    })
    .slice(0, limit))
}

export function buildScopedMemoryContext({
  authorId = '',
  projectId = '',
  sessionId = '',
  limitPerScope = 4,
  maxItemChars = 180
} = {}) {
  const memories = listScopedActiveMemoryCandidates({
    authorId,
    projectId,
    sessionId,
    limitPerScope
  })

  if (!memories.length) return ''

  const maxChars = Math.max(60, Math.floor(Number(maxItemChars) || 180))
  const lines = ['【已确认记忆】以下内容来自用户确认过的记忆，只在相关时使用，不要主动复述。']

  for (const section of MEMORY_CONTEXT_SECTIONS) {
    const scoped = memories.filter((candidate) => candidate.scope === section.scope)
    if (!scoped.length) continue

    lines.push(`\n${section.label}：`)
    for (const memory of scoped) {
      const content = truncateText(memory.content, maxChars)
      lines.push(`- ${getMemoryKindLabel(memory.kind)}：${content}`)
    }
  }

  return lines.join('\n')
}

export function getMemoryKindLabel(kind) {
  return MEMORY_KINDS.find((item) => item.value === kind)?.label || '记忆'
}

export function getMemoryScopeLabel(scope) {
  return MEMORY_SCOPES.find((item) => item.value === scope)?.label || '记忆'
}

function normalizeScope(scope) {
  return MEMORY_SCOPES.some((item) => item.value === scope) ? scope : 'session'
}

function normalizeKind(kind) {
  return MEMORY_KINDS.some((item) => item.value === kind) ? kind : 'project-fact'
}

function normalizeStatus(status) {
  return MEMORY_STATUSES.includes(status) ? status : 'pending'
}

function normalizeText(value) {
  return String(value || '').trim()
}

function truncateText(value, maxChars) {
  const text = normalizeText(value).replace(/\s+/g, ' ')
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}...`
}

function normalizeMetadata(metadata) {
  return metadata && typeof metadata === 'object' ? metadata : {}
}

function clampConfidence(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0.5
  return Math.min(1, Math.max(0, num))
}

function emitMemoryCandidateEvent(candidate) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent('memory-candidate-created', {
      detail: {
        id: candidate.id,
        kind: candidate.kind,
        scope: candidate.scope,
        scopeId: candidate.scopeId,
        text: candidate.content.slice(0, 60)
      }
    }))
  } catch (error) {
    console.warn('[memoryCandidates] failed to dispatch event', error)
  }
}
