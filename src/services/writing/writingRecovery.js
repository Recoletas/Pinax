import { STORAGE_KEYS, getItem, setItem } from '../../composables/useStorage.js'
import { normalizeStoredWritingSnapshot, normalizeStoredWritingSnapshots } from './writingSnapshots.js'

function readDrafts() {
  return normalizeStoredWritingSnapshots(getItem(STORAGE_KEYS.WRITING_RECOVERY_DRAFTS))
    .filter((snapshot) => snapshot.reason === 'crash-recovery')
}

export function listWritingRecoveryDrafts(chapterId = null) {
  const drafts = readDrafts()
  return chapterId == null
    ? drafts
    : drafts.filter((draft) => String(draft.chapterId) === String(chapterId))
}

export function saveWritingRecoveryDraft(snapshot) {
  const normalized = normalizeStoredWritingSnapshot(snapshot)
  if (!normalized || normalized.reason !== 'crash-recovery') return { ok: false, reason: 'invalid-recovery-draft' }
  const drafts = readDrafts().filter((draft) => draft.chapterId !== snapshot.chapterId)
  if (!setItem(STORAGE_KEYS.WRITING_RECOVERY_DRAFTS, [normalized, ...drafts])) {
    return { ok: false, reason: 'storage-write-failed' }
  }
  return { ok: true, snapshot: normalized }
}

export function clearWritingRecoveryDraft(chapterId) {
  const id = String(chapterId || '')
  if (!id) return { ok: false, reason: 'missing-chapter-id' }
  const drafts = readDrafts().filter((draft) => String(draft.chapterId) !== id)
  if (!setItem(STORAGE_KEYS.WRITING_RECOVERY_DRAFTS, drafts)) {
    return { ok: false, reason: 'storage-write-failed' }
  }
  return { ok: true }
}
