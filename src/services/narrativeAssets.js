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

  return {
    id: input.id || `asset_${now}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: ASSET_SCHEMA_VERSION,
    projectId: input.projectId ?? null,
    source: normalizeSource(input.source),
    kind: normalizeKind(input.kind),
    title,
    content,
    status: normalizeStatus(input.status),
    image: normalizeImage(input.image),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now
  }
}

export function addNarrativeAsset(input = {}) {
  const asset = createNarrativeAsset(input)
  if (!asset.content) {
    throw new Error('素材内容不能为空')
  }

  const current = listNarrativeAssets({ status: null })
  const next = [asset, ...current]
  setItem(STORAGE_KEYS.NARRATIVE_ASSETS, next)
  return asset
}

export function updateNarrativeAsset(assetId, patch = {}) {
  const current = listNarrativeAssets({ status: null })
  const now = Date.now()
  let updated = null

  const next = current.map((asset) => {
    if (asset.id !== assetId) return asset
    updated = {
      ...asset,
      ...patch,
      kind: patch.kind ? normalizeKind(patch.kind) : asset.kind,
      status: patch.status ? normalizeStatus(patch.status) : asset.status,
      title: patch.title !== undefined ? normalizeText(patch.title) : asset.title,
      content: patch.content !== undefined ? normalizeText(patch.content) : asset.content,
      source: patch.source !== undefined ? normalizeSource(patch.source) : asset.source,
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
  if (!image || !image.data) return null
  return {
    id: image.id || '',
    prompt: normalizeText(image.prompt),
    data: image.data,
    negativePrompt: normalizeText(image.negativePrompt),
    modelName: normalizeText(image.modelName),
    modelType: normalizeText(image.modelType),
    width: Number(image.width) || null,
    height: Number(image.height) || null
  }
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
