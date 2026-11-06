import { createWritingRecoveryRepository } from '@pinax/core/usecases/writingRecoveryRepository'
import { STORAGE_KEYS, getItem, setItem } from '../../composables/useStorage.js'
import { mutationFailure, mutationSuccess, storageWriteFailure } from '../storage/durableMutationResult.js'
export const { listWritingRecoveryDrafts, saveWritingRecoveryDraft, clearWritingRecoveryDraft } = createWritingRecoveryRepository({ getItem, setItem, recoveryKey: STORAGE_KEYS.WRITING_RECOVERY_DRAFTS, mutationFailure, mutationSuccess, storageWriteFailure })
