import { getItem, STORAGE_KEYS } from '../../composables/useStorage'
import { commitMemorySnapshot, publicMemoryCandidate } from './memoryHistoryStore'
import { compactMemoryText, MEMORY_TEXT_LIMIT } from './memoryCompaction'
import { deriveMemoryImportance } from './memoryImportance'
import { rankMemoryCandidates } from './memoryRetrieval'

import {
  MEMORY_SCHEMA_VERSION,
  MEMORY_AUTHORITIES,
  MEMORY_DERIVATIONS,
  MEMORY_RETRIEVAL_POLICY,
  normalizeStringList,
  defaultMemoryAuthority
} from '../../../shared/memoryContract'

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

function storedMemoryNeedsMigration(item) {
  return !item
    || typeof item !== 'object'
    || item.schemaVersion !== MEMORY_SCHEMA_VERSION
    || !Array.isArray(item.sourceRefs)
    || !MEMORY_AUTHORITIES.includes(item.authority)
    || !Array.isArray(item.supersedes)
    || !('recallCount' in item)
    || !('importanceOverride' in item)
}

// 存量数据读时迁移：v1 记录补齐 v2 字段；缺来源的标 migrationWarning，不删除。
function migrateStoredMemoryCandidate(item) {
  const sourceRefs = (Array.isArray(item.sourceRefs) && item.sourceRefs.length)
    ? normalizeStringList(item.sourceRefs)
    : normalizeStringList(item.sourceRef)
  const metadata = { ...(item.metadata || {}) }
  if (!sourceRefs.length && !metadata.migrationWarning) {
    metadata.migrationWarning = 'missing-source-ref'
  }
  return {
    ...item,
    schemaVersion: MEMORY_SCHEMA_VERSION,
    sourceRef: sourceRefs[0] || '',
    sourceRefs,
    sourceRevision: normalizeText(item.sourceRevision),
    authority: MEMORY_AUTHORITIES.includes(item.authority) ? item.authority : defaultMemoryAuthority(item.status),
    derivedBy: MEMORY_DERIVATIONS.includes(item.derivedBy) ? item.derivedBy : '',
    importance: clampOptionalUnit(item.importance),
    importanceOverride: clampOptionalUnit(item.importanceOverride),
    supersedes: normalizeStringList(item.supersedes),
    recallCount: normalizeNonNegativeInt(item.recallCount),
    lastRecalledAt: normalizeTimestamp(item.lastRecalledAt),
    metadata
  }
}

export function listMemoryCandidates({ scope = null, scopeId = null, status = null } = {}) {
  const stored = getItem(STORAGE_KEYS.MEMORY_CANDIDATES)
  let list = Array.isArray(stored) ? stored : []
  let migrated = false
  list = list.map((item) => {
    if (!storedMemoryNeedsMigration(item)) return item
    migrated = true
    return migrateStoredMemoryCandidate(item)
  })
  // 压缩与迁移都可能改动存储：各自一次性写回。
  list = compactStoredPendingCandidates(list)
  if (migrated) {
    commitMemorySnapshot(list)
  }

  return list
    .filter((item) => !scope || item.scope === scope)
    .filter((item) => !scopeId || item.scopeId === scopeId)
    .filter((item) => !status || item.status === status)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .map(publicMemoryCandidate)
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
  const authority = normalizeAuthority(input.authority, status)
  const sourceRefs = input.sourceRefs !== undefined || input.sourceRef !== undefined
    ? normalizeStringList(input.sourceRefs ?? input.sourceRef)
    : []
  // durable 不变式：derived/imported 的 active 记忆必须有来源 ref 和来源 revision。
  if (status === 'active' && (authority === 'derived' || authority === 'imported')) {
    if (!sourceRefs.length || !normalizeText(input.sourceRevision)) {
      throw new Error('MEMORY_SOURCE_REQUIRED: durable derived/imported memory needs source refs and source revision')
    }
  }
  const contentHash = input.contentHash || createMemoryContentHash(content)

  return {
    id: input.id || `mem_${now}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: MEMORY_SCHEMA_VERSION,
    scope: normalizeScope(input.scope),
    scopeId: normalizeText(input.scopeId),
    kind: normalizeKind(input.kind),
    content,
    confidence: clampConfidence(input.confidence),
    sourceRef: sourceRefs[0] || '',
    sourceRefs,
    sourceRevision: normalizeText(input.sourceRevision),
    authority,
    derivedBy: normalizeDerivation(input.derivedBy),
    importance: clampOptionalUnit(input.importance) ?? deriveMemoryImportance({
      kind: normalizeKind(input.kind),
      signals: input.signals || {},
      override: input.importanceOverride
    }),
    importanceOverride: clampOptionalUnit(input.importanceOverride),
    supersedes: normalizeStringList(input.supersedes),
    recallCount: normalizeNonNegativeInt(input.recallCount),
    lastRecalledAt: normalizeTimestamp(input.lastRecalledAt),
    status,
    syncStatus: normalizeSyncStatus(input.syncStatus, status),
    remoteId: normalizeText(input.remoteId),
    lastSyncedAt: normalizeTimestamp(input.lastSyncedAt),
    lastSyncError: normalizeText(input.lastSyncError),
    contentHash,
    duplicateOf: normalizeText(input.duplicateOf),
    similarTo: normalizeText(input.similarTo),
    conflictsWith: normalizeConflictList(input.conflictsWith),
    metadata: buildMetadataWithMigrationWarning(input.metadata, sourceRefs),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now
  }
}

function normalizeAuthority(authority, status) {
  return MEMORY_AUTHORITIES.includes(authority) ? authority : defaultMemoryAuthority(status)
}

function normalizeDerivation(derivedBy) {
  return MEMORY_DERIVATIONS.includes(derivedBy) ? derivedBy : ''
}

function clampOptionalUnit(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.min(1, Math.max(0, Math.round(num * 100) / 100))
}

function normalizeNonNegativeInt(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return 0
  return Math.floor(num)
}

function buildMetadataWithMigrationWarning(metadata, sourceRefs) {
  const base = normalizeMetadata(metadata)
  if (sourceRefs.length || base.migrationWarning) return base
  return { ...base, migrationWarning: 'missing-source-ref' }
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
    commitMemorySnapshot(next)
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
    return {
      success: false,
      queued: false,
      skipped: true,
      reason: 'exact-duplicate',
      candidate: duplicate,
      duplicateOf: duplicate.id
    }
  }

  const similar = findSimilarMemoryCandidate(candidate, current)
  if (similar) {
    candidate.similarTo = similar.id
    candidate.conflictsWith = []
  } else {
    candidate.conflictsWith = findConflictingMemoryCandidates(candidate, current, { excludeId: candidate.id })
  }
  const next = [candidate, ...current]
  if (!commitMemorySnapshot(next)) {
    return { success: false, queued: false, skipped: true, reason: 'storage-failed' }
  }
  emitMemoryCandidateEvent(candidate)
  return { success: true, queued: true, candidate }
}

export function invalidateMemoryBySource({ sourceRef = '', currentRevision = '', reason = 'source-revision-changed' } = {}) {
  const ref = normalizeText(sourceRef)
  if (!ref) {
    return { success: false, skipped: true, reason: 'missing-source-ref', staledIds: [], untouchedIds: [] }
  }

  const current = listMemoryCandidates()
  const staledIds = []
  const untouchedIds = []
  const now = Date.now()

  const next = current.map((item) => {
    const refs = Array.isArray(item.sourceRefs) ? item.sourceRefs : [item.sourceRef].filter(Boolean)
    if (!refs.includes(ref)) return item
    // 只豁免 global-author + explicit 偏好；带章节来源的 accepted 项目记忆必须随来源失效。
    if (item.scope === 'global-author' && item.derivedBy === 'explicit') {
      untouchedIds.push(item.id)
      return item
    }
    const recordedRevision = normalizeText(item.sourceRevision)
    if (!normalizeText(currentRevision) || !recordedRevision || recordedRevision === normalizeText(currentRevision)) {
      untouchedIds.push(item.id)
      return item
    }
    if (item.status === 'stale' || item.status === 'rejected') {
      untouchedIds.push(item.id)
      return item
    }
    staledIds.push(item.id)
    return {
      ...item,
      status: 'stale',
      syncStatus: 'local-only',
      lastSyncError: '',
      conflictsWith: [],
      metadata: {
        ...item.metadata,
        previousStatus: item.status,
        staleReason: normalizeText(reason) || 'source-revision-changed',
        invalidatedAt: now
      },
      updatedAt: now
    }
  })

  if (!staledIds.length) {
    return { success: true, staledIds, untouchedIds, reason: 'nothing-to-stale' }
  }
  if (!commitMemorySnapshot(next)) return { success: false, reason: 'storage-failed', staledIds: [], untouchedIds }
  return { success: true, staledIds, untouchedIds, reason: normalizeText(reason) || 'source-revision-changed' }
}

export function supersedeMemoryCandidates(input = {}) {
  const current = listMemoryCandidates()
  const supersedesIds = normalizeStringList(input.supersedes)
  if (!supersedesIds.length) {
    return { success: false, skipped: true, reason: 'no-targets' }
  }

  const scope = normalizeScope(input.scope)
  const scopeId = normalizeText(input.scopeId)
  const targets = []
  for (const targetId of supersedesIds) {
    const target = current.find((item) => item.id === targetId) || null
    if (!target || target.scope !== scope || normalizeText(target.scopeId) !== scopeId || target.status === 'stale') {
      return { success: false, skipped: true, reason: 'invalid-target', invalidId: targetId }
    }
    targets.push(target)
  }

  const now = Date.now()
  const candidate = createMemoryCandidate({
    ...input,
    status: 'active',
    scope,
    scopeId,
    supersedes: supersedesIds
  })
  const next = [candidate, ...current.map((item) => {
    if (!supersedesIds.includes(item.id)) return item
    return {
      ...item,
      status: 'stale',
      syncStatus: 'local-only',
      lastSyncError: '',
      conflictsWith: [],
      metadata: {
        ...item.metadata,
        supersededBy: candidate.id,
        previousStatus: item.status,
        supersededAt: now
      },
      updatedAt: now
    }
  })]
  if (!commitMemorySnapshot(next)) {
    return { success: false, skipped: true, reason: 'storage-failed' }
  }
  emitMemoryCandidateEvent(candidate)
  return { success: true, candidate, supersededIds: supersedesIds }
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
  if (!commitMemorySnapshot(next)) return null
  return updated
}

export function confirmMemoryCandidate(candidateId) {
  const candidate = listMemoryCandidates().find((item) => item.id === candidateId) || null
  if (!candidate) return null
  // durable 升级闭环：用户确认即明确升级为 accepted 权威；
  // project/session 记忆必须有来源 ref + 来源 revision；global-author 偏好以确认动作本身为显式 receipt。
  const canUpgrade = candidate.scope === 'global-author'
    || (Array.isArray(candidate.sourceRefs) && candidate.sourceRefs.length > 0 && normalizeText(candidate.sourceRevision))
  if (!canUpgrade) return null
  return updateMemoryCandidate(candidateId, {
    status: 'active',
    authority: 'accepted',
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

// append-only 替换/合并：创建带 supersedes[] 的新 active revision，旧条目统一 stale，
// 单次 setItem 原子写入；中途失败不会留下半完成状态。
function commitSupersedeTransaction({ target, conflictTargets = [], content, note = '' }) {
  // 与普通确认同一来源约束：project/session 记忆必须有来源 ref + 来源 revision 才能升级为 durable。
  const canPromote = target.scope === 'global-author'
    || (Array.isArray(target.sourceRefs) && target.sourceRefs.length > 0 && normalizeText(target.sourceRevision))
  if (!canPromote) {
    return { error: 'missing-source-provenance' }
  }

  const current = listMemoryCandidates()
  const now = Date.now()
  const supersededIds = [target.id, ...conflictTargets.map((item) => item.id)]
  const candidate = createMemoryCandidate({
    kind: target.kind,
    scope: target.scope,
    scopeId: target.scopeId,
    content,
    status: 'active',
    authority: 'accepted',
    derivedBy: 'explicit',
    sourceRefs: Array.isArray(target.sourceRefs) ? target.sourceRefs : [],
    sourceRevision: normalizeText(target.sourceRevision),
    importanceOverride: clampOptionalUnit(target.importanceOverride),
    supersedes: supersededIds,
    metadata: {
      note: normalizeText(note),
      replacesCount: supersededIds.length
    }
  })
  const next = [
    candidate,
    ...current.map((item) => {
      if (!supersededIds.includes(item.id)) return item
      return {
        ...item,
        status: 'stale',
        syncStatus: 'local-only',
        lastSyncError: '',
        conflictsWith: [],
        metadata: {
          ...item.metadata,
          supersededBy: candidate.id,
          previousStatus: item.status,
          supersededAt: now
        },
        updatedAt: now
      }
    })
  ]
  // 持久化失败必须如实报告，不能发事件假装成功。
  if (!commitMemorySnapshot(next)) {
    return { error: 'storage-failed' }
  }
  emitMemoryCandidateEvent(candidate)
  return { candidate, supersededIds, staledAt: now }
}

export function replaceMemoryCandidateConflicts(candidateId, { note = '' } = {}) {
  const current = listMemoryCandidates()
  const target = current.find((item) => item.id === candidateId) || null
  if (!target) {
    return { success: false, skipped: true, reason: 'not-found' }
  }

  const conflictIds = findConflictingMemoryCandidates(target, current, { excludeId: candidateId })
  const conflictTargets = conflictIds
    .map((conflictId) => current.find((item) => item.id === conflictId))
    .filter(Boolean)

  const committed = commitSupersedeTransaction({
    target,
    conflictTargets,
    content: target.content,
    note
  })
  if (committed.error) {
    return { success: false, skipped: true, reason: committed.error }
  }

  return {
    success: true,
    candidate: committed.candidate,
    replacedCandidates: [target, ...conflictTargets],
    replacedIds: committed.supersededIds,
    replacedCount: committed.supersededIds.length
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
  const conflictTargets = conflictIds
    .map((conflictId) => current.find((item) => item.id === conflictId))
    .filter(Boolean)

  const mergedContent = mergeMemoryContentPieces([
    target.content,
    ...conflictTargets.map((item) => item.content)
  ])

  const committed = commitSupersedeTransaction({
    target,
    conflictTargets,
    content: mergedContent,
    note
  })
  if (committed.error) {
    return { success: false, skipped: true, reason: committed.error }
  }

  return {
    success: true,
    candidate: committed.candidate,
    mergedContent,
    mergedCandidates: [target, ...conflictTargets],
    mergedIds: committed.supersededIds,
    mergedCount: committed.supersededIds.length,
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

export const MEMORY_RECALL_PREVIEW_LIMIT = 120

function runLegacyScopedRanking({ authorId, projectId, sessionId, query, limitPerScope }) {
  const limit = Math.max(1, Math.floor(Number(limitPerScope) || 4))
  const active = listMemoryCandidates({ status: 'active' })
  const byId = new Map(active.map((item) => [item.id, item]))
  const result = rankMemoryCandidates({
    candidates: active,
    query,
    authorId,
    projectId,
    sessionId,
    policy: {
      ...MEMORY_RETRIEVAL_POLICY,
      minRelevance: 0,
      topK: Number.MAX_SAFE_INTEGER,
      maxPerScope: limit
    }
  })
  return { limit, result, byId }
}

function toLegacyRecallItem(entry, { included, byId, queryTerms = [] }) {
  const candidate = byId.get(entry.id)
  const content = normalizeText(candidate?.content)
  const base = {
    id: entry.id,
    scope: entry.scope ?? candidate?.scope,
    scopeId: entry.scopeId ?? candidate?.scopeId ?? '',
    kind: entry.kind ?? candidate?.kind,
    score: entry.score ? entry.score.final : 0,
    confidence: entry.confidence ?? clampConfidence(candidate?.confidence),
    matchedTerms: entry.matchedTerms ?? scoreMemoryCandidate(candidate, queryTerms).matchedTerms,
    queryTerms: queryTerms.length,
    recency: entry.updatedAt || Number(candidate?.updatedAt || candidate?.createdAt || 0),
    preview: buildMemoryRecallPreview(content, MEMORY_RECALL_PREVIEW_LIMIT),
    contentChars: content.length,
    // 内部使用：构造上下文文本时不丢失原始内容；审计元数据仅依赖 preview。
    _content: content,
    included
  }
  if (!included) base.skipReason = entry.skipReason || 'per-scope-cap'
  return base
}

export function rankScopedActiveMemoryCandidates({
  authorId = '',
  projectId = '',
  sessionId = '',
  query = '',
  limitPerScope = 4
} = {}) {
  const { result, byId } = runLegacyScopedRanking({ authorId, projectId, sessionId, query, limitPerScope })
  const normalizedQuery = normalizeText(query).toLowerCase()
  const queryTerms = tokenizeRecallQuery(normalizedQuery)

  const ranked = [
    ...result.included.map((entry) => toLegacyRecallItem(entry, { included: true, byId, queryTerms })),
    ...result.excluded
      .filter((entry) => entry.skipReason === 'per-scope-cap')
      .map((entry) => toLegacyRecallItem(entry, { included: true, byId, queryTerms }))
  ]

  return {
    query: normalizedQuery,
    queryTerms,
    items: ranked,
    counts: {
      eligible: result.counts.eligible,
      perScope: Object.fromEntries(
        MEMORY_CONTEXT_SECTIONS.map((section) => [section.scope, ranked.filter((item) => item.scope === section.scope).length])
      )
    }
  }
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

export function buildScopedMemoryRecallContext({
  authorId = '',
  projectId = '',
  sessionId = '',
  query = '',
  limitPerScope = 4,
  maxItemChars = 180
} = {}) {
  const { limit, result, byId } = runLegacyScopedRanking({ authorId, projectId, sessionId, query, limitPerScope })
  const maxChars = Math.max(60, Math.floor(Number(maxItemChars) || 180))
  const normalizedQuery = normalizeText(query).toLowerCase()
  const queryTerms = tokenizeRecallQuery(normalizedQuery)

  let includedEntries = result.included
  let excludedEntries = result.excluded.filter((entry) => entry.skipReason === 'per-scope-cap')

  if (!normalizedQuery) {
    // 兼容旧行为：空查询用于显式“查看记忆”，仍按 confidence/recency 返回 scoped active。
    const perScopeCount = {}
    includedEntries = []
    excludedEntries = []
    const scoped = filterCandidatesByScope([...byId.values()], { authorId, projectId, sessionId })
      .sort((a, b) => (
        clampConfidence(b.confidence) - clampConfidence(a.confidence)
        || Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)
        || (a.id < b.id ? -1 : 1)
      ))
    for (const candidate of scoped) {
      const used = perScopeCount[candidate.scope] || 0
      if (used >= limit) {
        excludedEntries.push({ id: candidate.id, skipReason: 'per-scope-cap' })
      } else {
        perScopeCount[candidate.scope] = used + 1
        includedEntries.push({ id: candidate.id })
      }
    }
  }

  const included = includedEntries.map((entry) => toLegacyRecallItem(entry, { included: true, byId }))
  const excluded = excludedEntries.map((entry) => toLegacyRecallItem(entry, { included: false, byId }))
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
      eligible: result.counts.eligible,
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
  const chunks = rawString.split(/[\s,，。！？、；：,.!?;:"'“”‘’（）()[\]{}<>《》\n\r\t/]+/u)
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
    const conflicts = Array.isArray(candidate.conflictsWith) ? candidate.conflictsWith : []
    const attention = conflicts.length > 0
      || Boolean(candidate.metadata?.staleReason)
      || candidate.metadata?.migrationWarning === 'identity-ambiguity'
    window.dispatchEvent(new CustomEvent('memory-candidate-created', {
      detail: {
        id: candidate.id,
        kind: candidate.kind,
        scope: candidate.scope,
        scopeId: candidate.scopeId,
        derivedBy: candidate.derivedBy,
        attention,
        conflictCount: conflicts.length,
        text: candidate.content.slice(0, 60)
      }
    }))
  } catch { /* Best-effort fallback intentionally ignores diagnostics. */ }
}
