import { STORAGE_KEYS, getItem, setItem } from '../../composables/useStorage.js'
import {
  MAX_WRITING_SNAPSHOT_STORAGE_CHARS,
  MAX_WRITING_SNAPSHOTS_PER_CHAPTER,
  getWritingSnapshotStorageSize,
  normalizeWritingSnapshot
} from '../../../shared/writingSnapshotContract.js'
import {
  migrateWritingDocumentToV3,
  validateWritingDocument
} from './writingDocumentSchema.js'

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

export function normalizeStoredWritingSnapshot(value, chapterId = null) {
  const snapshot = normalizeWritingSnapshot(value, chapterId)
  if (!snapshot) return null
  const editorDocument = migrateWritingDocumentToV3(snapshot.editorDocument, snapshot.markdown)
  if (!validateWritingDocument(editorDocument).valid) return null
  return { ...snapshot, editorDocument, documentRevision: Number(editorDocument.revision || 0) }
}

export function normalizeStoredWritingSnapshots(values, chapterId = null) {
  const normalized = (Array.isArray(values) ? values : [])
    .map((value) => normalizeStoredWritingSnapshot(value, chapterId))
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

export function cloneWritingSnapshotDocument(snapshot) {
  const normalized = normalizeStoredWritingSnapshot(snapshot)
  return normalized ? clone(normalized.editorDocument) : null
}

function readSnapshots() {
  return normalizeStoredWritingSnapshots(getItem(STORAGE_KEYS.WRITING_SNAPSHOTS))
}

function writeSnapshots(values) {
  const normalized = normalizeStoredWritingSnapshots(values)
  let candidate = [...normalized]
  while (candidate.length > 1 && getWritingSnapshotStorageSize(candidate) > MAX_WRITING_SNAPSHOT_STORAGE_CHARS) {
    candidate.pop()
  }
  if (getWritingSnapshotStorageSize(candidate) > MAX_WRITING_SNAPSHOT_STORAGE_CHARS) {
    return { ok: false, reason: 'storage-budget-exceeded' }
  }
  if (!setItem(STORAGE_KEYS.WRITING_SNAPSHOTS, candidate)) {
    return { ok: false, reason: 'storage-write-failed' }
  }
  return { ok: true, snapshots: candidate }
}

export function listWritingSnapshots(chapterId) {
  return readSnapshots().filter((snapshot) => String(snapshot.chapterId) === String(chapterId || ''))
}

export function saveWritingSnapshot(snapshot) {
  const normalized = normalizeStoredWritingSnapshot(snapshot)
  if (!normalized) return { ok: false, reason: 'invalid-snapshot' }
  const existing = readSnapshots().filter((item) => item.id !== normalized.id)
  const sameChapter = existing.filter((item) => item.chapterId === normalized.chapterId)
  const otherChapters = existing.filter((item) => item.chapterId !== normalized.chapterId)
  const result = writeSnapshots([
    normalized,
    ...sameChapter.slice(0, MAX_WRITING_SNAPSHOTS_PER_CHAPTER - 1),
    ...otherChapters
  ])
  return result.ok ? { ...result, snapshot: normalized } : result
}

export function deleteWritingSnapshot(snapshotId) {
  const id = String(snapshotId || '')
  if (!id) return { ok: false, reason: 'missing-id' }
  return writeSnapshots(readSnapshots().filter((snapshot) => snapshot.id !== id))
}

export function deleteWritingSnapshotsForChapter(chapterId) {
  const id = String(chapterId || '')
  if (!id) return { ok: false, reason: 'missing-chapter-id' }
  return writeSnapshots(readSnapshots().filter((snapshot) => snapshot.chapterId !== id))
}
