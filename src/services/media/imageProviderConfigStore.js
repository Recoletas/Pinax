import { writeModelPreference } from '../modelConfigEvents.js'
import { STORAGE_KEYS } from '../../composables/useStorage'
import { createImageModelConfigDraft, IMAGE_MODEL_TYPES } from './imageProviderService'

import { createImageProviderConfigRepository } from '@pinax/core/media/imageProviderConfigStore'

export const { BUILTIN_IMAGE_CONFIG_ID, createBuiltinMinimaxImageConfig, listImageProviderConfigs, saveImageProviderConfig, deleteImageProviderConfig, ensureDefaultImageConfig, getSelectedImageProviderConfigId, saveSelectedImageProviderConfigId, resolveSelectedImageProviderConfig, normalizeImageProviderConfig } = createImageProviderConfigRepository({ writeModelPreference, storageKeys: STORAGE_KEYS, createImageModelConfigDraft, IMAGE_MODEL_TYPES, getStorage: () => globalThis.localStorage })
