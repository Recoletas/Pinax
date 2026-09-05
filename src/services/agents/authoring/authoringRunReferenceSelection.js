import { authoringRunReferenceRevision } from '../context/authoringRunContextReaders.js'

export const MAX_AUTHORING_RUN_REFERENCE_SELECTIONS = 3

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function excerpt(value, limit = 180) {
  const normalized = text(value)
  return {
    text: normalized.slice(0, limit),
    truncated: normalized.length > limit
  }
}

function assetUsageRole(asset = {}) {
  if (asset.kind === 'character-fact') return 'fact'
  if (asset.kind === 'event') return 'intent'
  return 'inspiration'
}

function assetTypeLabel(kind) {
  return ({
    'draft-prose': '正文候选',
    event: '剧情事件',
    'character-fact': '人物事实',
    'worldbook-draft': '设定草稿',
    inspiration: '灵感',
    'storyboard-seed': '分镜种子',
    'reference-image': '参考图'
  })[kind] || '叙事素材'
}

function buildCatalogItem(sourceKind, source, projectId) {
  const sourceId = text(source?.id)
  if (!sourceId) return null
  const content = text(source?.content)
  const preview = excerpt(content)
  const isExploration = sourceKind === 'exploration-doc'
  const usageRole = isExploration ? 'inspiration' : assetUsageRole(source)
  return Object.freeze({
    id: `${sourceKind}:${sourceId}`,
    sourceKind,
    sourceId,
    projectId: text(source?.bookId || source?.projectId || projectId),
    label: text(source?.title) || (isExploration ? '未命名速记' : '未命名素材'),
    typeLabel: isExploration ? '速记' : assetTypeLabel(source?.kind),
    group: isExploration ? 'exploration' : 'material',
    excerpt: preview.text,
    previewTruncated: preview.truncated,
    revision: authoringRunReferenceRevision(sourceKind, source),
    usageRole,
    scope: 'run-only',
    sourceRefs: Array.isArray(source?.sourceRefs) ? source.sourceRefs : [],
    status: text(source?.status) || (isExploration ? 'active' : '')
  })
}

export function buildAuthoringRunReferenceCatalog({ projectId = '', explorations = [], assets = [] } = {}) {
  const normalizedProjectId = text(projectId)
  const byId = new Map()
  for (const source of Array.isArray(explorations) ? explorations : []) {
    const item = buildCatalogItem('exploration-doc', source, normalizedProjectId)
    if (item && item.projectId === normalizedProjectId && item.status !== 'parked') byId.set(item.id, item)
  }
  for (const source of Array.isArray(assets) ? assets : []) {
    const item = buildCatalogItem('narrative-asset', source, normalizedProjectId)
    if (item && item.projectId === normalizedProjectId && ['inbox', 'accepted'].includes(item.status)) byId.set(item.id, item)
  }
  return Object.freeze([...byId.values()])
}

export function addAuthoringRunReferenceSelection(selections = [], item = null, { max = MAX_AUTHORING_RUN_REFERENCE_SELECTIONS } = {}) {
  const current = Array.isArray(selections) ? selections : []
  if (!item?.id || !item?.sourceId || !item?.projectId || !item?.revision) return { ok: false, reason: 'source-unavailable', selections: current }
  if (current.some((selected) => selected.id === item.id)) return { ok: false, reason: 'duplicate', selections: current }
  if (current.length >= max) return { ok: false, reason: 'limit', limit: max, selections: current }
  return { ok: true, selections: [...current, Object.freeze({ ...item, selectedRevision: item.revision })] }
}

export function removeAuthoringRunReferenceSelection(selections = [], id = '') {
  return (Array.isArray(selections) ? selections : []).filter((item) => item.id !== text(id))
}

export function reconcileAuthoringRunReferenceSelections(selections = [], catalog = [], projectId = '') {
  const liveById = new Map((Array.isArray(catalog) ? catalog : []).map((item) => [item.id, item]))
  const normalizedProjectId = text(projectId)
  return (Array.isArray(selections) ? selections : []).map((selected) => {
    const live = liveById.get(selected.id)
    const status = selected.projectId !== normalizedProjectId
      ? 'project-mismatch'
      : !live ? 'missing'
        : live.revision !== selected.selectedRevision ? 'modified' : 'ready'
    return Object.freeze({ ...selected, live: live || null, selectionStatus: status })
  })
}

export function refreshAuthoringRunReferenceSelection(selections = [], id = '', catalog = []) {
  const live = (Array.isArray(catalog) ? catalog : []).find((item) => item.id === text(id))
  if (!live) return selections
  return (Array.isArray(selections) ? selections : []).map((item) => (
    item.id === live.id ? Object.freeze({ ...live, selectedRevision: live.revision }) : item
  ))
}

export function toAuthoringRunReferences(selections = []) {
  return (Array.isArray(selections) ? selections : []).slice(0, MAX_AUTHORING_RUN_REFERENCE_SELECTIONS).map((item) => ({
    id: item.id,
    sourceKind: item.sourceKind,
    sourceId: item.sourceId,
    projectId: item.projectId,
    label: item.label,
    excerpt: item.excerpt,
    sourceRefs: item.sourceRefs,
    revision: item.selectedRevision || item.revision,
    usageRole: item.usageRole,
    scope: 'run-only'
  }))
}
