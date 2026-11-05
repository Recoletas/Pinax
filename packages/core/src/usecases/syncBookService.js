import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import { bookSummary, createBookRecord, normalizeBookRecord } from '../domain/book.js'
import { isBookStore } from '../ports/bookStore.js'

function nonEmptyId(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function defaultIdFactory() {
  return `book-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function textTitle(value) {
  return String(value ?? '').trim()
}

/**
 * 同步作品 Service:给 localStorage 这类同步存储的 Host 用(Web 当前形态)。
 * 与异步 createBookService 共用 domain、错误码与校验;移动端继续用异步版。要求 Store 返回普通结果。
 */
export function createSyncBookService({
  store,
  now = () => new Date().toISOString(),
  idFactory = defaultIdFactory
} = {}) {
  if (!isBookStore(store)) throw new TypeError('createSyncBookService 需要实现 list/read/create/rename/remove 的 BookStore')

  function list() {
    const listed = store.list()
    if (!listed.ok) return listed
    const books = (Array.isArray(listed.value) ? listed.value : []).map(normalizeBookRecord).filter(Boolean)
    return ok(books.map(bookSummary))
  }

  function read(bookId) {
    if (!nonEmptyId(bookId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 必填')
    const readResult = store.read(bookId)
    if (!readResult.ok) return readResult
    if (!readResult.value) return fail(CORE_ERROR_CODES.BOOK_NOT_FOUND, '作品不存在', { bookId })
    const normalized = normalizeBookRecord(readResult.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.INVALID_INPUT, '作品数据形状无效', { bookId })
  }

  function create(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return fail(CORE_ERROR_CODES.INVALID_INPUT, '作品输入必须是对象')
    }
    const record = createBookRecord({
      id: nonEmptyId(input.id) ? input.id.trim() : idFactory(),
      title: input.title,
      description: input.description,
      worldbookId: input.worldbookId,
      manuscriptLanguage: input.manuscriptLanguage,
      now: now(),
      extra: input.extra && typeof input.extra === 'object' ? input.extra : {}
    })
    if (!record) return fail(CORE_ERROR_CODES.INVALID_INPUT, '作品 id 无效')
    const created = store.create(record)
    if (!created.ok) return created
    const normalized = normalizeBookRecord(created.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的作品形状无效')
  }

  function rename(bookId, title) {
    if (!nonEmptyId(bookId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 必填')
    const nextTitle = textTitle(title)
    if (!nextTitle) return fail(CORE_ERROR_CODES.INVALID_INPUT, '书名不能为空', { bookId })
    const renamed = store.rename(bookId, nextTitle)
    if (!renamed.ok) return renamed
    const normalized = normalizeBookRecord(renamed.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的作品形状无效')
  }

  function remove(bookId) {
    if (!nonEmptyId(bookId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 必填')
    return store.remove(bookId)
  }

  return Object.freeze({ list, read, create, rename, remove })
}
