import { STORAGE_KEYS, getItem, setItem } from '../../composables/useStorage.js'
import { normalizeStoredWritingSnapshot, normalizeStoredWritingSnapshots } from './writingSnapshots.js'
import { mutationFailure, mutationSuccess, storageWriteFailure } from '../storage/durableMutationResult.js'

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
  if (!normalized || normalized.reason !== 'crash-recovery') return mutationFailure('invalid-recovery-draft')
  const drafts = readDrafts().filter((draft) => String(draft.chapterId) !== String(normalized.chapterId))
  if (!setItem(STORAGE_KEYS.WRITING_RECOVERY_DRAFTS, [normalized, ...drafts])) {
    return storageWriteFailure({ resource: 'writing-recovery-drafts' })
  }
  return mutationSuccess({ snapshot: normalized })
}

export function clearWritingRecoveryDraft(chapterId) {
  const id = String(chapterId || '')
  if (!id) return mutationFailure('missing-chapter-id')
  const drafts = readDrafts().filter((draft) => String(draft.chapterId) !== id)
  if (!setItem(STORAGE_KEYS.WRITING_RECOVERY_DRAFTS, drafts)) {
    return storageWriteFailure({ resource: 'writing-recovery-drafts' })
  }
  return mutationSuccess()
}
