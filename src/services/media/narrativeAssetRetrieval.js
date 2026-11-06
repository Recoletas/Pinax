import {
  ACTIVE_ASSET_STATUSES,
  listNarrativeAssets,
  normalizeContentRef,
  normalizeSourceRefs
} from './narrativeAssets'
import { createNarrativeAssetRetrieval } from '@pinax/core/media/narrativeAssetRetrieval'

export const { findAssetsByContentRefs } = createNarrativeAssetRetrieval({ ACTIVE_ASSET_STATUSES, listNarrativeAssets, normalizeContentRef, normalizeSourceRefs })
