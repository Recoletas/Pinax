import { readStoredText } from '../storage/writingStorageCodec.js'
import { STORAGE_KEYS } from '../../composables/useStorage'
import { normalizeImagePresentation, normalizeSourceRefs } from './narrativeAssets'
import { createMediaAssetModule } from '@pinax/core/media/mediaAssetStore'
import { createIndexedDbBinaryStore, normalizeBinary, blobToDataUrl, readImageBinaryDimensions } from './browserMediaBinaryStore'

// Core queues library operations by Storage identity. Keep one logical view
// per backing store for both default and explicitly supplied Storage ports.
const views = new WeakMap()
function mediaStorage(storage = globalThis.localStorage) {
  if (!storage) return storage
  if (!views.has(storage)) views.set(storage, {
    getItem: key => readStoredText(storage, key),
    setItem: (key, value) => storage.setItem(key, value)
  })
  return views.get(storage)
}

export { createIndexedDbBinaryStore } from './browserMediaBinaryStore'
const media = createMediaAssetModule({
  storageKeys: STORAGE_KEYS, normalizeImagePresentation, normalizeSourceRefs,
  getStorage: () => mediaStorage(),
  createBinaryStore: createIndexedDbBinaryStore,
  normalizeBinary, blobToDataUrl, readImageBinaryDimensions
})
export const {
  MEDIA_ASSET_SCHEMA_VERSION, MEDIA_DATABASE_NAME, MEDIA_BINARY_STORE_NAME,
  createMediaAsset, saveExternalMediaAsset, listMediaAssets, saveMediaAsset, getMediaAsset, getMediaAssetDataUrl,
  updateMediaAsset, saveGeneratedImageLibraryRefs, listMediaBinaryIds, getMediaBinaryById, putMediaBinaryById,
  deleteMediaBinaryById, markMediaAssetAccepted
} = media

function mediaOptions(options) {
  return options?.storage ? { ...options, storage: mediaStorage(options.storage) } : options
}
export function deleteMediaAsset(id, options) {
  return media.deleteMediaAsset(id, mediaOptions(options))
}
export function addGeneratedImageToLibrary(key, entry, options) {
  return media.addGeneratedImageToLibrary(key, entry, mediaOptions(options))
}
export function removeGeneratedImageFromLibrary(key, entry, options) {
  return media.removeGeneratedImageFromLibrary(key, entry, mediaOptions(options))
}
export function loadGeneratedImageLibrary(key, options) {
  return media.loadGeneratedImageLibrary(key, mediaOptions(options))
}
