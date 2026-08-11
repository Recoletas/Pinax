import { STORAGE_KEYS, getItem, setItem } from '../../composables/useStorage.js'
import {
  MAX_WRITING_SNAPSHOT_STORAGE_CHARS,
  MAX_WRITING_SNAPSHOTS_PER_CHAPTER,
  getWritingSnapshotStorageSize,
  normalizeWritingSnapshot,
  normalizeWritingSnapshots
} from '../../../shared/writingSnapshotContract.js'

function readSnapshots() {
  return normalizeWritingSnapshots(getItem(STORAGE_KEYS.WRITING_SNAPSHOTS))
}

function writeSnapshots(values) {
  const normalized = normalizeWritingSnapshots(values)
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
  const normalized = normalizeWritingSnapshot(snapshot)
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
