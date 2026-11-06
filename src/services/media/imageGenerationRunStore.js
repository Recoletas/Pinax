import { getItem, setItem, STORAGE_KEYS } from '../../composables/useStorage.js'
import { createImageGenerationRunRepository } from '@pinax/core/media/imageGenerationRunStore'

export const { saveImageGenerationRun, loadImageGenerationRun, updateImageGenerationRunItem, removeImageGenerationRun } = createImageGenerationRunRepository({ getItem, setItem, storageKeys: STORAGE_KEYS })
