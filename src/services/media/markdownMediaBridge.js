import { normalizeSourceRefs } from '../narrativeAssets'
import { getMediaAssetDataUrl, saveMediaAsset } from './mediaAssetStore'

const INLINE_IMAGE_PATTERN = /!\[([^\]]*)\]\((data:image\/[a-zA-Z0-9.+-]+(?:;[^,\s)]+)*,[^)]+)\)/g
const MEDIA_REFERENCE_PATTERN = /pinax-media:\/\/([a-zA-Z0-9_-]+)/g

export async function migrateMarkdownMediaContent(content = '', context = {}, options = {}) {
  const source = String(content || '')
  const matches = [...source.matchAll(INLINE_IMAGE_PATTERN)]
  if (!matches.length) return { content: source, mediaAssetIds: [], changed: false }

  const replacements = []
  const mediaAssetIds = []
  for (const match of matches) {
    try {
      const mediaAsset = await saveMediaAsset({
        projectId: context.projectId,
        kind: 'image',
        purpose: context.purpose || 'illustration',
        sourceRefs: normalizeSourceRefs(context.sourceRefs, { projectId: context.projectId }),
        provider: context.provider,
        model: context.model,
        promptSnapshot: match[1] || context.prompt || '',
        status: context.status || 'draft'
      }, {
        binary: match[2],
        storage: options.storage,
        binaryStore: options.binaryStore,
        indexedDBImpl: options.indexedDBImpl
      })
      replacements.push({
        start: match.index,
        end: match.index + match[0].length,
        value: createMarkdownMediaReference(match[1], mediaAsset.id)
      })
      mediaAssetIds.push(mediaAsset.id)
    } catch {
      // A failed item remains inline so content is never damaged by migration.
    }
  }

  let migrated = source
  replacements.sort((a, b) => b.start - a.start).forEach((replacement) => {
    migrated = `${migrated.slice(0, replacement.start)}${replacement.value}${migrated.slice(replacement.end)}`
  })
  return {
    content: migrated,
    mediaAssetIds,
    changed: replacements.length > 0
  }
}

export async function hydrateMarkdownMediaContent(content = '', options = {}) {
  const source = String(content || '')
  const assetIds = [...new Set([...source.matchAll(MEDIA_REFERENCE_PATTERN)].map((match) => match[1]))]
  if (!assetIds.length) return source

  const resolved = new Map()
  await Promise.all(assetIds.map(async (assetId) => {
    try {
      const data = await getMediaAssetDataUrl(assetId, options)
      if (data) resolved.set(assetId, data)
    } catch {
      // Keep unresolved references intact for a later retry.
    }
  }))

  return source.replace(MEDIA_REFERENCE_PATTERN, (reference, assetId) => resolved.get(assetId) || reference)
}

export function createMarkdownMediaReference(alt = '', mediaAssetId = '') {
  const id = String(mediaAssetId || '').trim()
  if (!id) throw new Error('Markdown 图片缺少 MediaAsset ID')
  const label = String(alt || '图片').replace(/[\]\r\n]/g, ' ').trim() || '图片'
  return `![${label}](pinax-media://${id})`
}
