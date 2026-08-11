export const WRITING_SNAPSHOT_SCHEMA_VERSION = 1
export const MAX_WRITING_SNAPSHOTS_PER_CHAPTER = 20
export const MAX_WRITING_SNAPSHOT_CHARS = 600000
export const MAX_WRITING_SNAPSHOT_STORAGE_CHARS = 3500000

const SNAPSHOT_REASONS = new Set([
  'manual',
  'before-rewrite',
  'before-restore',
  'crash-recovery'
])

function clone(value) {
  if (value == null) return value
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

function hashText(value) {
  let hash = 2166136261
  const source = String(value ?? '')
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function countWords(value) {
  const source = String(value ?? '').trim()
  if (!source) return 0
  const chinese = (source.match(/[\u3400-\u9fff]/g) || []).length
  const latin = (source.match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g) || []).length
  return chinese + latin
}

function normalizeDate(value, fallback = new Date().toISOString()) {
  const date = new Date(value || fallback)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function normalizeLabel(value, fallback = '未命名快照') {
  const label = String(value || '').trim().replace(/\s+/g, ' ')
  return (label || fallback).slice(0, 80)
}

function isStructuredDocument(value) {
  return Boolean(
    value &&
    Array.isArray(value.content) &&
    Number.isFinite(Number(value.revision)) &&
    value.content.every((node) => node && typeof node === 'object')
  )
}

function snapshotCharCount(snapshot) {
  try {
    return JSON.stringify(snapshot).length
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export function createWritingSnapshot({
  id = null,
  chapterId,
  chapterTitle = '',
  label = '',
  reason = 'manual',
  document = null,
  markdown = '',
  annotations = [],
  createdAt = null
} = {}) {
  if (!String(chapterId || '').trim()) return null
  if (!isStructuredDocument(document)) return null

  const snapshot = {
    schemaVersion: WRITING_SNAPSHOT_SCHEMA_VERSION,
    id: String(id || `writing-snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    chapterId: String(chapterId),
    chapterTitle: String(chapterTitle || '').trim().slice(0, 160),
    label: normalizeLabel(label),
    reason: SNAPSHOT_REASONS.has(reason) ? reason : 'manual',
    createdAt: normalizeDate(createdAt),
    documentRevision: Number(document.revision || 0),
    contentHash: hashText(markdown),
    wordCount: countWords(markdown),
    markdown: String(markdown ?? ''),
    editorDocument: clone(document),
    annotations: Array.isArray(annotations) ? clone(annotations) || [] : []
  }

  return snapshotCharCount(snapshot) <= MAX_WRITING_SNAPSHOT_CHARS ? snapshot : null
}

export function normalizeWritingSnapshot(value, chapterId = null) {
  if (!value || value.schemaVersion !== WRITING_SNAPSHOT_SCHEMA_VERSION) return null
  if (!String(value.id || '').trim() || !String(value.chapterId || '').trim()) return null
  if (chapterId != null && String(value.chapterId) !== String(chapterId)) return null
  if (!isStructuredDocument(value.editorDocument)) return null

  const snapshot = createWritingSnapshot({
    id: value.id,
    chapterId: value.chapterId,
    chapterTitle: value.chapterTitle,
    label: value.label,
    reason: value.reason,
    document: value.editorDocument,
    markdown: value.markdown,
    annotations: value.annotations,
    createdAt: value.createdAt
  })
  if (!snapshot) return null
  return snapshot
}

export function normalizeWritingSnapshots(values, chapterId = null) {
  const list = Array.isArray(values) ? values : []
  const normalized = list
    .map((item) => normalizeWritingSnapshot(item, chapterId))
    .filter(Boolean)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

  if (chapterId != null) return normalized.slice(0, MAX_WRITING_SNAPSHOTS_PER_CHAPTER)

  const counts = new Map()
  return normalized.filter((snapshot) => {
    const count = counts.get(snapshot.chapterId) || 0
    if (count >= MAX_WRITING_SNAPSHOTS_PER_CHAPTER) return false
    counts.set(snapshot.chapterId, count + 1)
    return true
  })
}

export function getWritingSnapshotRestoreGuard(snapshot, { chapterId, documentRevision, markdown } = {}) {
  if (!snapshot || String(snapshot.chapterId) !== String(chapterId || '')) return 'chapter-mismatch'
  if (String(snapshot.contentHash) === hashText(markdown)) return null
  if (Number(snapshot.documentRevision) === Number(documentRevision)) return 'content-changed-without-revision'
  return 'current-chapter-changed'
}

export function cloneWritingSnapshotDocument(snapshot) {
  const document = clone(snapshot?.editorDocument)
  return isStructuredDocument(document) ? document : null
}

export function getWritingSnapshotReasonLabel(reason) {
  return {
    manual: '手动保存',
    'before-rewrite': '改写前',
    'before-restore': '恢复前',
    'crash-recovery': '崩溃恢复'
  }[reason] || '版本快照'
}

export function getWritingSnapshotStorageSize(values) {
  return snapshotCharCount(normalizeWritingSnapshots(values))
}
