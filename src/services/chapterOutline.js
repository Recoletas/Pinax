import { getAssetKindLabel } from './narrativeAssets'

export const CHAPTER_OUTLINE_SCHEMA_VERSION = 1

const DEFAULT_CONTEXT_LIMIT = 1600

export function createChapterOutlineItem(input = {}) {
  const now = Date.now()
  const content = normalizeText(input.content)
  const title = normalizeText(input.title) || buildOutlineTitle(content)

  return {
    id: normalizeText(input.id) || `outline_${now}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: CHAPTER_OUTLINE_SCHEMA_VERSION,
    assetId: normalizeText(input.assetId),
    assetKind: normalizeText(input.assetKind),
    title,
    content,
    source: normalizeOutlineSource(input.source),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now
  }
}

export function createChapterOutlineItemFromAsset(asset = {}) {
  return createChapterOutlineItem({
    assetId: asset.id,
    assetKind: asset.kind,
    title: asset.title,
    content: asset.content,
    source: {
      type: 'narrative-asset',
      assetId: asset.id,
      assetKind: asset.kind,
      projectId: asset.projectId ?? null,
      sourceType: asset.source?.type || '',
      sourceId: asset.source?.id || '',
      messageIds: Array.isArray(asset.source?.messageIds) ? asset.source.messageIds : []
    }
  })
}

export function normalizeChapterOutlineItems(items = []) {
  if (!Array.isArray(items)) return []

  return items
    .map((item) => createChapterOutlineItem(item))
    .filter((item) => item.content)
}

export function addAssetsToChapterOutline(currentItems = [], assets = []) {
  const items = normalizeChapterOutlineItems(currentItems)
  const existingAssetIds = new Set(items.map((item) => item.assetId).filter(Boolean))
  const addedItems = []
  let skippedCount = 0

  for (const asset of Array.isArray(assets) ? assets : []) {
    const content = normalizeText(asset?.content)
    const assetId = normalizeText(asset?.id)
    if (!content) {
      skippedCount += 1
      continue
    }
    if (assetId && existingAssetIds.has(assetId)) {
      skippedCount += 1
      continue
    }

    const item = createChapterOutlineItemFromAsset(asset)
    addedItems.push(item)
    if (item.assetId) existingAssetIds.add(item.assetId)
  }

  return {
    items: [...items, ...addedItems],
    addedItems,
    skippedCount
  }
}

export function removeChapterOutlineItem(items = [], itemId = '') {
  const targetId = normalizeText(itemId)
  return normalizeChapterOutlineItems(items).filter((item) => item.id !== targetId)
}

export function buildChapterOutlineContext(items = [], limit = DEFAULT_CONTEXT_LIMIT) {
  const normalized = normalizeChapterOutlineItems(items)
  if (!normalized.length) return ''

  const body = normalized
    .map((item, index) => {
      const kindLabel = item.assetKind ? getAssetKindLabel(item.assetKind) : '素材'
      return `${index + 1}. ${item.title}（${kindLabel}）\n${item.content}`
    })
    .join('\n\n')

  return clipText(`【章节纲要】\n${body}`, limit)
}

function normalizeOutlineSource(source = {}) {
  return {
    type: normalizeText(source.type),
    assetId: normalizeText(source.assetId),
    assetKind: normalizeText(source.assetKind),
    projectId: source.projectId ?? null,
    sourceType: normalizeText(source.sourceType),
    sourceId: normalizeText(source.sourceId),
    messageIds: Array.isArray(source.messageIds) ? source.messageIds : []
  }
}

function buildOutlineTitle(content) {
  const firstLine = normalizeText(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  return firstLine ? firstLine.slice(0, 24) : '章节纲要'
}

function clipText(text, limit) {
  const normalized = normalizeText(text).replace(/\n{3,}/g, '\n\n')
  if (!normalized || normalized.length <= limit) return normalized

  const clipped = normalized.slice(0, limit)
  const cutAt = Math.max(
    clipped.lastIndexOf('\n\n'),
    clipped.lastIndexOf('。'),
    clipped.lastIndexOf('！'),
    clipped.lastIndexOf('？')
  )

  return cutAt > Math.floor(limit * 0.55)
    ? clipped.slice(0, cutAt + 1).trim()
    : clipped.trim()
}

function normalizeText(value) {
  return String(value || '').trim()
}
