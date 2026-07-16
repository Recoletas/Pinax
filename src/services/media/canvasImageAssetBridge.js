import { STORAGE_KEYS } from '../../composables/useStorage'
import { normalizeSourceRefs } from '../narrativeAssets'
import {
  getMediaAssetDataUrl,
  listMediaAssets,
  saveMediaAsset,
  updateMediaAsset
} from './mediaAssetStore'

export async function migrateCanvasAttachedImages(options = {}) {
  const storage = resolveStorage(options.storage)
  const cards = readCanvasCards(storage)
  const migrated = []

  for (const card of cards) {
    const images = []
    for (const image of normalizeImages(card.attachedImages)) {
      if (!image?.data) {
        images.push(image)
        continue
      }
      try {
        images.push(await archiveCanvasAttachedImage(image, {
          cardId: card.id,
          assetId: card.assetId,
          projectId: card.projectId
        }, options))
      } catch {
        images.push(image)
      }
    }
    migrated.push({ ...card, attachedImages: images })
  }

  saveCanvasCards(migrated, { storage })
  return hydrateCanvasAttachedImages(migrated, options)
}

export async function archiveCanvasAttachedImage(image = {}, context = {}, options = {}) {
  const storage = resolveStorage(options.storage)
  let mediaAsset = image.mediaAssetId
    ? listMediaAssets({}, { storage }).find((item) => item.id === image.mediaAssetId) || null
    : null

  if (!mediaAsset) {
    if (!image.data) throw new Error('画布附件缺少可归档图片')
    mediaAsset = await saveMediaAsset({
      id: image.mediaAssetId,
      projectId: context.projectId,
      kind: 'image',
      purpose: 'storyboard-reference',
      sourceRefs: buildCanvasSourceRefs(context),
      provider: image.modelType,
      model: image.modelId || image.modelName,
      promptSnapshot: image.prompt || context.cardTitle || '',
      generationParams: {
        negativePrompt: image.negativePrompt || '',
        modelName: image.modelName || '',
        modelId: image.modelId || ''
      },
      width: image.width,
      height: image.height,
      status: 'draft',
      createdAt: image.createdAt
    }, {
      binary: image.data,
      storage,
      binaryStore: options.binaryStore,
      indexedDBImpl: options.indexedDBImpl
    })
  }

  const canvasRefs = buildCanvasSourceRefs(context)
  mediaAsset = updateMediaAsset(mediaAsset.id, {
    sourceRefs: normalizeSourceRefs([
      ...canvasRefs,
      ...(mediaAsset.sourceRefs || [])
    ], { projectId: context.projectId })
  }, { storage }) || mediaAsset

  return toCanvasImageMetadata(image, mediaAsset)
}

export async function hydrateCanvasAttachedImages(cards = [], options = {}) {
  return Promise.all((Array.isArray(cards) ? cards : []).map(async (card) => ({
    ...card,
    attachedImages: await Promise.all(normalizeImages(card.attachedImages).map(async (image) => {
      if (!image?.mediaAssetId || image.data) return image
      try {
        const data = await getMediaAssetDataUrl(image.mediaAssetId, options)
        return data ? { ...image, data } : image
      } catch {
        return image
      }
    }))
  })))
}

export function serializeCanvasCards(cards = []) {
  return (Array.isArray(cards) ? cards : []).map((card) => ({
    ...card,
    attachedImages: normalizeImages(card.attachedImages).map((image) => {
      if (!image?.mediaAssetId) return image
      const metadata = { ...image }
      delete metadata.data
      return metadata
    })
  }))
}

export function saveCanvasCards(cards = [], options = {}) {
  const storage = resolveStorage(options.storage)
  const serialized = serializeCanvasCards(cards)
  storage.setItem(STORAGE_KEYS.PROSE_CARDS_V1, JSON.stringify(serialized))
  return serialized
}

function readCanvasCards(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEYS.PROSE_CARDS_V1) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function buildCanvasSourceRefs(context) {
  return normalizeSourceRefs([
    context.cardId ? {
      refType: 'canvas-card',
      refId: context.cardId,
      projectId: context.projectId,
      excerpt: context.cardTitle
    } : null,
    context.assetId ? {
      refType: 'narrative-asset',
      refId: context.assetId,
      projectId: context.projectId
    } : null
  ].filter(Boolean), { projectId: context.projectId })
}

function toCanvasImageMetadata(image, mediaAsset) {
  const metadata = { ...image }
  delete metadata.data
  return {
    ...metadata,
    id: image.id || mediaAsset.id,
    mediaAssetId: mediaAsset.id,
    storageRef: mediaAsset.storageRef,
    prompt: image.prompt || mediaAsset.promptSnapshot,
    modelName: image.modelName || mediaAsset.generationParams?.modelName || mediaAsset.model,
    modelId: image.modelId || mediaAsset.generationParams?.modelId || mediaAsset.model,
    modelType: image.modelType || mediaAsset.provider,
    width: image.width || mediaAsset.width,
    height: image.height || mediaAsset.height
  }
}

function normalizeImages(images) {
  return Array.isArray(images) ? images.filter(Boolean) : []
}

function resolveStorage(storage) {
  const resolved = storage || globalThis.localStorage
  if (!resolved?.getItem || !resolved?.setItem) throw new Error('当前环境不支持画布媒体存储')
  return resolved
}
