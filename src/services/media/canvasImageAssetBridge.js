import { STORAGE_KEYS } from '../../composables/useStorage'
import { normalizeSourceRefs } from './narrativeAssets'
import {
  getMediaAssetDataUrl,
  listMediaAssets,
  saveMediaAsset,
  updateMediaAsset
} from './mediaAssetStore'
import { createCanvasImageAssetBridge } from '@pinax/core/media/canvasImageAssetBridge'

export const { migrateCanvasAttachedImages, archiveCanvasAttachedImage, hydrateCanvasAttachedImages, serializeCanvasCards, saveCanvasCards } = createCanvasImageAssetBridge({ storageKeys: STORAGE_KEYS, normalizeSourceRefs, getMediaAssetDataUrl, listMediaAssets, saveMediaAsset, updateMediaAsset, getStorage: () => globalThis.localStorage })
