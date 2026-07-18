import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage'

export const ASSET_SCHEMA_VERSION = 1

export const ASSET_KINDS = [
  {
    value: 'draft-prose',
    label: '正文候选',
    explanation: '可直接插入章节或作为续写底稿的段落素材。'
  },
  {
    value: 'event',
    label: '剧情事件',
    explanation: '用于推动剧情进展、冲突与转折的事件记录。'
  },
  {
    value: 'character-fact',
    label: '人物事实',
    explanation: '角色设定、关系和行为动机等稳定信息。'
  },
  {
    value: 'worldbook-draft',
    label: '世界书草稿',
    explanation: '可转换为世界书条目的设定草稿。'
  },
  {
    value: 'inspiration',
    label: '灵感',
    explanation: '待整理的意象、句子或片段灵感。'
  },
  {
    value: 'storyboard-seed',
    label: '分镜种子',
    explanation: '用于生成章节分镜的镜头线索或场面描述。'
  },
  {
    value: 'reference-image',
    label: '参考图',
    explanation: '可挂到分镜镜头卡的视觉参考图片。'
  }
]

export const ASSET_STATUSES = ['inbox', 'accepted', 'rejected', 'archived']
export const ACTIVE_ASSET_STATUSES = ['inbox', 'accepted']
export const DEFAULT_IMAGE_PRESENTATION = Object.freeze({
  fit: 'contain',
  scale: 1,
  positionX: 50,
  positionY: 50,
  wrap: 'square',
  align: 'right',
  textGap: 16,
  anchorOffset: 0
})
export const CONTENT_REF_TYPES = [
  'worldbook-entry',
  'map-site',
  'history-node',
  'session-message',
  'plot-journal',
  'narrative-asset',
  'canvas-card',
  'chapter',
  'storyboard-shot',
  'comic-page',
  'comic-panel',
  'image',
  'video',
  'audio'
]

export function listNarrativeAssets({ status = null, projectId = undefined, kind = null, sourceType = null, sourceId = null } = {}) {
  const stored = getItem(STORAGE_KEYS.NARRATIVE_ASSETS)
  const list = Array.isArray(stored) ? stored : []

  return list
    .filter((asset) => !status || asset.status === status)
    .filter((asset) => !kind || asset.kind === kind)
    .filter((asset) => projectId === undefined || asset.projectId === projectId)
    .filter((asset) => !sourceType || asset.source?.type === sourceType)
    .filter((asset) => !sourceId || asset.source?.id === sourceId)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
}

export function listActiveNarrativeAssets(filters = {}) {
  return listNarrativeAssets({ ...filters, status: null })
    .filter((asset) => ACTIVE_ASSET_STATUSES.includes(asset.status))
}

export function createNarrativeAsset(input = {}) {
  const now = Date.now()
  const content = normalizeText(input.content)
  const title = normalizeText(input.title) || buildAssetTitle(content)
  const source = normalizeSource(input.source)

  return {
    id: input.id || `asset_${now}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: ASSET_SCHEMA_VERSION,
    projectId: input.projectId ?? null,
    source,
    sourceRefs: normalizeSourceRefs(input.sourceRefs, { source, projectId: input.projectId }),
    contentHash: buildNarrativeAssetContentHash(content),
    kind: normalizeKind(input.kind),
    title,
    content,
    status: normalizeStatus(input.status),
    image: normalizeImage(input.image),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now
  }
}

export function addNarrativeAsset(input = {}, { dedupe = false } = {}) {
  const asset = createNarrativeAsset(input)
  if (!asset.content) {
    throw new Error('素材内容不能为空')
  }

  const current = listNarrativeAssets({ status: null })
  if (dedupe) {
    const duplicate = findDuplicateNarrativeAsset(asset, current)
    if (duplicate) return duplicate
  }
  const next = [asset, ...current]
  setItem(STORAGE_KEYS.NARRATIVE_ASSETS, next)
  return asset
}

export function normalizeContentRef(ref = {}, fallbackProjectId = null) {
  if (!ref || typeof ref !== 'object') return null
  const refType = normalizeText(ref.refType || ref.type)
  const refId = normalizeText(ref.refId || ref.id)
  if (!CONTENT_REF_TYPES.includes(refType) || !refId) return null

  const normalized = {
    refType,
    refId,
    projectId: normalizeProjectId(ref.projectId ?? fallbackProjectId),
    version: normalizeRefVersion(ref.version),
    excerpt: normalizeExcerpt(ref.excerpt)
  }
  return normalized
}

export function normalizeSourceRefs(refs = [], { source = null, projectId = null } = {}) {
  const inputRefs = Array.isArray(refs) ? refs : []
  const normalized = inputRefs
    .map((ref) => normalizeContentRef(ref, projectId))
    .filter(Boolean)

  if (normalized.length === 0) {
    normalized.push(...inferSourceRefs(source, projectId))
  }

  const seen = new Set()
  return normalized.filter((ref) => {
    const key = contentRefKey(ref)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 12)
}

export function buildNarrativeAssetContentHash(content = '') {
  const normalized = normalizeText(content).replace(/\s+/g, ' ')
  let hash = 2166136261
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function findDuplicateNarrativeAsset(input = {}, assets = null) {
  const contentHash = input.contentHash || buildNarrativeAssetContentHash(input.content)
  const projectId = normalizeProjectId(input.projectId)
  const sourceRefs = normalizeSourceRefs(input.sourceRefs, {
    source: input.source,
    projectId
  })
  if (sourceRefs.length === 0) return null

  const candidates = Array.isArray(assets) ? assets : listNarrativeAssets({ status: null })
  return candidates.find((asset) => {
    if (!asset || asset.contentHash && asset.contentHash !== contentHash) return false
    if (!asset.contentHash && buildNarrativeAssetContentHash(asset.content) !== contentHash) return false
    if (normalizeProjectId(asset.projectId) !== projectId) return false
    const existingRefs = normalizeSourceRefs(asset.sourceRefs, {
      source: asset.source,
      projectId: asset.projectId
    })
    return sourceRefs.some((ref) => existingRefs.some((existing) => contentRefKey(existing) === contentRefKey(ref)))
  }) || null
}

export function updateNarrativeAsset(assetId, patch = {}) {
  const current = listNarrativeAssets({ status: null })
  const now = Date.now()
  let updated = null

  const next = current.map((asset) => {
    if (asset.id !== assetId) return asset
    const content = patch.content !== undefined ? normalizeText(patch.content) : asset.content
    const source = patch.source !== undefined ? normalizeSource(patch.source) : asset.source
    const projectId = patch.projectId !== undefined ? patch.projectId : asset.projectId
    updated = {
      ...asset,
      ...patch,
      projectId,
      kind: patch.kind ? normalizeKind(patch.kind) : asset.kind,
      status: patch.status ? normalizeStatus(patch.status) : asset.status,
      title: patch.title !== undefined ? normalizeText(patch.title) : asset.title,
      content,
      source,
      sourceRefs: patch.sourceRefs !== undefined || patch.source !== undefined || patch.projectId !== undefined
        ? normalizeSourceRefs(patch.sourceRefs, { source, projectId })
        : (Array.isArray(asset.sourceRefs) ? asset.sourceRefs : normalizeSourceRefs([], { source, projectId })),
      image: patch.image !== undefined ? normalizeImage(patch.image) : asset.image,
      contentHash: patch.content !== undefined
        ? buildNarrativeAssetContentHash(content)
        : (asset.contentHash || buildNarrativeAssetContentHash(content)),
      updatedAt: now
    }
    return updated
  })

  if (!updated) return null
  setItem(STORAGE_KEYS.NARRATIVE_ASSETS, next)
  return updated
}

export function setNarrativeAssetStatus(assetId, status) {
  return updateNarrativeAsset(assetId, { status })
}

export function deleteNarrativeAsset(assetId) {
  const normalizedId = normalizeText(assetId)
  if (!normalizedId) return null

  const current = listNarrativeAssets({ status: null })
  const deleted = current.find((asset) => asset.id === normalizedId) || null
  if (!deleted) return null

  setItem(STORAGE_KEYS.NARRATIVE_ASSETS, current.filter((asset) => asset.id !== normalizedId))
  return deleted
}

export function setNarrativeAssetsStatus(assetIds = [], status) {
  const ids = new Set(Array.isArray(assetIds) ? assetIds : [])
  if (ids.size === 0) return []

  const current = listNarrativeAssets({ status: null })
  const now = Date.now()
  const updated = []
  const next = current.map((asset) => {
    if (!ids.has(asset.id)) return asset
    const item = {
      ...asset,
      status: normalizeStatus(status),
      updatedAt: now
    }
    updated.push(item)
    return item
  })

  if (updated.length > 0) {
    setItem(STORAGE_KEYS.NARRATIVE_ASSETS, next)
  }
  return updated
}

export function mergeNarrativeAssets(assetIds = [], { targetId = null, title = null, status = null } = {}) {
  const ids = [...new Set(Array.isArray(assetIds) ? assetIds.map(normalizeText).filter(Boolean) : [])]
  if (ids.length < 2) return null

  const current = listNarrativeAssets({ status: null })
  const byId = new Map(current.map((asset) => [asset.id, asset]))
  const selected = ids.map((id) => byId.get(id)).filter(Boolean)
  if (selected.length < 2) return null

  const projectIds = new Set(selected.map((asset) => normalizeProjectId(asset.projectId)))
  if (projectIds.size > 1) return null

  const target = selected.find((asset) => asset.id === targetId) || selected[0]
  const contentParts = []
  const seenContent = new Set()
  for (const asset of selected) {
    const content = normalizeText(asset.content)
    if (!content || seenContent.has(content)) continue
    seenContent.add(content)
    contentParts.push(content)
  }
  const mergedContent = contentParts.join('\n\n')
  const sourceRefs = selected.flatMap((asset) => normalizeSourceRefs(asset.sourceRefs, {
    source: asset.source,
    projectId: asset.projectId
  }))
  const merged = {
    ...target,
    title: normalizeText(title) || target.title,
    content: mergedContent,
    sourceRefs: normalizeSourceRefs(sourceRefs, { projectId: target.projectId }),
    contentHash: buildNarrativeAssetContentHash(mergedContent),
    status: status ? normalizeStatus(status) : target.status,
    updatedAt: Date.now()
  }
  const selectedIds = new Set(selected.map((asset) => asset.id))
  const next = current
    .map((asset) => asset.id === target.id ? merged : asset)
    .filter((asset) => asset.id === target.id || !selectedIds.has(asset.id))
  setItem(STORAGE_KEYS.NARRATIVE_ASSETS, next)
  return {
    asset: merged,
    mergedIds: selected.filter((asset) => asset.id !== target.id).map((asset) => asset.id)
  }
}

export function getAssetKindLabel(kind) {
  return ASSET_KINDS.find((item) => item.value === kind)?.label || '素材'
}

export function getAssetKindExplanation(kind) {
  return ASSET_KINDS.find((item) => item.value === kind)?.explanation || '可复用的写作素材条目。'
}

export function getAssetSourceLabel(source = {}) {
  const type = String(source?.type || 'manual')
  switch (type) {
    case 'experience-session':
      return '体验会话'
    case 'poetry-node':
      return '诗歌节点'
    case 'prose-card':
      return '散文卡片'
    case 'relation-canvas':
      return '卡片画布'
    case 'note-image':
      return '素材生图'
    case 'note':
      return '素材'
    case 'chapter':
      return '章节'
    case 'manual':
    default:
      return '手动录入'
  }
}

export function getAssetSourceDetail(source = {}) {
  const label = getAssetSourceLabel(source)
  const messageCount = Array.isArray(source?.messageIds) ? source.messageIds.length : 0
  const chapterId = source?.chapterId ? String(source.chapterId).trim() : ''
  const sourceId = String(source?.id || '').trim()
  const visibleId = chapterId || sourceId
  const parts = [label]
  if (visibleId) parts.push(visibleId)
  if (messageCount > 0) parts.push(`${messageCount} 段`)
  if (chapterId && source?.selectorOffset != null && source?.selectorLength != null) {
    const start = Number(source.selectorOffset)
    const length = Number(source.selectorLength)
    if (Number.isFinite(start) && Number.isFinite(length) && length >= 0) {
      parts.push(`${start}-${start + length}`)
    }
  }
  return parts.join(' · ')
}

export function isChapterSelectionSource(source = {}) {
  if (!source || typeof source !== 'object') return false
  if (source.type !== 'chapter') return false
  if (!source.chapterId) return false
  if (!String(source.chapterId).trim()) return false
  return true
}

export function createChapterSelectionSource({ chapterId, offset, length, snippet } = {}) {
  const text = String(chapterId || '').trim()
  if (!text) {
    throw new Error('createChapterSelectionSource 需要 chapterId')
  }
  return normalizeSource({
    type: 'chapter',
    id: text,
    chapterId: text,
    selectorOffset: offset,
    selectorLength: length,
    selectorSnippet: snippet
  })
}

function normalizeKind(kind) {
  return ASSET_KINDS.some((item) => item.value === kind) ? kind : 'inspiration'
}

function normalizeStatus(status) {
  return ASSET_STATUSES.includes(status) ? status : 'inbox'
}

function normalizeSource(source = null) {
  const safe = source && typeof source === 'object' ? source : {}
  return {
    type: safe.type || 'manual',
    id: safe.id || '',
    messageIds: Array.isArray(safe.messageIds) ? safe.messageIds : [],
    chapterId: normalizeChapterId(safe.chapterId),
    selectorOffset: normalizeSelectorOffset(safe.selectorOffset),
    selectorLength: normalizeSelectorLength(safe.selectorLength),
    selectorSnippet: normalizeSelectorSnippet(safe.selectorSnippet)
  }
}

function inferSourceRefs(source = null, projectId = null) {
  if (!source || typeof source !== 'object') return []
  const type = normalizeText(source.type)
  const id = normalizeText(source.id || source.chapterId)
  if (type === 'chapter' && (source.chapterId || id)) {
    return [normalizeContentRef({
      refType: 'chapter',
      refId: source.chapterId || id,
      projectId,
      excerpt: source.selectorSnippet
    }, projectId)].filter(Boolean)
  }
  if (type === 'experience-session' && Array.isArray(source.messageIds)) {
    return source.messageIds
      .map((messageId) => normalizeContentRef({
        refType: 'session-message',
        refId: `${id || 'session'}:${normalizeText(messageId)}`,
        projectId
      }, projectId))
      .filter(Boolean)
  }
  return []
}

function contentRefKey(ref) {
  return [ref.refType, ref.refId, ref.projectId || '', ref.version ?? ''].join(':')
}

function normalizeProjectId(value) {
  const text = normalizeText(value)
  return text || null
}

function normalizeRefVersion(value) {
  if (value === null || value === undefined || value === '') return null
  const text = normalizeText(value)
  return text || null
}

function normalizeExcerpt(value) {
  const text = normalizeText(value).replace(/\s+/g, ' ')
  return text ? text.slice(0, 240) : null
}

function normalizeChapterId(value) {
  const text = String(value || '').trim()
  return text || null
}

function normalizeSelectorOffset(value) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return null
  return Math.floor(num)
}

function normalizeSelectorLength(value) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return null
  return Math.floor(num)
}

function normalizeSelectorSnippet(value) {
  const text = String(value || '').trim()
  if (!text) return null
  return text.length > 60 ? text.slice(0, 60) : text
}

function normalizeImage(image = null) {
  if (!image || (!image.data && !image.mediaAssetId)) return null
  return {
    id: image.id || '',
    mediaAssetId: normalizeText(image.mediaAssetId),
    storageRef: normalizeText(image.storageRef),
    purpose: normalizeText(image.purpose),
    prompt: normalizeText(image.prompt),
    data: image.data || '',
    negativePrompt: normalizeText(image.negativePrompt),
    modelName: normalizeText(image.modelName),
    modelId: normalizeText(image.modelId),
    modelType: normalizeText(image.modelType),
    width: Number(image.width) || null,
    height: Number(image.height) || null,
    presentation: normalizeImagePresentation(image.presentation)
  }
}

export function normalizeImagePresentation(presentation = {}) {
  const source = presentation && typeof presentation === 'object' ? presentation : {}
  const wrap = ['inline', 'square', 'tight', 'top-bottom', 'behind', 'front'].includes(source.wrap)
    ? source.wrap
    : DEFAULT_IMAGE_PRESENTATION.wrap
  const align = ['left', 'center', 'right'].includes(source.align)
    ? source.align
    : (wrap === 'inline' || wrap === 'top-bottom' ? 'center' : DEFAULT_IMAGE_PRESENTATION.align)
  return {
    fit: source.fit === 'cover' ? 'cover' : DEFAULT_IMAGE_PRESENTATION.fit,
    scale: clampNumber(source.scale, 0.5, 2, DEFAULT_IMAGE_PRESENTATION.scale),
    positionX: clampNumber(source.positionX, 0, 100, DEFAULT_IMAGE_PRESENTATION.positionX),
    positionY: clampNumber(source.positionY, 0, 100, DEFAULT_IMAGE_PRESENTATION.positionY),
    wrap,
    align,
    textGap: clampNumber(source.textGap, 0, 48, DEFAULT_IMAGE_PRESENTATION.textGap),
    anchorOffset: Math.round(clampNumber(source.anchorOffset, 0, Number.MAX_SAFE_INTEGER, 0))
  }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function normalizeText(value) {
  return String(value || '').trim()
}

function buildAssetTitle(content) {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  if (firstLine) return firstLine.slice(0, 24)

  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  return `素材 ${mm}-${dd} ${hh}:${mi}`
}
