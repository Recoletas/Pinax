import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage'
import { compactMemoryText, MEMORY_TEXT_LIMIT } from './memoryCompaction'

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

export const MEMORY_SYNC_STATUSES = ['pending', 'local-only', 'syncing', 'synced', 'failed']

const MEMORY_SYNC_STATUS_LABELS = {
  pending: '待同步',
  'local-only': '仅本地',
  syncing: '同步中',
  synced: '已同步',
  failed: '同步失败'
}

const MEMORY_CONTEXT_SECTIONS = [
  { scope: 'global-author', label: '全局作者记忆' },
  { scope: 'project', label: '当前作品记忆' },
  { scope: 'session', label: '当前会话记忆' }
]

export function listMemoryCandidates({ scope = null, scopeId = null, status = null } = {}) {
  const stored = getItem(STORAGE_KEYS.MEMORY_CANDIDATES)
  const list = compactStoredPendingCandidates(Array.isArray(stored) ? stored : [])

  return list
    .filter((item) => !scope || item.scope === scope)
    .filter((item) => !scopeId || item.scopeId === scopeId)
    .filter((item) => !status || item.status === status)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
}

export function createMemoryCandidate(input = {}) {
  const now = Date.now()
  const rawContent = normalizeText(input.content)
  const hasExplicitMemoryType = Boolean(input.memoryType || input.type || input.metadata?.sourceType)
  const content = input.skipCompaction || !shouldCompactCandidateInput(rawContent, hasExplicitMemoryType)
    ? rawContent
    : compactMemoryText(
      rawContent,
      input.memoryType || input.type || input.metadata?.sourceType || input.kind || 'general',
      input.metadata || {}
    )
  const status = normalizeStatus(input.status)
  const contentHash = input.contentHash || createMemoryContentHash(content)

  return {
    id: input.id || `mem_${now}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: MEMORY_SCHEMA_VERSION,
    scope: normalizeScope(input.scope),
    scopeId: normalizeText(input.scopeId),
    kind: normalizeKind(input.kind),
    content,
    confidence: clampConfidence(input.confidence),
    sourceRef: normalizeText(input.sourceRef),
    status,
    syncStatus: normalizeSyncStatus(input.syncStatus, status),
    remoteId: normalizeText(input.remoteId),
    lastSyncedAt: normalizeTimestamp(input.lastSyncedAt),
    lastSyncError: normalizeText(input.lastSyncError),
    contentHash,
    duplicateOf: normalizeText(input.duplicateOf),
    similarTo: normalizeText(input.similarTo),
    conflictsWith: normalizeConflictList(input.conflictsWith),
    metadata: normalizeMetadata(input.metadata),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now
  }
}

function compactStoredPendingCandidates(list = []) {
  let changed = false
  const next = list.map((item) => {
    if (!item || item.status !== 'pending') return item

    const content = normalizeText(item.content)
    if (!shouldCompactStoredCandidate(content)) return item

    const compacted = compactMemoryText(
      content,
      item.metadata?.sourceType || item.kind || 'general',
      item.metadata || {}
    )
    if (!compacted || compacted === content) return item

    changed = true
    return {
      ...item,
      content: compacted,
      contentHash: createMemoryContentHash(compacted),
      metadata: {
        ...item.metadata,
        compactedAt: item.metadata?.compactedAt || Date.now(),
        sourceLength: item.metadata?.sourceLength || content.length
      },
      updatedAt: Date.now()
    }
  })

  if (changed) {
    setItem(STORAGE_KEYS.MEMORY_CANDIDATES, next)
  }
  return next
}

function shouldCompactStoredCandidate(content) {
  if (!content) return false
  return content.length > MEMORY_TEXT_LIMIT || /^小说体验事件[:：]/.test(content)
}

function shouldCompactCandidateInput(content, hasExplicitMemoryType = false) {
  if (shouldCompactStoredCandidate(content)) return true
  return hasExplicitMemoryType && content.length > 24
}

export function queueMemoryCandidate(input = {}) {
  const candidate = createMemoryCandidate(input)
  if (!candidate.content) {
    return { success: false, skipped: true }
  }

  const current = listMemoryCandidates()
  const duplicate = findDuplicateMemoryCandidate(candidate, current)
  if (duplicate) {
    candidate.duplicateOf = duplicate.id
    candidate.similarTo = ''
    candidate.conflictsWith = []
  } else {
    const similar = findSimilarMemoryCandidate(candidate, current)
    if (similar) {
      candidate.similarTo = similar.id
      candidate.conflictsWith = []
    } else {
      candidate.conflictsWith = findConflictingMemoryCandidates(candidate, current, { excludeId: candidate.id })
    }
  }
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
    const nextContent = patch.content !== undefined ? normalizeText(patch.content) : item.content
    const nextItem = {
      ...item,
      ...patch,
      scope: patch.scope ? normalizeScope(patch.scope) : item.scope,
      scopeId: patch.scopeId !== undefined ? normalizeText(patch.scopeId) : item.scopeId,
      kind: patch.kind ? normalizeKind(patch.kind) : item.kind,
      status: patch.status ? normalizeStatus(patch.status) : item.status,
      content: nextContent,
      confidence: patch.confidence !== undefined ? clampConfidence(patch.confidence) : item.confidence,
      syncStatus: patch.syncStatus !== undefined
        ? normalizeSyncStatus(patch.syncStatus, patch.status || item.status)
        : item.syncStatus || normalizeSyncStatus('', patch.status || item.status),
      remoteId: patch.remoteId !== undefined ? normalizeText(patch.remoteId) : item.remoteId || '',
      lastSyncedAt: patch.lastSyncedAt !== undefined ? normalizeTimestamp(patch.lastSyncedAt) : normalizeTimestamp(item.lastSyncedAt),
      lastSyncError: patch.lastSyncError !== undefined ? normalizeText(patch.lastSyncError) : normalizeText(item.lastSyncError),
      contentHash: patch.contentHash !== undefined ? normalizeText(patch.contentHash) : createMemoryContentHash(nextContent),
      metadata: patch.metadata ? normalizeMetadata(patch.metadata) : item.metadata,
      updatedAt: now
    }
    const duplicate = findDuplicateMemoryCandidate(nextItem, current, { excludeId: candidateId })
    const similar = duplicate ? null : findSimilarMemoryCandidate(nextItem, current, { excludeId: candidateId })
    const shouldTrackConflicts = nextItem.status === 'pending' || nextItem.status === 'active'
    updated = {
      ...nextItem,
      duplicateOf: patch.duplicateOf !== undefined ? normalizeText(patch.duplicateOf) : (duplicate?.id || ''),
      similarTo: patch.similarTo !== undefined ? normalizeText(patch.similarTo) : (similar?.id || ''),
      conflictsWith: patch.conflictsWith !== undefined
        ? normalizeConflictList(patch.conflictsWith)
        : (duplicate?.id || similar?.id || !shouldTrackConflicts ? [] : findConflictingMemoryCandidates(nextItem, current, { excludeId: candidateId }))
    }
    return updated
  })

  if (!updated) return null
  setItem(STORAGE_KEYS.MEMORY_CANDIDATES, next)
  return updated
}

export function confirmMemoryCandidate(candidateId) {
  return updateMemoryCandidate(candidateId, {
    status: 'active',
    syncStatus: 'local-only',
    lastSyncError: ''
  })
}

export function rejectMemoryCandidate(candidateId) {
  return updateMemoryCandidate(candidateId, {
    status: 'rejected',
    syncStatus: 'local-only',
    lastSyncError: ''
  })
}

export function archiveMemoryCandidate(candidateId, { note = '' } = {}) {
  const current = listMemoryCandidates()
  const candidate = current.find((item) => item.id === candidateId) || null
  if (!candidate) {
    return { success: false, skipped: true, reason: 'not-found' }
  }

  const archived = updateMemoryCandidate(candidateId, {
    status: 'stale',
    syncStatus: 'local-only',
    remoteId: '',
    lastSyncedAt: null,
    lastSyncError: '',
    duplicateOf: '',
    similarTo: '',
    conflictsWith: [],
    metadata: {
      ...candidate.metadata,
      archivedAt: Date.now(),
      previousStatus: candidate.status,
      archiveNote: normalizeText(note || candidate.metadata?.archiveNote || '')
    }
  })

  if (!archived) {
    return { success: false, skipped: true, reason: 'not-found' }
  }

  return {
    success: true,
    candidate: archived
  }
}

export function restoreMemoryCandidate(candidateId, { status = '' } = {}) {
  const current = listMemoryCandidates()
  const candidate = current.find((item) => item.id === candidateId) || null
  if (!candidate) {
    return { success: false, skipped: true, reason: 'not-found' }
  }

  const requestedStatus = normalizeStatus(status || candidate.metadata?.previousStatus || 'pending')
  const restoredStatus = requestedStatus === 'active' ? 'active' : 'pending'
  const restored = updateMemoryCandidate(candidateId, {
    status: restoredStatus,
    syncStatus: restoredStatus === 'active' ? 'local-only' : 'pending',
    remoteId: '',
    lastSyncedAt: null,
    lastSyncError: '',
    metadata: {
      ...candidate.metadata,
      restoredAt: Date.now(),
      restoredStatus
    }
  })

  if (!restored) {
    return { success: false, skipped: true, reason: 'not-found' }
  }

  return {
    success: true,
    candidate: restored
  }
}

export function replaceMemoryCandidateConflicts(candidateId, { note = '' } = {}) {
  const current = listMemoryCandidates()
  const target = current.find((item) => item.id === candidateId) || null
  if (!target) {
    return { success: false, skipped: true, reason: 'not-found' }
  }

  const conflictIds = findConflictingMemoryCandidates(target, current, { excludeId: candidateId })
  const confirmed = updateMemoryCandidate(candidateId, {
    status: 'active',
    syncStatus: 'local-only',
    lastSyncError: '',
    conflictsWith: []
  })

  if (!confirmed) {
    return { success: false, skipped: true, reason: 'not-found' }
  }

  const replacedCandidates = []
  for (const conflictId of conflictIds) {
    const replaced = updateMemoryCandidate(conflictId, {
      status: 'stale',
      syncStatus: 'local-only',
      lastSyncError: note || '已被新记忆替换',
      conflictsWith: []
    })
    if (replaced) {
      replacedCandidates.push(replaced)
    }
  }

  return {
    success: true,
    candidate: confirmed,
    replacedCandidates,
    replacedIds: replacedCandidates.map((item) => item.id),
    replacedCount: replacedCandidates.length
  }
}

export function mergeMemoryCandidateConflicts(candidateId, { note = '' } = {}) {
  const current = listMemoryCandidates()
  const target = current.find((item) => item.id === candidateId) || null
  if (!target) {
    return { success: false, skipped: true, reason: 'not-found' }
  }

  const conflictIds = findConflictingMemoryCandidates(target, current, { excludeId: candidateId })
  if (!conflictIds.length) {
    return { success: false, skipped: true, reason: 'no-conflicts' }
  }

  const conflictCandidates = conflictIds
    .map((conflictId) => current.find((item) => item.id === conflictId) || null)
    .filter(Boolean)

  const mergedContent = mergeMemoryContentPieces([
    target.content,
    ...conflictCandidates.map((item) => item.content)
  ])

  const confirmed = updateMemoryCandidate(candidateId, {
    content: mergedContent,
    status: 'active',
    syncStatus: 'local-only',
    lastSyncError: '',
    duplicateOf: '',
    conflictsWith: []
  })

  if (!confirmed) {
    return { success: false, skipped: true, reason: 'not-found' }
  }

  const mergedCandidates = []
  for (const conflictId of conflictIds) {
    const merged = updateMemoryCandidate(conflictId, {
      status: 'stale',
      syncStatus: 'local-only',
      lastSyncError: note || '已合并到新记忆',
      conflictsWith: []
    })
    if (merged) {
      mergedCandidates.push(merged)
    }
  }

  return {
    success: true,
    candidate: confirmed,
    mergedContent,
    mergedCandidates,
    mergedIds: mergedCandidates.map((item) => item.id),
    mergedCount: mergedCandidates.length,
    mergedSourceCount: conflictIds.length
  }
}

export function batchArchiveMemoryCandidates(candidateIds = [], { note = '' } = {}) {
  const ids = Array.from(new Set((Array.isArray(candidateIds) ? candidateIds : [candidateIds])
    .map((candidateId) => normalizeText(candidateId))
    .filter(Boolean)))

  if (!ids.length) {
    return { success: false, skipped: true, reason: 'no-targets' }
  }

  const archivedCandidates = []
  for (const candidateId of ids) {
    const result = archiveMemoryCandidate(candidateId, { note })
    if (result.success && result.candidate) {
      archivedCandidates.push(result.candidate)
    }
  }

  if (!archivedCandidates.length) {
    return { success: false, skipped: true, reason: 'not-found' }
  }

  return {
    success: true,
    archivedCandidates,
    archivedCount: archivedCandidates.length
  }
}

export function batchUpdateMemoryCandidateScope(candidateIds = [], patch = {}) {
  const ids = Array.from(new Set((Array.isArray(candidateIds) ? candidateIds : [candidateIds])
    .map((candidateId) => normalizeText(candidateId))
    .filter(Boolean)))

  if (!ids.length) {
    return { success: false, skipped: true, reason: 'no-targets' }
  }

  const scope = normalizeScope(patch.scope)
  const scopeId = scope === 'global-author' ? '' : normalizeText(patch.scopeId)

  if (scope !== 'global-author' && !scopeId) {
    return { success: false, skipped: true, reason: 'missing-scope-id', scope }
  }

  const current = listMemoryCandidates()
  const existingIds = new Set(current.map((item) => item.id))
  const updatedCandidates = []

  for (const candidateId of ids) {
    if (!existingIds.has(candidateId)) continue
    const updated = updateMemoryCandidate(candidateId, {
      scope,
      scopeId
    })
    if (updated) updatedCandidates.push(updated)
  }

  if (!updatedCandidates.length) {
    return { success: false, skipped: true, reason: 'not-found', scope, scopeId }
  }

  return {
    success: true,
    updatedCandidates,
    updatedCount: updatedCandidates.length,
    scope,
    scopeId
  }
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
  const recall = buildScopedMemoryRecallContext({
    authorId,
    projectId,
    sessionId,
    query: '',
    limitPerScope,
    maxItemChars
  })
  return recall.content
}

export const MEMORY_RECALL_PREVIEW_LIMIT = 120

export function rankScopedActiveMemoryCandidates({
  authorId = '',
  projectId = '',
  sessionId = '',
  query = '',
  limitPerScope = 4
} = {}) {
  const limit = Math.max(1, Math.floor(Number(limitPerScope) || 4))
  const active = listMemoryCandidates({ status: 'active' })
  const normalizedQuery = normalizeText(query).toLowerCase()
  const queryTerms = tokenizeRecallQuery(normalizedQuery)

  // Build per-scope filtered list (same rules as listScopedActiveMemoryCandidates)
  const perScope = {}
  for (const section of MEMORY_CONTEXT_SECTIONS) {
    perScope[section.scope] = active
      .filter((candidate) => candidate.scope === section.scope)
      .filter((candidate) => {
        if (section.scope === 'global-author') {
          return !normalizeText(authorId) || !candidate.scopeId || candidate.scopeId === normalizeText(authorId)
        }
        if (section.scope === 'project') {
          return Boolean(normalizeText(projectId)) && candidate.scopeId === normalizeText(projectId)
        }
        return Boolean(normalizeText(sessionId)) && candidate.scopeId === normalizeText(sessionId)
      })
  }

  // Rank and limit per scope
  const ranked = []
  for (const section of MEMORY_CONTEXT_SECTIONS) {
    const scopedCandidates = perScope[section.scope]
    if (!scopedCandidates.length) continue

    const scored = scopedCandidates
      .map((candidate) => ({
        candidate,
        score: scoreMemoryCandidate(candidate, queryTerms)
      }))
      .sort((a, b) => {
        if (b.score.matchedTerms !== a.score.matchedTerms) {
          return b.score.matchedTerms - a.score.matchedTerms
        }
        if (b.score.confidence !== a.score.confidence) {
          return b.score.confidence - a.score.confidence
        }
        return Number(b.candidate.updatedAt || b.candidate.createdAt || 0)
          - Number(a.candidate.updatedAt || a.candidate.createdAt || 0)
      })
      .slice(0, limit)

    for (const entry of scored) {
      const content = normalizeText(entry.candidate.content)
      ranked.push({
        id: entry.candidate.id,
        scope: entry.candidate.scope,
        scopeId: entry.candidate.scopeId,
        kind: entry.candidate.kind,
        score: entry.score.matchedTerms,
        confidence: entry.score.confidence,
        matchedTerms: entry.score.matchedTerms,
        queryTerms: queryTerms.length,
        recency: Number(entry.candidate.updatedAt || entry.candidate.createdAt || 0),
        preview: buildMemoryRecallPreview(content, MEMORY_RECALL_PREVIEW_LIMIT),
        contentChars: content.length,
        included: true
      })
    }
  }

  return {
    query: normalizedQuery,
    queryTerms,
    items: ranked,
    counts: {
      eligible: active.length,
      perScope: Object.fromEntries(
        MEMORY_CONTEXT_SECTIONS.map((section) => [section.scope, perScope[section.scope].length])
      )
    }
  }
}

export function buildScopedMemoryRecallContext({
  authorId = '',
  projectId = '',
  sessionId = '',
  query = '',
  limitPerScope = 4,
  maxItemChars = 180
} = {}) {
  const limit = Math.max(1, Math.floor(Number(limitPerScope) || 4))
  const maxChars = Math.max(60, Math.floor(Number(maxItemChars) || 180))
  const normalizedQuery = normalizeText(query).toLowerCase()
  const queryTerms = tokenizeRecallQuery(normalizedQuery)

  const active = listMemoryCandidates({ status: 'active' })
  const filtered = filterCandidatesByScope(active, { authorId, projectId, sessionId })

  // Score + sort within each scope, take top `limit`
  const included = []
  const excluded = []
  for (const section of MEMORY_CONTEXT_SECTIONS) {
    const scoped = filtered.filter((candidate) => candidate.scope === section.scope)
    if (!scoped.length) continue

    const ranked = scoped
      .map((candidate) => ({
        candidate,
        score: scoreMemoryCandidate(candidate, queryTerms)
      }))
      .sort((a, b) => {
        if (b.score.matchedTerms !== a.score.matchedTerms) {
          return b.score.matchedTerms - a.score.matchedTerms
        }
        if (b.score.confidence !== a.score.confidence) {
          return b.score.confidence - a.score.confidence
        }
        return Number(b.candidate.updatedAt || b.candidate.createdAt || 0)
          - Number(a.candidate.updatedAt || a.candidate.createdAt || 0)
      })

    const winners = ranked.slice(0, limit)
    const losers = ranked.slice(limit)
    for (const entry of winners) {
      const content = normalizeText(entry.candidate.content)
      included.push({
        id: entry.candidate.id,
        scope: entry.candidate.scope,
        scopeId: entry.candidate.scopeId,
        kind: entry.candidate.kind,
        score: entry.score.matchedTerms,
        confidence: entry.score.confidence,
        matchedTerms: entry.score.matchedTerms,
        queryTerms: queryTerms.length,
        recency: Number(entry.candidate.updatedAt || entry.candidate.createdAt || 0),
        preview: buildMemoryRecallPreview(content, MEMORY_RECALL_PREVIEW_LIMIT),
        contentChars: content.length,
        // 内部使用：构造上下文文本时不丢失原始内容；审计元数据仅依赖 preview。
        _content: content,
        included: true
      })
    }
    for (const entry of losers) {
      const content = normalizeText(entry.candidate.content)
      excluded.push({
        id: entry.candidate.id,
        scope: entry.candidate.scope,
        scopeId: entry.candidate.scopeId,
        kind: entry.candidate.kind,
        score: entry.score.matchedTerms,
        confidence: entry.score.confidence,
        matchedTerms: entry.score.matchedTerms,
        queryTerms: queryTerms.length,
        recency: Number(entry.candidate.updatedAt || entry.candidate.createdAt || 0),
        preview: buildMemoryRecallPreview(content, MEMORY_RECALL_PREVIEW_LIMIT),
        contentChars: content.length,
        _content: content,
        included: false,
        skipReason: 'per-scope-cap'
      })
    }
  }

  const items = [...included, ...excluded]
  const content = buildMemoryContextText(included, maxChars)

  return {
    content,
    items,
    included,
    excluded,
    query: normalizedQuery,
    queryTerms,
    totalItems: items.length,
    includedCount: included.length,
    contentChars: content.length,
    counts: {
      eligible: active.length,
      included: included.length,
      excluded: excluded.length
    }
  }
}

function filterCandidatesByScope(candidates, { authorId, projectId, sessionId } = {}) {
  const normalizedAuthorId = normalizeText(authorId)
  const normalizedProjectId = normalizeText(projectId)
  const normalizedSessionId = normalizeText(sessionId)
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    if (!candidate || candidate.status !== 'active') return false
    if (candidate.scope === 'global-author') {
      return !normalizedAuthorId || !candidate.scopeId || candidate.scopeId === normalizedAuthorId
    }
    if (candidate.scope === 'project') {
      return Boolean(normalizedProjectId) && candidate.scopeId === normalizedProjectId
    }
    if (candidate.scope === 'session') {
      return Boolean(normalizedSessionId) && candidate.scopeId === normalizedSessionId
    }
    return false
  })
}

function scoreMemoryCandidate(candidate, queryTerms = []) {
  const confidence = Number(candidate?.confidence)
  const safeConfidence = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5
  if (!queryTerms.length) {
    return { matchedTerms: 0, confidence: safeConfidence }
  }

  const haystack = normalizeText(candidate?.content).toLowerCase()
  let matchedTerms = 0
  for (const term of queryTerms) {
    if (term && haystack.includes(term)) matchedTerms += 1
  }
  return { matchedTerms, confidence: safeConfidence }
}

function tokenizeRecallQuery(query) {
  if (!query) return []
  const seen = new Set()
  const tokens = []
  const addToken = (raw) => {
    const token = String(raw || '').trim().toLowerCase()
    if (!token || token.length < 2 || token.length > 8) return
    if (/^[\d.]+$/.test(token)) return
    if (seen.has(token)) return
    seen.add(token)
    tokens.push(token)
  }

  const rawString = String(query)
  const chunks = rawString.split(/[\s,，。！？、；：,.!?;:"'“”‘’（）()\[\]{}<>《》\n\r\t/]+/u)
  for (const chunk of chunks) {
    const cleaned = String(chunk || '').trim()
    if (!cleaned) continue
    addToken(cleaned)
    if (/[一-鿿]/.test(cleaned) && cleaned.length >= 2) {
      for (let index = 0; index < cleaned.length - 1; index += 1) {
        addToken(cleaned.slice(index, index + 2))
      }
      for (let index = 0; index < cleaned.length - 2; index += 1) {
        addToken(cleaned.slice(index, index + 3))
      }
    }
  }

  return tokens.slice(0, 256)
}

function buildMemoryRecallPreview(content, limit = MEMORY_RECALL_PREVIEW_LIMIT) {
  const text = normalizeText(content).replace(/\s+/g, ' ')
  if (!text) return ''
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}…`
}

function buildMemoryContextText(items, maxChars) {
  if (!items.length) return ''
  const lines = ['【已确认记忆】以下内容来自用户确认过的记忆，只在相关时使用，不要主动复述。']
  for (const section of MEMORY_CONTEXT_SECTIONS) {
    const scoped = items.filter((item) => item.scope === section.scope)
    if (!scoped.length) continue
    lines.push(`\n${section.label}：`)
    for (const item of scoped) {
      const text = item._content || item.preview
      const truncated = text.length > maxChars ? `${text.slice(0, maxChars)}…` : text
      lines.push(`- ${getMemoryKindLabel(item.kind)}：${truncated}`)
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

export function getMemorySyncStatusLabel(syncStatus) {
  return MEMORY_SYNC_STATUS_LABELS[syncStatus] || '未同步'
}

export function findDuplicateMemoryCandidate(candidate, candidates = [], { excludeId = '' } = {}) {
  if (!candidate || typeof candidate !== 'object') return null
  const contentHash = candidate.contentHash || createMemoryContentHash(candidate.content)
  if (!contentHash) return null

  const normalizedScope = normalizeScope(candidate.scope)
  const normalizedScopeId = normalizeText(candidate.scopeId)
  const normalizedKind = normalizeKind(candidate.kind)
  const normalizedExcludeId = normalizeText(excludeId || candidate.id)

  return (Array.isArray(candidates) ? candidates : [])
    .filter((item) => item && typeof item === 'object')
    .filter((item) => item.id !== normalizedExcludeId)
    .filter((item) => item.status !== 'rejected' && item.status !== 'stale')
    .filter((item) => normalizeScope(item.scope) === normalizedScope)
    .filter((item) => normalizeText(item.scopeId) === normalizedScopeId)
    .filter((item) => normalizeKind(item.kind) === normalizedKind)
    .filter((item) => (item.contentHash || createMemoryContentHash(item.content)) === contentHash)
    .sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1
      if (a.status !== 'active' && b.status === 'active') return 1
      return Number(b.createdAt || 0) - Number(a.createdAt || 0)
    })[0] || null
}

export function findSimilarMemoryCandidate(candidate, candidates = [], { excludeId = '', minSimilarity = 0.82 } = {}) {
  if (!candidate || typeof candidate !== 'object') return null
  const contentHash = candidate.contentHash || createMemoryContentHash(candidate.content)
  const normalizedContent = normalizeMemoryContent(candidate.content)
  if (!contentHash || normalizedContent.length < 8) return null

  const normalizedScope = normalizeScope(candidate.scope)
  const normalizedScopeId = normalizeText(candidate.scopeId)
  const normalizedKind = normalizeKind(candidate.kind)
  const normalizedExcludeId = normalizeText(excludeId || candidate.id)
  const threshold = Math.min(0.98, Math.max(0.5, Number(minSimilarity) || 0.82))

  return (Array.isArray(candidates) ? candidates : [])
    .filter((item) => item && typeof item === 'object')
    .filter((item) => item.id !== normalizedExcludeId)
    .filter((item) => item.status !== 'rejected' && item.status !== 'stale')
    .filter((item) => normalizeScope(item.scope) === normalizedScope)
    .filter((item) => normalizeText(item.scopeId) === normalizedScopeId)
    .filter((item) => normalizeKind(item.kind) === normalizedKind)
    .filter((item) => (item.contentHash || createMemoryContentHash(item.content)) !== contentHash)
    .map((item) => ({
      item,
      similarity: getMemoryContentSimilarity(normalizedContent, normalizeMemoryContent(item.content))
    }))
    .filter(({ similarity }) => similarity >= threshold)
    .sort((a, b) => {
      if (a.item.status === 'active' && b.item.status !== 'active') return -1
      if (a.item.status !== 'active' && b.item.status === 'active') return 1
      if (b.similarity !== a.similarity) return b.similarity - a.similarity
      return Number(b.item.createdAt || 0) - Number(a.item.createdAt || 0)
    })[0]?.item || null
}

export function findConflictingMemoryCandidates(candidate, candidates = [], { excludeId = '' } = {}) {
  if (!candidate || typeof candidate !== 'object') return []
  const contentHash = candidate.contentHash || createMemoryContentHash(candidate.content)
  if (!contentHash) return []

  const normalizedScope = normalizeScope(candidate.scope)
  const normalizedScopeId = normalizeText(candidate.scopeId)
  const normalizedKind = normalizeKind(candidate.kind)
  const normalizedExcludeId = normalizeText(excludeId || candidate.id)

  return (Array.isArray(candidates) ? candidates : [])
    .filter((item) => item && typeof item === 'object')
    .filter((item) => item.id !== normalizedExcludeId)
    .filter((item) => item.status === 'active')
    .filter((item) => normalizeScope(item.scope) === normalizedScope)
    .filter((item) => normalizeText(item.scopeId) === normalizedScopeId)
    .filter((item) => normalizeKind(item.kind) === normalizedKind)
    .filter((item) => (item.contentHash || createMemoryContentHash(item.content)) !== contentHash)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .map((item) => item.id)
}

export function createMemoryContentHash(content) {
  const text = normalizeMemoryContent(content)
  if (!text) return ''

  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a_${(hash >>> 0).toString(36)}`
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

function normalizeSyncStatus(syncStatus, candidateStatus = 'pending') {
  const value = String(syncStatus || '').trim()
  if (MEMORY_SYNC_STATUSES.includes(value)) return value
  return candidateStatus === 'pending' ? 'pending' : 'local-only'
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeMemoryContent(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、；：,.!?;:"'“”‘’（）()[\]{}<>《》]/g, '')
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.max(0, Math.floor(num))
}

function truncateText(value, maxChars) {
  const text = normalizeText(value).replace(/\s+/g, ' ')
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}...`
}

function normalizeMetadata(metadata) {
  return metadata && typeof metadata === 'object' ? metadata : {}
}

function normalizeConflictList(conflictsWith) {
  if (Array.isArray(conflictsWith)) {
    return Array.from(new Set(conflictsWith.map((item) => normalizeText(item)).filter(Boolean)))
  }

  const text = normalizeText(conflictsWith)
  return text ? [text] : []
}

function getMemoryContentSimilarity(left, right) {
  if (!left || !right || left === right) return left === right && left ? 1 : 0

  const shorter = left.length <= right.length ? left : right
  const longer = left.length > right.length ? left : right
  if (shorter.length >= 8 && longer.includes(shorter) && shorter.length / longer.length >= 0.72) {
    return 0.95
  }

  const leftGrams = createCharacterBigrams(left)
  const rightGrams = createCharacterBigrams(right)
  if (!leftGrams.size || !rightGrams.size) return 0

  let intersection = 0
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) intersection++
  }

  return (2 * intersection) / (leftGrams.size + rightGrams.size)
}

function createCharacterBigrams(text) {
  const value = normalizeMemoryContent(text)
  if (value.length < 2) return new Set(value ? [value] : [])

  const grams = new Set()
  for (let index = 0; index < value.length - 1; index += 1) {
    grams.add(value.slice(index, index + 2))
  }
  return grams
}

function mergeMemoryContentPieces(pieces = []) {
  const uniquePieces = []
  const seen = new Set()

  for (const piece of pieces) {
    const text = normalizeText(piece)
    if (!text) continue
    const fingerprint = normalizeMemoryContent(text)
    if (!fingerprint || seen.has(fingerprint)) continue
    seen.add(fingerprint)
    uniquePieces.push(text)
  }

  return uniquePieces.join('\n')
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
