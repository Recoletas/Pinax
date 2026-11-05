import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import { MATERIAL_STATUSES, createMaterial, normalizeMaterial, sortMaterialsNewestFirst, updateMaterial } from '../domain/material.js'
import { isMaterialStore } from '../ports/materialStore.js'
import { buildMaterialUpdatePatch, filterMaterials } from './materialService.js'

function nonEmptyId(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function defaultIdFactory() {
  return `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function materialSummary(material) {
  return { id: material.id, title: material.title, kind: material.kind, status: material.status, contentHash: material.contentHash, updatedAt: material.updatedAt }
}

function contentKey(material) {
  return material.contentHash ? `hash:${material.contentHash}` : `text:${material.content}`
}

/**
 * 同步资料 Service:给 localStorage 这类同步存储的 Host 用。与异步版共用 domain、白名单、去重与状态校验。
 */
export function createSyncMaterialService({ store, idFactory = defaultIdFactory } = {}) {
  if (!isMaterialStore(store)) throw new TypeError('createSyncMaterialService 需要实现 list/read/create/update/remove 的 MaterialStore')

  function list(filters = {}) {
    const listed = store.list()
    if (!listed.ok) return listed
    const materials = (Array.isArray(listed.value) ? listed.value : []).map(normalizeMaterial).filter(Boolean)
    return ok(sortMaterialsNewestFirst(filterMaterials(materials, filters)).map(materialSummary))
  }

  function read(materialId) {
    if (!nonEmptyId(materialId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'materialId 必填')
    const result = store.read(materialId)
    if (!result.ok) return result
    if (!result.value) return fail(CORE_ERROR_CODES.MATERIAL_NOT_FOUND, '资料不存在', { materialId })
    const normalized = normalizeMaterial(result.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.INVALID_INPUT, '资料数据形状无效', { materialId })
  }

  function create(input = {}, { dedupe = false } = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(CORE_ERROR_CODES.INVALID_INPUT, '资料输入必须是对象')
    const content = String(input.content ?? '').trim()
    if (!content) return fail(CORE_ERROR_CODES.INVALID_INPUT, '素材内容不能为空')
    const material = createMaterial({ ...input, id: nonEmptyId(input.id) ? input.id.trim() : idFactory(), content })
    if (!material) return fail(CORE_ERROR_CODES.INVALID_INPUT, '资料 id 无效')
    if (dedupe) {
      const listed = store.list()
      if (listed.ok) {
        const existing = (Array.isArray(listed.value) ? listed.value : [])
          .map(normalizeMaterial).filter(Boolean)
          .find((item) => contentKey(item) === contentKey(material))
        if (existing) return ok({ ...existing, deduped: true })
      }
    }
    const created = store.create(material)
    if (!created.ok) return created
    const normalized = normalizeMaterial(created.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的资料形状无效')
  }

  function update(materialId, input = {}) {
    if (!nonEmptyId(materialId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'materialId 必填')
    const patch = buildMaterialUpdatePatch(input)
    if (!patch.ok) return patch
    const current = store.read(materialId)
    if (!current.ok) return current
    if (!current.value) return fail(CORE_ERROR_CODES.MATERIAL_NOT_FOUND, '资料不存在', { materialId })
    const next = updateMaterial(normalizeMaterial(current.value), patch.value)
    const updated = store.update(materialId, next)
    if (!updated.ok) return updated
    const normalized = normalizeMaterial(updated.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的资料形状无效')
  }

  function setStatus(materialId, status) {
    if (!MATERIAL_STATUSES.includes(status)) return fail(CORE_ERROR_CODES.INVALID_INPUT, '非法状态', { status })
    return update(materialId, { status })
  }

  function remove(materialId) {
    if (!nonEmptyId(materialId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'materialId 必填')
    return store.remove(materialId)
  }

  return Object.freeze({ list, read, create, update, setStatus, remove })
}
