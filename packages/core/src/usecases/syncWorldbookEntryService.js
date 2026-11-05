import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import { createWorldbookEntry, normalizeWorldbookEntry, worldbookEntrySummary } from '../domain/worldbookEntry.js'
import { isWorldbookEntryStore } from '../ports/worldbookEntryStore.js'
import { validateWorldbookEntryPatch } from './worldbookEntryService.js'

function nonEmptyId(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function defaultIdFactory() {
  return `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 同步世界书条目 Service:给 localStorage 这类同步存储的 Host 用。与异步版共用 domain、错误码与校验。
 */
export function createSyncWorldbookEntryService({
  store,
  now = () => new Date().toISOString(),
  idFactory = defaultIdFactory
} = {}) {
  if (!isWorldbookEntryStore(store)) throw new TypeError('createSyncWorldbookEntryService 需要实现 list/read/create/update/remove 的 WorldbookEntryStore')

  function list(worldbookId) {
    if (!nonEmptyId(worldbookId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'worldbookId 必填')
    const listed = store.list(worldbookId)
    if (!listed.ok) return listed
    const entries = (Array.isArray(listed.value) ? listed.value : [])
      .map((entry) => normalizeWorldbookEntry(entry, { worldbookId }))
      .filter(Boolean)
    return ok(entries.map(worldbookEntrySummary))
  }

  function read(worldbookId, entryId) {
    if (!nonEmptyId(worldbookId) || !nonEmptyId(entryId)) {
      return fail(CORE_ERROR_CODES.INVALID_INPUT, 'worldbookId 与 entryId 必填')
    }
    const readResult = store.read(worldbookId, entryId)
    if (!readResult.ok) return readResult
    if (!readResult.value) return fail(CORE_ERROR_CODES.ENTRY_NOT_FOUND, '条目不存在', { worldbookId, entryId })
    const normalized = normalizeWorldbookEntry(readResult.value, { worldbookId })
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.INVALID_INPUT, '条目数据形状无效', { worldbookId, entryId })
  }

  function create(worldbookId, input = {}) {
    if (!nonEmptyId(worldbookId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'worldbookId 必填')
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return fail(CORE_ERROR_CODES.INVALID_INPUT, '条目输入必须是对象')
    }
    const record = createWorldbookEntry({
      id: nonEmptyId(input.id) ? input.id.trim() : idFactory(),
      worldbookId,
      name: input.name,
      content: input.content,
      now: now(),
      extra: input.extra && typeof input.extra === 'object' ? input.extra : {}
    })
    if (!record) return fail(CORE_ERROR_CODES.INVALID_INPUT, '条目 id 无效')
    const created = store.create(worldbookId, record)
    if (!created.ok) return created
    const normalized = normalizeWorldbookEntry(created.value, { worldbookId })
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的条目形状无效')
  }

  function update(worldbookId, entryId, input = {}) {
    if (!nonEmptyId(worldbookId) || !nonEmptyId(entryId)) {
      return fail(CORE_ERROR_CODES.INVALID_INPUT, 'worldbookId 与 entryId 必填')
    }
    const validated = validateWorldbookEntryPatch(input)
    if (!validated.ok) return validated
    const updated = store.update(worldbookId, entryId, validated.value)
    if (!updated.ok) return updated
    const normalized = normalizeWorldbookEntry(updated.value, { worldbookId })
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的条目形状无效')
  }

  function remove(worldbookId, entryId) {
    if (!nonEmptyId(worldbookId) || !nonEmptyId(entryId)) {
      return fail(CORE_ERROR_CODES.INVALID_INPUT, 'worldbookId 与 entryId 必填')
    }
    return store.remove(worldbookId, entryId)
  }

  return Object.freeze({ list, read, create, update, remove })
}
