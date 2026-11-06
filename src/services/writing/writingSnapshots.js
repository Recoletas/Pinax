import { createWritingSnapshotRepository } from '@pinax/core/usecases/writingSnapshotRepository'
import { STORAGE_KEYS, getItem, setItem } from '../../composables/useStorage.js'
import { mutationFailure, mutationSuccess, storageWriteFailure } from '../storage/durableMutationResult.js'
export * from '@pinax/core/usecases/writingSnapshotRepository'
export const { listWritingSnapshots, saveWritingSnapshot, deleteWritingSnapshot, previewWritingSnapshotCleanup, cleanWritingSnapshotPreview, deleteWritingSnapshotsForChapter } = createWritingSnapshotRepository({ getItem, setItem, snapshotsKey: STORAGE_KEYS.WRITING_SNAPSHOTS, mutationFailure, mutationSuccess, storageWriteFailure })
