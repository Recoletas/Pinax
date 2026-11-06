import {
  addNarrativeAssetDurable,
  listNarrativeAssets,
  normalizeImagePresentation,
  normalizeSourceRefs,
  updateNarrativeAssetDurable
} from './narrativeAssets'
import {
  deleteMediaAsset,
  getMediaAssetDataUrl,
  listMediaAssets,
  saveMediaAsset,
  updateMediaAsset
} from './mediaAssetStore'
import { createNarrativeImageAssetBridge } from '@pinax/core/media/narrativeImageAssetBridge'

export const { migrateNarrativeImageAssets, hydrateNarrativeImageAssets, addNarrativeImageAsset, updateNarrativeImagePresentation, updateMediaImagePresentation, getMediaImagePresentation } = createNarrativeImageAssetBridge({ addNarrativeAssetDurable, listNarrativeAssets, normalizeImagePresentation, normalizeSourceRefs, updateNarrativeAssetDurable, deleteMediaAsset, getMediaAssetDataUrl, listMediaAssets, saveMediaAsset, updateMediaAsset })
