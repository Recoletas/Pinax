import { createWritingSnapshotRepository, normalizeStoredWritingSnapshots } from '@pinax/core/usecases/writingSnapshotRepository'
import { STORAGE_KEYS, getItem, setItem } from '../../composables/useStorage.js'
import { mutationFailure, mutationSuccess, storageWriteFailure } from '../storage/durableMutationResult.js'
export * from '@pinax/core/usecases/writingSnapshotRepository'

export function listAllWritingSnapshots() {
  return normalizeStoredWritingSnapshots(getItem(STORAGE_KEYS.WRITING_SNAPSHOTS))
}
export const { listWritingSnapshots, saveWritingSnapshot, deleteWritingSnapshot, previewWritingSnapshotCleanup, cleanWritingSnapshotPreview, deleteWritingSnapshotsForChapter } = createWritingSnapshotRepository({ getItem, setItem, snapshotsKey: STORAGE_KEYS.WRITING_SNAPSHOTS, mutationFailure, mutationSuccess, storageWriteFailure })
