function text(value) {
  return String(value ?? '').trim()
}

// 资料(narrative asset)的业务值集合。中文 label/说明属 Host 展示,不进 Core。
export const MATERIAL_KIND_VALUES = Object.freeze([
  'draft-prose', 'event', 'character-fact', 'worldbook-draft', 'inspiration', 'storyboard-seed', 'reference-image'
])
export const MATERIAL_STATUSES = Object.freeze(['inbox', 'accepted', 'rejected', 'archived'])
export const ACTIVE_MATERIAL_STATUSES = Object.freeze(['inbox', 'accepted'])

export function normalizeMaterialKind(kind) {
  return MATERIAL_KIND_VALUES.includes(kind) ? kind : 'inspiration'
}

export function normalizeMaterialStatus(status) {
  return MATERIAL_STATUSES.includes(status) ? status : 'inbox'
}

// 标题回退：正文首个非空行前 24 字（资料口径,区别于笔记的 18）；无正文则空,占位归 Host。
export function deriveMaterialTitle(content) {
  const firstLine = text(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  return firstLine ? firstLine.slice(0, 24) : ''
}

function passthroughTime(value) {
  return value === undefined || value === null ? null : value
}

/** 规范形状：id 必存在；kind/status 归一到白名单；content 去空白；富字段(source/image/sourceRefs/schemaVersion…)原样保留。 */
export function normalizeMaterial(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const id = text(raw.id)
  if (!id) return null
  return {
    ...raw,
    id,
    projectId: raw.projectId ?? null,
    kind: normalizeMaterialKind(raw.kind),
    title: text(raw.title),
    content: typeof raw.content === 'string' ? raw.content : '',
    status: normalizeMaterialStatus(raw.status),
    contentHash: typeof raw.contentHash === 'string' ? raw.contentHash : '',
    createdAt: passthroughTime(raw.createdAt),
    updatedAt: passthroughTime(raw.updatedAt)
  }
}

export function createMaterial(input = {}, { now = Date.now() } = {}) {
  const id = text(input.id)
  if (!id) return null
  const content = text(input.content)
  const note = {
    ...input.extra && typeof input.extra === 'object' ? input.extra : {},
    id,
    projectId: input.projectId ?? null,
    kind: normalizeMaterialKind(input.kind),
    title: text(input.title) || deriveMaterialTitle(content),
    content,
    status: normalizeMaterialStatus(input.status),
    contentHash: typeof input.contentHash === 'string' ? input.contentHash : '',
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now
  }
  if (input.source !== undefined) note.source = input.source
  if (input.sourceRefs !== undefined) note.sourceRefs = input.sourceRefs
  if (input.image !== undefined) note.image = input.image
  return note
}

/** 更新规则：改正文重算 title?（不覆盖显式 title）；kind/status 归一；刷新 updatedAt。 */
export function updateMaterial(current, patch = {}, { now = Date.now() } = {}) {
  const next = { ...current }
  if (Object.prototype.hasOwnProperty.call(patch, 'content')) {
    next.content = text(patch.content)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
    next.title = text(patch.title)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'kind')) {
    next.kind = normalizeMaterialKind(patch.kind)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    next.status = normalizeMaterialStatus(patch.status)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'projectId')) {
    next.projectId = patch.projectId ?? null
  }
  next.updatedAt = now
  return next
}

// 最新在前（按 createdAt 的 epoch 毫秒降序）。
export function sortMaterialsNewestFirst(materials) {
  return [...(Array.isArray(materials) ? materials : [])]
    .sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0))
}
