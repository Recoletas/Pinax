import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import { normalizeBookRecord } from '../domain/book.js'

/**
 * 内存 BookStore:用于 Core 合同测试与 Host 适配器对照,不是生产存储。
 */
export function createMemoryBookStore({ books = new Map() } = {}) {
  const state = books instanceof Map ? books : new Map(Object.entries(books || {}))

  function find(bookId) {
    return state.get(String(bookId)) || null
  }

  return {
    list() {
      return ok([...state.values()].map((book) => normalizeBookRecord(book)).filter(Boolean))
    },

    read(bookId) {
      return ok(find(bookId))
    },

    create(book) {
      const record = normalizeBookRecord(book)
      if (!record) return fail(CORE_ERROR_CODES.INVALID_INPUT, '作品形状无效')
      if (state.has(record.id)) {
        return fail(CORE_ERROR_CODES.DUPLICATE_BOOK, '作品已存在', { bookId: record.id })
      }
      state.set(record.id, record)
      return ok(record)
    },

    rename(bookId, title) {
      const book = find(bookId)
      if (!book) return fail(CORE_ERROR_CODES.BOOK_NOT_FOUND, '作品不存在', { bookId })
      const updated = { ...book, title: String(title ?? '').trim(), updatedAt: new Date().toISOString() }
      state.set(String(bookId), updated)
      return ok(updated)
    },

    remove(bookId) {
      const book = find(bookId)
      if (!book) return fail(CORE_ERROR_CODES.BOOK_NOT_FOUND, '作品不存在', { bookId })
      state.delete(String(bookId))
      return ok(book)
    }
  }
}
