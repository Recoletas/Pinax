import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import { normalizeMaterial } from '../domain/material.js'

/**
 * 内存 MaterialStore:用于 Core 合同测试与 Host 适配器对照,不是生产存储。扁平列表,新建插到最前。
 */
export function createMemoryMaterialStore({ materials = [] } = {}) {
  const state = Array.isArray(materials) ? [...materials] : []

  function indexOf(materialId) {
    return state.findIndex((material) => String(material?.id) === String(materialId))
  }

  return {
    list() {
      return ok(state.map((material) => normalizeMaterial(material)).filter(Boolean))
    },

    read(materialId) {
      const index = indexOf(materialId)
      return ok(index < 0 ? null : normalizeMaterial(state[index]))
    },

    create(material) {
      const record = normalizeMaterial(material)
      if (!record) return fail(CORE_ERROR_CODES.INVALID_INPUT, '资料形状无效')
      if (indexOf(record.id) >= 0) return fail(CORE_ERROR_CODES.DUPLICATE_MATERIAL, '资料已存在', { materialId: record.id })
      state.unshift(record)
      return ok(record)
    },

    update(materialId, material) {
      const index = indexOf(materialId)
      if (index < 0) return fail(CORE_ERROR_CODES.MATERIAL_NOT_FOUND, '资料不存在', { materialId })
      const record = normalizeMaterial(material)
      if (!record) return fail(CORE_ERROR_CODES.INVALID_INPUT, '资料形状无效')
      state[index] = record
      return ok(record)
    },

    remove(materialId) {
      const index = indexOf(materialId)
      if (index < 0) return fail(CORE_ERROR_CODES.MATERIAL_NOT_FOUND, '资料不存在', { materialId })
      const [removed] = state.splice(index, 1)
      return ok(normalizeMaterial(removed))
    },

    snapshot() {
      return state
    }
  }
}
