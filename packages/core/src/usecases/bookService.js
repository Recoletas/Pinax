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

/**
 * 作品级业务用例(异步,供移动/文件端)。标题、空标题策略、重名、删除语义都在这里决定,
 * 三端不得自行复制。Host 只把 BookStore 注入进来。
 */
export function createBookService({
  store,
  now = () => new Date().toISOString(),
  idFactory = defaultIdFactory
} = {}) {
  if (!isBookStore(store)) throw new TypeError('createBookService 需要实现 list/read/create/rename/remove 的 BookStore')

  async function list() {
    const listed = await store.list()
    if (!listed.ok) return listed
    const books = (Array.isArray(listed.value) ? listed.value : [])
      .map(normalizeBookRecord)
      .filter(Boolean)
    return ok(books.map(bookSummary))
  }

  async function read(bookId) {
    if (!nonEmptyId(bookId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 必填')
    const readResult = await store.read(bookId)
    if (!readResult.ok) return readResult
    if (!readResult.value) return fail(CORE_ERROR_CODES.BOOK_NOT_FOUND, '作品不存在', { bookId })
    const normalized = normalizeBookRecord(readResult.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.INVALID_INPUT, '作品数据形状无效', { bookId })
  }

  async function create(input = {}) {
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
    const created = await store.create(record)
    if (!created.ok) return created
    const normalized = normalizeBookRecord(created.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的作品形状无效')
  }

  async function rename(bookId, title) {
    if (!nonEmptyId(bookId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 必填')
    const nextTitle = textTitle(title)
    if (!nextTitle) return fail(CORE_ERROR_CODES.INVALID_INPUT, '书名不能为空', { bookId })
    const renamed = await store.rename(bookId, nextTitle)
    if (!renamed.ok) return renamed
    const normalized = normalizeBookRecord(renamed.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的作品形状无效')
  }

  async function remove(bookId) {
    if (!nonEmptyId(bookId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 必填')
    return store.remove(bookId)
  }

  return Object.freeze({ list, read, create, rename, remove })
}

function textTitle(value) {
  return String(value ?? '').trim()
}
