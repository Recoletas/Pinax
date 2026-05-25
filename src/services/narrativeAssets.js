import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage'

export const ASSET_SCHEMA_VERSION = 1

export const ASSET_KINDS = [
  { value: 'draft-prose', label: '正文候选' },
  { value: 'event', label: '剧情事件' },
  { value: 'character-fact', label: '人物事实' },
  { value: 'worldbook-draft', label: '世界书草稿' },
  { value: 'inspiration', label: '灵感' },
  { value: 'storyboard-seed', label: '分镜种子' }
]

export const ASSET_STATUSES = ['inbox', 'accepted', 'rejected', 'archived']

export function listNarrativeAssets({ status = null, projectId = undefined } = {}) {
  const stored = getItem(STORAGE_KEYS.NARRATIVE_ASSETS)
  const list = Array.isArray(stored) ? stored : []

  return list
    .filter((asset) => !status || asset.status === status)
    .filter((asset) => projectId === undefined || asset.projectId === projectId)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
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

export function getAssetKindLabel(kind) {
  return ASSET_KINDS.find((item) => item.value === kind)?.label || '素材'
}

function normalizeKind(kind) {
  return ASSET_KINDS.some((item) => item.value === kind) ? kind : 'inspiration'
}

function normalizeStatus(status) {
  return ASSET_STATUSES.includes(status) ? status : 'inbox'
}

function normalizeSource(source = {}) {
  return {
    type: source.type || 'manual',
    id: source.id || '',
    messageIds: Array.isArray(source.messageIds) ? source.messageIds : []
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
