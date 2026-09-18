export const WRITING_BLOCK_HISTORY_SCHEMA_VERSION = 2
export const MAX_WRITING_BLOCK_HISTORY_PER_CHAPTER = 120
export const MAX_WRITING_BLOCK_HISTORY_STORAGE_CHARS = 2000000
// NC03：连续微改会话合并窗口。同一章/块 manual-save 在窗口内的后续保存
// 并入同一条历史（保留起点与最新恢复点）；离章/恢复/改写等边界显式封组。
export const WRITING_BLOCK_HISTORY_SESSION_WINDOW_MS = 120000

const HISTORY_SOURCES = new Set(['manual-save', 'rewrite', 'block-restore', 'search-replace', 'unknown'])

function clone(value) {
  if (value == null) return value
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

function normalizeDate(value, fallback = new Date().toISOString()) {
  const date = new Date(value || fallback)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function normalizeText(value, maxLength = 50000) {
  return String(value ?? '').slice(0, maxLength)
}

function getNodeText(node) {
  if (typeof node?.text === 'string') return node.text
  return (node?.content || []).map(getNodeText).join('')
}

function normalizeSource(value) {
  return HISTORY_SOURCES.has(value) ? value : 'unknown'
}

function entrySize(entry) {
  try {
    return JSON.stringify(entry).length
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export function getWritingBlockText(node) {
  return getNodeText(node)
}

export function createWritingBlockHistoryEntry({
  id = null,
  chapterId,
  chapterTitle = '',
  unitId = null,
  unitKind = 'passage',
  nodeId = null,
  nodeKind = 'prose',
  blockId = null,
  blockKind = null,
  previousText = '',
  currentText = '',
  fromDocumentRevision = 0,
  toDocumentRevision = 0,
  fromUnitRevision = 0,
  toUnitRevision = 0,
  fromNodeRevision = null,
  toNodeRevision = null,
  fromBlockRevision = null,
  toBlockRevision = null,
  source = 'unknown',
  createdAt = null,
  updatedAt = null,
  mergedCount = 0,
  sessionClosedAt = null
} = {}) {
  const stableNodeId = String(nodeId || blockId || '').trim()
  if (!String(chapterId || '').trim() || !stableNodeId) return null
  const previous = normalizeText(previousText)
  const current = normalizeText(currentText)
  if (previous === current) return null

  const entry = {
    schemaVersion: WRITING_BLOCK_HISTORY_SCHEMA_VERSION,
    id: String(id || `writing-block-history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    chapterId: String(chapterId),
    chapterTitle: String(chapterTitle || '').trim().slice(0, 160),
    unitId: unitId ? String(unitId) : null,
    unitKind: String(unitKind || (unitId ? 'passage' : 'legacy-fragment')),
    nodeId: stableNodeId,
    nodeKind: String(nodeKind || blockKind || 'prose'),
    previousText: previous,
    currentText: current,
    fromDocumentRevision: Number(fromDocumentRevision || 0),
    toDocumentRevision: Number(toDocumentRevision || 0),
    fromUnitRevision: Number(fromUnitRevision || 0),
    toUnitRevision: Number(toUnitRevision || 0),
    fromNodeRevision: Number(fromNodeRevision ?? fromBlockRevision ?? 0),
    toNodeRevision: Number(toNodeRevision ?? toBlockRevision ?? 0),
    source: normalizeSource(source),
    createdAt: normalizeDate(createdAt),
    updatedAt: normalizeDate(updatedAt || createdAt),
    mergedCount: Math.max(0, Math.floor(Number(mergedCount) || 0)),
    sessionClosedAt: sessionClosedAt ? normalizeDate(sessionClosedAt) : null
  }
  return entrySize(entry) <= 60000 ? entry : null
}

function flattenDocument(document) {
  return (document?.content || []).flatMap((unit) => (
    (unit?.content || []).map((node) => ({
      unit,
      node,
      unitId: unit?.attrs?.unitId || null,
      nodeId: node?.attrs?.nodeId || node?.attrs?.blockId || null
    }))
  ))
}

export function buildWritingBlockHistoryEntries({
  chapterId,
  chapterTitle = '',
  previousDocument = null,
  nextDocument = null,
  source = 'manual-save',
  createdAt = null
} = {}) {
  const previousNodes = flattenDocument(previousDocument)
  const nextNodes = flattenDocument(nextDocument)
  const previousById = new Map(previousNodes.filter((item) => item.nodeId).map((item) => [item.nodeId, item]))

  return nextNodes.map((item) => {
    const previous = previousById.get(item.nodeId)
    if (!previous) return null
    return createWritingBlockHistoryEntry({
      chapterId,
      chapterTitle,
      unitId: item.unitId,
      unitKind: item.unit?.attrs?.kind || previous.unit?.attrs?.kind || 'passage',
      nodeId: item.nodeId,
      nodeKind: item.node?.attrs?.kind || previous.node?.attrs?.kind || 'prose',
      previousText: getNodeText(previous.node),
      currentText: getNodeText(item.node),
      fromDocumentRevision: previousDocument?.revision,
      toDocumentRevision: nextDocument?.revision,
      fromUnitRevision: previous.unit?.attrs?.unitRevision,
      toUnitRevision: item.unit?.attrs?.unitRevision,
      fromNodeRevision: previous.node?.attrs?.nodeRevision ?? previous.node?.attrs?.revision,
      toNodeRevision: item.node?.attrs?.nodeRevision ?? item.node?.attrs?.revision,
      source,
      createdAt
    })
  }).filter(Boolean)
}

export function normalizeWritingBlockHistoryEntry(value, chapterId = null) {
  if (!value || ![1, WRITING_BLOCK_HISTORY_SCHEMA_VERSION].includes(Number(value.schemaVersion))) return null
  if (chapterId != null && String(value.chapterId) !== String(chapterId)) return null
  const legacy = Number(value.schemaVersion) === 1
  return createWritingBlockHistoryEntry({
    id: value.id,
    chapterId: value.chapterId,
    chapterTitle: value.chapterTitle,
    unitId: legacy ? null : value.unitId,
    unitKind: legacy ? 'legacy-fragment' : value.unitKind,
    nodeId: value.nodeId || value.blockId,
    nodeKind: value.nodeKind || value.blockKind,
    previousText: value.previousText,
    currentText: value.currentText,
    fromDocumentRevision: value.fromDocumentRevision,
    toDocumentRevision: value.toDocumentRevision,
    fromUnitRevision: value.fromUnitRevision,
    toUnitRevision: value.toUnitRevision,
    fromNodeRevision: value.fromNodeRevision ?? value.fromBlockRevision,
    toNodeRevision: value.toNodeRevision ?? value.toBlockRevision,
    source: value.source,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    mergedCount: value.mergedCount,
    sessionClosedAt: value.sessionClosedAt
  })
}

export function normalizeWritingBlockHistory(values, chapterId = null) {
  const normalized = (Array.isArray(values) ? values : [])
    .map((item) => normalizeWritingBlockHistoryEntry(item, chapterId))
    .filter(Boolean)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

  if (chapterId != null) return normalized.slice(0, MAX_WRITING_BLOCK_HISTORY_PER_CHAPTER)
  const counts = new Map()
  return normalized.filter((entry) => {
    const count = counts.get(entry.chapterId) || 0
    if (count >= MAX_WRITING_BLOCK_HISTORY_PER_CHAPTER) return false
    counts.set(entry.chapterId, count + 1)
    return true
  })
}

// NC03：同章同块连续 manual-save 的会话合并。不可合并返回 null：
// 来源不同、块不同、已封组、超窗、或内容完全相同（normalize 已挡）。
export function mergeWritingBlockHistoryEntries(previous, incoming, { windowMs = WRITING_BLOCK_HISTORY_SESSION_WINDOW_MS } = {}) {
  if (!previous || !incoming) return null
  if (String(previous.chapterId) !== String(incoming.chapterId)) return null
  if (String(previous.unitId || '') !== String(incoming.unitId || '')) return null
  if (String(previous.nodeId) !== String(incoming.nodeId)) return null
  if (previous.source !== 'manual-save' || incoming.source !== 'manual-save') return null
  if (previous.sessionClosedAt) return null
  const previousAt = new Date(previous.updatedAt || previous.createdAt).getTime()
  const incomingAt = new Date(incoming.createdAt).getTime()
  if (!Number.isFinite(previousAt) || !Number.isFinite(incomingAt)) return null
  if (incomingAt - previousAt > Math.max(0, Number(windowMs) || 0)) return null
  if (incomingAt < previousAt) return null
  const merged = cloneWritingBlockHistoryEntry(previous) || { ...previous }
  merged.currentText = incoming.currentText
  merged.toDocumentRevision = incoming.toDocumentRevision
  merged.toUnitRevision = incoming.toUnitRevision
  merged.toNodeRevision = incoming.toNodeRevision
  merged.chapterTitle = incoming.chapterTitle || previous.chapterTitle
  merged.updatedAt = incoming.createdAt
  merged.mergedCount = Math.max(0, Number(previous.mergedCount) || 0) + 1
  return entrySize(merged) <= 60000 ? merged : null
}

export function getWritingBlockHistoryStorageSize(values) {
  try {
    return JSON.stringify(normalizeWritingBlockHistory(values)).length
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export function cloneWritingBlockHistoryEntry(entry) {
  return clone(normalizeWritingBlockHistoryEntry(entry))
}
