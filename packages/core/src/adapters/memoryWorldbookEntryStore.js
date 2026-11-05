import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import { normalizeWorldbookEntry } from '../domain/worldbookEntry.js'

/**
 * 内存 WorldbookEntryStore:用于 Core 合同测试与 Host 适配器对照,不是生产存储。
 * 按 worldbookId 分桶保存条目。
 */
export function createMemoryWorldbookEntryStore({ buckets = new Map() } = {}) {
  const state = buckets instanceof Map ? buckets : new Map(Object.entries(buckets || {}))

  function entriesOf(worldbookId) {
    const key = String(worldbookId)
    if (!state.has(key)) state.set(key, [])
    return state.get(key)
  }

  function findEntry(worldbookId, entryId) {
    return entriesOf(worldbookId).find((entry) => String(entry?.id) === String(entryId)) || null
  }

  return {
    list(worldbookId) {
      if (!state.has(String(worldbookId))) return ok([])
      return ok(entriesOf(worldbookId).map((entry) => normalizeWorldbookEntry(entry, { worldbookId })).filter(Boolean))
    },

    read(worldbookId, entryId) {
      const entry = findEntry(worldbookId, entryId)
      return ok(entry ? normalizeWorldbookEntry(entry, { worldbookId }) : null)
    },

    create(worldbookId, entry) {
      const record = normalizeWorldbookEntry(entry, { worldbookId })
      if (!record) return fail(CORE_ERROR_CODES.INVALID_INPUT, '条目形状无效')
      const stored = { ...record }
      delete stored.worldbookId
      if (findEntry(worldbookId, record.id)) {
        return fail(CORE_ERROR_CODES.DUPLICATE_ENTRY, '条目已存在', { worldbookId, entryId: record.id })
      }
      entriesOf(worldbookId).push(stored)
      return ok(record)
    },

    update(worldbookId, entryId, patch) {
      const entry = findEntry(worldbookId, entryId)
      if (!entry) return fail(CORE_ERROR_CODES.ENTRY_NOT_FOUND, '条目不存在', { worldbookId, entryId })
      const merged = { ...entry, ...patch, updatedAt: new Date().toISOString() }
      const index = entriesOf(worldbookId).findIndex((item) => String(item?.id) === String(entryId))
      entriesOf(worldbookId)[index] = merged
      return ok(normalizeWorldbookEntry(merged, { worldbookId }))
    },

    remove(worldbookId, entryId) {
      const entries = entriesOf(worldbookId)
      const index = entries.findIndex((entry) => String(entry?.id) === String(entryId))
      if (index < 0) return fail(CORE_ERROR_CODES.ENTRY_NOT_FOUND, '条目不存在', { worldbookId, entryId })
      const [removed] = entries.splice(index, 1)
      return ok(normalizeWorldbookEntry(removed, { worldbookId }))
    },

    snapshot(worldbookId) {
      return state.get(String(worldbookId)) || []
    }
  }
}
