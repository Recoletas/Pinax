import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import {
  ACTIVE_MATERIAL_STATUSES,
  MATERIAL_STATUSES,
  createMaterial,
  normalizeMaterial,
  sortMaterialsNewestFirst,
  updateMaterial
} from '../domain/material.js'
import { isMaterialStore } from '../ports/materialStore.js'

function nonEmptyId(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function defaultIdFactory() {
  return `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function materialSummary(material) {
  return {
    id: material.id,
    title: material.title,
    kind: material.kind,
    status: material.status,
    contentHash: material.contentHash,
    updatedAt: material.updatedAt
  }
}

export function filterMaterials(materials, { status = null, kind = null, projectId = undefined, activeOnly = false } = {}) {
  return materials.filter((material) => {
    if (status && material.status !== status) return false
    if (activeOnly && !ACTIVE_MATERIAL_STATUSES.includes(material.status)) return false
    if (kind && material.kind !== kind) return false
    if (projectId !== undefined && material.projectId !== projectId) return false
    return true
  })
}

// 内容去重键：优先用 contentHash（宿主已存），否则用去空白后的正文全文。
function contentKey(material) {
  return material.contentHash ? `hash:${material.contentHash}` : `text:${material.content}`
}

export function buildMaterialUpdatePatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return fail(CORE_ERROR_CODES.INVALID_INPUT, '资料更新输入必须是对象')
  }
  const writable = ['content', 'title', 'kind', 'status', 'projectId']
  const patch = {}
  for (const key of writable) {
    if (Object.prototype.hasOwnProperty.call(input, key)) patch[key] = input[key]
  }
  if (Object.keys(patch).length === 0) return fail(CORE_ERROR_CODES.INVALID_INPUT, '没有可更新的字段')
  if (Object.prototype.hasOwnProperty.call(patch, 'content')) {
    if (typeof patch.content !== 'string') return fail(CORE_ERROR_CODES.INVALID_INPUT, 'content 必须是字符串')
    patch.content = patch.content.trim()
    if (!patch.content) return fail(CORE_ERROR_CODES.INVALID_INPUT, '素材内容不能为空')
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'status') && !MATERIAL_STATUSES.includes(patch.status)) {
    return fail(CORE_ERROR_CODES.INVALID_INPUT, '非法状态', { status: patch.status })
  }
  return ok(patch)
}

/**
 * 资料业务用例(异步)。kind/status 白名单、非空正文、去重、最新在前、状态校验都在这里,三端共用。
 * 图片/证据引用/合并等富字段原样保留,不在本切片建模。
 */
export function createMaterialService({ store, idFactory = defaultIdFactory } = {}) {
  if (!isMaterialStore(store)) throw new TypeError('createMaterialService 需要实现 list/read/create/update/remove 的 MaterialStore')

  async function list(filters = {}) {
    const listed = await store.list()
    if (!listed.ok) return listed
    const materials = (Array.isArray(listed.value) ? listed.value : []).map(normalizeMaterial).filter(Boolean)
    return ok(sortMaterialsNewestFirst(filterMaterials(materials, filters)).map(materialSummary))
  }

  async function read(materialId) {
    if (!nonEmptyId(materialId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'materialId 必填')
    const result = await store.read(materialId)
    if (!result.ok) return result
    if (!result.value) return fail(CORE_ERROR_CODES.MATERIAL_NOT_FOUND, '资料不存在', { materialId })
    const normalized = normalizeMaterial(result.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.INVALID_INPUT, '资料数据形状无效', { materialId })
  }

  async function create(input = {}, { dedupe = false } = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(CORE_ERROR_CODES.INVALID_INPUT, '资料输入必须是对象')
    const content = String(input.content ?? '').trim()
    if (!content) return fail(CORE_ERROR_CODES.INVALID_INPUT, '素材内容不能为空')
    const material = createMaterial({ ...input, id: nonEmptyId(input.id) ? input.id.trim() : idFactory(), content })
    if (!material) return fail(CORE_ERROR_CODES.INVALID_INPUT, '资料 id 无效')
    if (dedupe) {
      const listed = await store.list()
      if (listed.ok) {
        const existing = (Array.isArray(listed.value) ? listed.value : [])
          .map(normalizeMaterial).filter(Boolean)
          .find((item) => contentKey(item) === contentKey(material))
        if (existing) return ok({ ...existing, deduped: true })
      }
    }
    const created = await store.create(material)
    if (!created.ok) return created
    const normalized = normalizeMaterial(created.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的资料形状无效')
  }

  async function update(materialId, input = {}) {
    if (!nonEmptyId(materialId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'materialId 必填')
    const patch = buildMaterialUpdatePatch(input)
    if (!patch.ok) return patch
    const current = await store.read(materialId)
    if (!current.ok) return current
    if (!current.value) return fail(CORE_ERROR_CODES.MATERIAL_NOT_FOUND, '资料不存在', { materialId })
    const next = updateMaterial(normalizeMaterial(current.value), patch.value)
    const updated = await store.update(materialId, next)
    if (!updated.ok) return updated
    const normalized = normalizeMaterial(updated.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的资料形状无效')
  }

  async function setStatus(materialId, status) {
    if (!MATERIAL_STATUSES.includes(status)) return fail(CORE_ERROR_CODES.INVALID_INPUT, '非法状态', { status })
    return update(materialId, { status })
  }

  async function remove(materialId) {
    if (!nonEmptyId(materialId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'materialId 必填')
    return store.remove(materialId)
  }

  return Object.freeze({ list, read, create, update, setStatus, remove })
}
