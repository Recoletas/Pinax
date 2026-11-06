import { writeModelPreference } from '../modelConfigEvents.js'
import { STORAGE_KEYS } from '../../composables/useStorage'
import { MINIMAX_SERVER_KEY_SENTINEL } from '../../../shared/textModelKeys'

import { createVideoProviderConfigRepository } from '@pinax/core/media/videoProviderConfigStore'

export const { MINIMAX_VIDEO_MODELS, VIDEO_PROVIDER_TYPES, BUILTIN_VIDEO_CONFIG_ID, createBuiltinMinimaxVideoConfig, createVideoProviderConfigDraft, listVideoProviderConfigs, saveVideoProviderConfig, deleteVideoProviderConfig, resolveSelectedVideoProviderConfig, getSelectedVideoProviderConfigId, saveSelectedVideoProviderConfigId, normalizeVideoProviderConfig, toVideoProviderConfig } = createVideoProviderConfigRepository({ writeModelPreference, storageKeys: STORAGE_KEYS, MINIMAX_SERVER_KEY_SENTINEL, getStorage: () => globalThis.localStorage })
