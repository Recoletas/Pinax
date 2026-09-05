import { getItem, STORAGE_KEYS } from '../composables/useStorage'
import { normalizeStringList } from '../../shared/memoryContract'

function text(value) {
  return String(value ?? '').trim()
}

function boundedScore(score) {
  if (!score || typeof score !== 'object') return null
  const keys = ['relevance', 'importance', 'authority', 'recency', 'scopeFit', 'final']
  const output = {}
  for (const key of keys) {
    const num = Number(score[key])
    if (Number.isFinite(num)) output[key] = num
  }
  return Object.keys(output).length ? output : null
}

// 隐私边界：receipt 只保存 ID、来源 ref、评分分项与原因，绝不保存 query 原文、记忆正文或 prompt。
export function createMemoryRecallReceipt({
  requestId = '',
  taskId = '',
  query = '',
  included = [],
  excluded = [],
  createdAt = Date.now()
} = {}) {
  return {
    schemaVersion: 1,
    requestId: text(requestId),
    taskId: text(taskId),
    queryChars: text(query).length,
    createdAt: Number.isFinite(Number(createdAt)) ? Number(createdAt) : Date.now(),
    included: (Array.isArray(included) ? included : []).map((item) => ({
      id: text(item?.id),
      entryId: text(item?.id),
      sourceRefs: normalizeStringList(item?.sourceRefs).slice(0, 16),
      score: boundedScore(item?.score),
      reason: 'included',
      chars: Number.isFinite(Number(item?.contentChars)) ? Number(item.contentChars) : null
    })),
    excluded: (Array.isArray(excluded) ? excluded : []).map((item) => ({
      id: text(item?.id),
      entryId: text(item?.id),
      sourceRefs: normalizeStringList(item?.sourceRefs).slice(0, 16),
      score: boundedScore(item?.score),
      skipReason: text(item?.skipReason) || 'excluded'
    })),
    counts: {
      included: Array.isArray(included) ? included.length : 0,
      excluded: Array.isArray(excluded) ? excluded.length : 0
    }
  }
}

// 软上限只提示整理，不自动删除或 archive。
export function inspectMemoryCapacity({ projectId = '', softLimit = 500 } = {}) {
  const normalizedProjectId = text(projectId)
  const limit = Math.max(1, Math.floor(Number(softLimit) || 500))
  if (!normalizedProjectId) {
    return { projectId: '', activeCount: 0, pendingCount: 0, totalCount: 0, softLimit: limit, overLimit: false, action: 'none' }
  }

  const stored = getItem(STORAGE_KEYS.MEMORY_CANDIDATES)
  const list = Array.isArray(stored) ? stored : []
  let activeCount = 0
  let pendingCount = 0
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    if (item.scope !== 'project' || item.scopeId !== normalizedProjectId) continue
    if (item.status === 'active') activeCount += 1
    else if (item.status === 'pending') pendingCount += 1
  }
  const totalCount = activeCount + pendingCount
  const overLimit = totalCount > limit
  return {
    projectId: normalizedProjectId,
    activeCount,
    pendingCount,
    totalCount,
    softLimit: limit,
    overLimit,
    action: overLimit ? 'review-required' : 'none'
  }
}
