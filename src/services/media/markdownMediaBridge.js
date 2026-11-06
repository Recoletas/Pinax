import { normalizeSourceRefs } from './narrativeAssets'
import { getMediaAssetDataUrl, saveMediaAsset } from './mediaAssetStore'
import { createMarkdownMediaBridge } from '@pinax/core/media/markdownMediaBridge'

export const { migrateMarkdownMediaContent, hydrateMarkdownMediaContent, createMarkdownMediaReference } = createMarkdownMediaBridge({ normalizeSourceRefs, getMediaAssetDataUrl, saveMediaAsset })
