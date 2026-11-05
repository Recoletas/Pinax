import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import { createWorldbookEntry, normalizeWorldbookEntry, worldbookEntrySummary } from '../domain/worldbookEntry.js'
import { isWorldbookEntryStore } from '../ports/worldbookEntryStore.js'

function nonEmptyId(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function defaultIdFactory() {
  return `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 世界书条目更新输入的归一化:name 去空白、content 必须是字符串,且二者至少给一个。
 * 富字段(injection.group/category/tags…)由宿主直接走 Store.update 之外的通道,不经此校验。
 */
export function validateWorldbookEntryPatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return fail(CORE_ERROR_CODES.INVALID_INPUT, '条目更新输入必须是对象')
  }
  const hasName = Object.prototype.hasOwnProperty.call(input, 'name')
  const hasContent = Object.prototype.hasOwnProperty.call(input, 'content')
  if (!hasName && !hasContent) {
    return fail(CORE_ERROR_CODES.INVALID_INPUT, '至少要提供 name 或 content')
  }
  const patch = {}
  if (hasName) {
    if (typeof input.name !== 'string') return fail(CORE_ERROR_CODES.INVALID_INPUT, 'name 必须是字符串')
    patch.name = input.name.trim()
  }
  if (hasContent) {
    if (typeof input.content !== 'string') return fail(CORE_ERROR_CODES.INVALID_INPUT, 'content 必须是字符串')
    patch.content = input.content
  }
  return ok(patch)
}

/**
 * 世界书条目业务用例(异步)。id/name/content、重名/重 id、缺条目、更新校验都在这里决定,三端不复制。
 */
export function createWorldbookEntryService({
  store,
  now = () => new Date().toISOString(),
  idFactory = defaultIdFactory
} = {}) {
  if (!isWorldbookEntryStore(store)) throw new TypeError('createWorldbookEntryService 需要实现 list/read/create/update/remove 的 WorldbookEntryStore')

  async function list(worldbookId) {
    if (!nonEmptyId(worldbookId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'worldbookId 必填')
    const listed = await store.list(worldbookId)
    if (!listed.ok) return listed
    const entries = (Array.isArray(listed.value) ? listed.value : [])
      .map((entry) => normalizeWorldbookEntry(entry, { worldbookId }))
      .filter(Boolean)
    return ok(entries.map(worldbookEntrySummary))
  }

  async function read(worldbookId, entryId) {
    if (!nonEmptyId(worldbookId) || !nonEmptyId(entryId)) {
      return fail(CORE_ERROR_CODES.INVALID_INPUT, 'worldbookId 与 entryId 必填')
    }
    const readResult = await store.read(worldbookId, entryId)
    if (!readResult.ok) return readResult
    if (!readResult.value) return fail(CORE_ERROR_CODES.ENTRY_NOT_FOUND, '条目不存在', { worldbookId, entryId })
    const normalized = normalizeWorldbookEntry(readResult.value, { worldbookId })
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.INVALID_INPUT, '条目数据形状无效', { worldbookId, entryId })
  }

  async function create(worldbookId, input = {}) {
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
    const created = await store.create(worldbookId, record)
    if (!created.ok) return created
    const normalized = normalizeWorldbookEntry(created.value, { worldbookId })
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的条目形状无效')
  }

  async function update(worldbookId, entryId, input = {}) {
    if (!nonEmptyId(worldbookId) || !nonEmptyId(entryId)) {
      return fail(CORE_ERROR_CODES.INVALID_INPUT, 'worldbookId 与 entryId 必填')
    }
    const validated = validateWorldbookEntryPatch(input)
    if (!validated.ok) return validated
    const updated = await store.update(worldbookId, entryId, validated.value)
    if (!updated.ok) return updated
    const normalized = normalizeWorldbookEntry(updated.value, { worldbookId })
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的条目形状无效')
  }

  async function remove(worldbookId, entryId) {
    if (!nonEmptyId(worldbookId) || !nonEmptyId(entryId)) {
      return fail(CORE_ERROR_CODES.INVALID_INPUT, 'worldbookId 与 entryId 必填')
    }
    return store.remove(worldbookId, entryId)
  }

  return Object.freeze({ list, read, create, update, remove })
}
