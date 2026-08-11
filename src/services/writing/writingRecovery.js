import { STORAGE_KEYS, getItem, setItem } from '../../composables/useStorage.js'
import { normalizeWritingSnapshots } from '../../../shared/writingSnapshotContract.js'

function readDrafts() {
  return normalizeWritingSnapshots(getItem(STORAGE_KEYS.WRITING_RECOVERY_DRAFTS))
    .filter((snapshot) => snapshot.reason === 'crash-recovery')
}

export function listWritingRecoveryDrafts(chapterId = null) {
  const drafts = readDrafts()
  return chapterId == null
    ? drafts
    : drafts.filter((draft) => String(draft.chapterId) === String(chapterId))
}

export function saveWritingRecoveryDraft(snapshot) {
  if (!snapshot || snapshot.reason !== 'crash-recovery') return { ok: false, reason: 'invalid-recovery-draft' }
  const drafts = readDrafts().filter((draft) => draft.chapterId !== snapshot.chapterId)
  if (!setItem(STORAGE_KEYS.WRITING_RECOVERY_DRAFTS, [snapshot, ...drafts])) {
    return { ok: false, reason: 'storage-write-failed' }
  }
  return { ok: true, snapshot }
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
