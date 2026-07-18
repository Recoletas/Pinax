import {
  addNarrativeAsset,
  listNarrativeAssets,
  normalizeImagePresentation,
  normalizeSourceRefs,
  updateNarrativeAsset
} from '../narrativeAssets'
import {
  deleteMediaAsset,
  getMediaAssetDataUrl,
  listMediaAssets,
  saveMediaAsset,
  updateMediaAsset
} from './mediaAssetStore'

export async function migrateNarrativeImageAssets(options = {}) {
  const assets = listNarrativeAssets({ status: null })

  for (const asset of assets) {
    if (asset.kind !== 'reference-image' || !asset.image?.data) continue
    try {
      const mediaAsset = await saveImageBinary(asset.id, asset, options)
      updateNarrativeAsset(asset.id, {
        image: toNarrativeImageMetadata(asset.image, mediaAsset)
      })
    } catch {
      // Keep the legacy inline data when archival is unavailable.
    }
  }

  return hydrateNarrativeImageAssets(listNarrativeAssets({ status: null }), options)
}

export async function hydrateNarrativeImageAssets(assets = [], options = {}) {
  return Promise.all((Array.isArray(assets) ? assets : []).map(async (asset) => {
    if (!asset.image?.mediaAssetId || asset.image.data) return asset
    try {
      const data = await getMediaAssetDataUrl(asset.image.mediaAssetId, options)
      if (!data) return asset
      return {
        ...asset,
        image: { ...asset.image, data }
      }
    } catch {
      return asset
    }
  }))
}

export async function addNarrativeImageAsset(input = {}, options = {}) {
  const image = input.image || {}
  const narrativeAssetId = input.id || createNarrativeAssetId()
  let mediaAsset = image.mediaAssetId
    ? listMediaAssets({}, { storage: options.storage }).find((item) => item.id === image.mediaAssetId) || null
    : null
  let createdMedia = false

  if (!mediaAsset) {
    if (!image.data) throw new Error('参考图缺少可归档图片')
    mediaAsset = await saveImageBinary(narrativeAssetId, { ...input, id: narrativeAssetId }, options)
    createdMedia = true
  }

  try {
    const asset = addNarrativeAsset({
      ...input,
      id: narrativeAssetId,
      kind: 'reference-image',
      image: toNarrativeImageMetadata(image, mediaAsset)
    })
    const selfRef = {
      refType: 'narrative-asset',
      refId: asset.id,
      projectId: asset.projectId,
      excerpt: asset.content
    }
    updateMediaAsset(mediaAsset.id, {
      sourceRefs: normalizeSourceRefs([
        selfRef,
        ...(mediaAsset.sourceRefs || []),
        ...(asset.sourceRefs || [])
      ], { projectId: asset.projectId })
    }, { storage: options.storage })
    return asset
  } catch (error) {
    if (createdMedia) {
      await deleteMediaAsset(mediaAsset.id, options).catch(() => {})
    }
    throw error
  }
}

export function updateNarrativeImagePresentation(assetId, presentation, options = {}) {
  const asset = listNarrativeAssets({ status: null }).find((item) => item.id === assetId)
  if (!asset?.image) return null
  const normalized = normalizeImagePresentation(presentation)
  const updated = updateNarrativeAsset(asset.id, {
    image: { ...asset.image, presentation: normalized }
  })
  if (asset.image.mediaAssetId) {
    updateMediaImagePresentation(asset.image.mediaAssetId, normalized, options)
  }
  return updated
}

export function updateMediaImagePresentation(mediaAssetId, presentation, options = {}) {
  if (!mediaAssetId) return null
  const mediaAsset = listMediaAssets({}, { storage: options.storage })
    .find((item) => item.id === mediaAssetId)
  if (!mediaAsset) return null
  return updateMediaAsset(mediaAsset.id, {
    generationParams: {
      ...(mediaAsset.generationParams || {}),
      presentation: normalizeImagePresentation(presentation)
    }
  }, { storage: options.storage })
}

export function getMediaImagePresentation(mediaAssetId, options = {}) {
  if (!mediaAssetId) return null
  const mediaAsset = listMediaAssets({}, { storage: options.storage })
    .find((item) => item.id === mediaAssetId)
  const presentation = mediaAsset?.generationParams?.presentation
  return presentation && typeof presentation === 'object'
    ? normalizeImagePresentation(presentation)
    : null
}

async function saveImageBinary(narrativeAssetId, asset, options) {
  const image = asset.image || {}
  const sourceRefs = normalizeSourceRefs([
    {
      refType: 'narrative-asset',
      refId: narrativeAssetId,
      projectId: asset.projectId,
      excerpt: asset.content
    },
    ...(asset.sourceRefs || [])
  ], { source: asset.source, projectId: asset.projectId })

  return saveMediaAsset({
    id: image.mediaAssetId,
    projectId: asset.projectId,
    kind: 'image',
    purpose: image.purpose || options.purpose || 'storyboard-reference',
    sourceRefs,
    provider: image.modelType,
    model: image.modelId || image.modelName,
    promptSnapshot: image.prompt || asset.content || asset.title,
    generationParams: {
      negativePrompt: image.negativePrompt || '',
      modelName: image.modelName || '',
      modelId: image.modelId || '',
      presentation: normalizeImagePresentation(image.presentation)
    },
    width: image.width,
    height: image.height,
    status: toMediaStatus(asset.status),
    createdAt: asset.createdAt
  }, {
    binary: image.data,
    storage: options.storage,
    binaryStore: options.binaryStore,
    indexedDBImpl: options.indexedDBImpl
  })
}

function toNarrativeImageMetadata(image, mediaAsset) {
  return {
    id: image.id || mediaAsset.id,
    mediaAssetId: mediaAsset.id,
    storageRef: mediaAsset.storageRef,
    purpose: mediaAsset.purpose,
    prompt: image.prompt || mediaAsset.promptSnapshot,
    negativePrompt: image.negativePrompt || mediaAsset.generationParams?.negativePrompt || '',
    modelName: image.modelName || mediaAsset.generationParams?.modelName || mediaAsset.model,
    modelId: image.modelId || mediaAsset.generationParams?.modelId || mediaAsset.model,
    modelType: image.modelType || mediaAsset.provider,
    width: image.width || mediaAsset.width,
    height: image.height || mediaAsset.height,
    presentation: normalizeImagePresentation(
      image.presentation || mediaAsset.generationParams?.presentation
    ),
    data: ''
  }
}

function toMediaStatus(status) {
  if (status === 'accepted') return 'accepted'
  if (status === 'rejected') return 'rejected'
  return 'draft'
}

function createNarrativeAssetId() {
  return `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
