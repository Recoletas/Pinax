export const WRITING_BLOCK_HISTORY_SCHEMA_VERSION = 1
export const MAX_WRITING_BLOCK_HISTORY_PER_CHAPTER = 120
export const MAX_WRITING_BLOCK_HISTORY_STORAGE_CHARS = 2000000

const HISTORY_SOURCES = new Set(['manual-save', 'rewrite', 'block-restore', 'unknown'])

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
  return (node?.content || []).map((item) => item?.text || '').join('')
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
  blockId,
  blockKind = 'prose',
  previousText = '',
  currentText = '',
  fromDocumentRevision = 0,
  toDocumentRevision = 0,
  fromBlockRevision = 0,
  toBlockRevision = 0,
  source = 'unknown',
  createdAt = null
} = {}) {
  if (!String(chapterId || '').trim() || !String(blockId || '').trim()) return null
  const previous = normalizeText(previousText)
  const current = normalizeText(currentText)
  if (previous === current) return null

  const entry = {
    schemaVersion: WRITING_BLOCK_HISTORY_SCHEMA_VERSION,
    id: String(id || `writing-block-history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    chapterId: String(chapterId),
    chapterTitle: String(chapterTitle || '').trim().slice(0, 160),
    blockId: String(blockId),
    blockKind: String(blockKind || 'prose'),
    previousText: previous,
    currentText: current,
    fromDocumentRevision: Number(fromDocumentRevision || 0),
    toDocumentRevision: Number(toDocumentRevision || 0),
    fromBlockRevision: Number(fromBlockRevision || 0),
    toBlockRevision: Number(toBlockRevision || 0),
    source: normalizeSource(source),
    createdAt: normalizeDate(createdAt)
  }

  return entrySize(entry) <= 60000 ? entry : null
}

export function buildWritingBlockHistoryEntries({
  chapterId,
  chapterTitle = '',
  previousDocument = null,
  nextDocument = null,
  source = 'manual-save',
  createdAt = null
} = {}) {
  const previousNodes = Array.isArray(previousDocument?.content) ? previousDocument.content : []
  const nextNodes = Array.isArray(nextDocument?.content) ? nextDocument.content : []
  const previousById = new Map(
    previousNodes
      .map((node) => [String(node?.attrs?.blockId || ''), node])
      .filter(([blockId]) => blockId)
  )

  return nextNodes.map((node) => {
    const blockId = String(node?.attrs?.blockId || '')
    const previous = previousById.get(blockId)
    if (!previous) return null
    return createWritingBlockHistoryEntry({
      chapterId,
      chapterTitle,
      blockId,
      blockKind: node?.attrs?.kind || previous?.attrs?.kind || 'prose',
      previousText: getNodeText(previous),
      currentText: getNodeText(node),
      fromDocumentRevision: previousDocument?.revision,
      toDocumentRevision: nextDocument?.revision,
      fromBlockRevision: previous?.attrs?.revision,
      toBlockRevision: node?.attrs?.revision,
      source,
      createdAt
    })
  }).filter(Boolean)
}

export function normalizeWritingBlockHistoryEntry(value, chapterId = null) {
  if (!value || value.schemaVersion !== WRITING_BLOCK_HISTORY_SCHEMA_VERSION) return null
  if (chapterId != null && String(value.chapterId) !== String(chapterId)) return null
  return createWritingBlockHistoryEntry({
    id: value.id,
    chapterId: value.chapterId,
    chapterTitle: value.chapterTitle,
    blockId: value.blockId,
    blockKind: value.blockKind,
    previousText: value.previousText,
    currentText: value.currentText,
    fromDocumentRevision: value.fromDocumentRevision,
    toDocumentRevision: value.toDocumentRevision,
    fromBlockRevision: value.fromBlockRevision,
    toBlockRevision: value.toBlockRevision,
    source: value.source,
    createdAt: value.createdAt
  })
}

export function normalizeWritingBlockHistory(values, chapterId = null) {
  const list = Array.isArray(values) ? values : []
  const normalized = list
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
