import { STORAGE_KEYS } from '../../composables/useStorage'
import { normalizeImagePresentation, normalizeSourceRefs } from './narrativeAssets'
import { createMediaAssetModule } from '@pinax/core/media/mediaAssetStore'
import { createIndexedDbBinaryStore, normalizeBinary, blobToDataUrl, readImageBinaryDimensions } from './browserMediaBinaryStore'

export { createIndexedDbBinaryStore } from './browserMediaBinaryStore'
export const { MEDIA_ASSET_SCHEMA_VERSION, MEDIA_DATABASE_NAME, MEDIA_BINARY_STORE_NAME, createMediaAsset, saveExternalMediaAsset, listMediaAssets, saveMediaAsset, getMediaAsset, getMediaAssetDataUrl, updateMediaAsset, deleteMediaAsset, addGeneratedImageToLibrary, removeGeneratedImageFromLibrary, loadGeneratedImageLibrary, saveGeneratedImageLibraryRefs, listMediaBinaryIds, getMediaBinaryById, putMediaBinaryById, deleteMediaBinaryById, markMediaAssetAccepted } = createMediaAssetModule({
  storageKeys: STORAGE_KEYS, normalizeImagePresentation, normalizeSourceRefs,
  getStorage: () => globalThis.localStorage,
  createBinaryStore: createIndexedDbBinaryStore,
  normalizeBinary, blobToDataUrl, readImageBinaryDimensions
})
