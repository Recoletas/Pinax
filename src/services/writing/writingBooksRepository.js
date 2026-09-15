// 书籍 repository（工作台标签计划 Task 1）：`writing_books` 的唯一读写边界。
// Authoring、Experience 写回和工作台标签解析器都通过这里访问书数据；
// 首期持久化真源仍是 localStorage 的 writing_books，repository 为后续桌面 adapter 留边界。
// 旧记录兼容：title 缺失时回退 legacy `name`（只读兼容，不删除原字段）。
import { STORAGE_KEYS, getItem, setItem } from '../../composables/useStorage'
import {
  mutationFailure,
  mutationSuccess,
  storageWriteFailure
} from '../storage/durableMutationResult'

let revision = 0
const revisionListeners = new Set()

function nextRevision() {
  revision += 1
  return revision
}

export function normalizeWritingBook(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = raw.id === undefined || raw.id === null ? '' : String(raw.id).trim()
  if (!id) return null
  const book = { ...raw, id }
  book.title = String(book.title ?? book.name ?? '').trim()
  book.description = String(book.description ?? '')
  book.worldbookId = String(book.worldbookId ?? '').trim()
  if (!book.createdAt) book.createdAt = new Date().toISOString()
  if (!Array.isArray(book.chapters)) book.chapters = []
  return book
}

export function loadWritingBooks() {
  const stored = getItem(STORAGE_KEYS.WRITING_BOOKS)
  if (!Array.isArray(stored)) return []
  return stored.map(normalizeWritingBook).filter(Boolean)
}

export function saveWritingBooksDurable(books) {
  if (!Array.isArray(books)) return mutationFailure('invalid-books')
  const ok = setItem(STORAGE_KEYS.WRITING_BOOKS, books)
  if (!ok) return storageWriteFailure({ resource: 'writing-books' })

  const currentRevision = nextRevision()
  for (const listener of revisionListeners) {
    try {
      listener({ revision: currentRevision, books })
    } catch {
      // 订阅方异常不阻断持久化。
    }
  }
  return mutationSuccess({ books, revision: currentRevision })
}

// 兼容旧页面：新代码应使用结果型 API，旧布尔调用不再自己写盘。
export function saveWritingBooks(books) {
  return saveWritingBooksDurable(books).ok
}

export function findWritingBook(books, bookId) {
  if (!Array.isArray(books) || bookId === undefined || bookId === null || bookId === '') return null
  const wanted = String(bookId)
  return books.find((book) => String(book.id) === wanted) || null
}

export function createWritingBookRecord({ title, description = '', worldbookId = '' } = {}) {
  const now = new Date().toISOString()
  return {
    id: Date.now().toString(),
    title: String(title || '').trim(),
    description: String(description || '').trim(),
    worldbookId: String(worldbookId || '').trim(),
    createdAt: now,
    updatedAt: now,
    chapters: []
  }
}

// 仓储级读改写：外部 surface（标签解析器、Experience 写回）不持有页面内存数组时使用。
// 页面内（Authoring）继续持有同一数组就地修改后交给结果型写盘边界，避免双写竞争。
export function updateWritingBook(bookId, mutator) {
  const books = loadWritingBooks()
  const book = findWritingBook(books, bookId)
  if (!book) return mutationFailure('not-found')
  if (typeof mutator !== 'function') return mutationFailure('invalid-mutator')
  let patch
  try {
    patch = mutator(book)
  } catch {
    return mutationFailure('mutator-failed')
  }
  if (patch === false) return mutationFailure('mutator-rejected')
  if (patch && typeof patch === 'object' && patch !== book) {
    Object.assign(book, patch)
  }
  book.updatedAt = new Date().toISOString()
  const persisted = saveWritingBooksDurable(books)
  return persisted.ok
    ? mutationSuccess({ book, revision: persisted.revision })
    : persisted
}

export function renameWritingBook(bookId, title) {
  const nextTitle = String(title || '').trim()
  if (!nextTitle) return mutationFailure('empty-title')
  return updateWritingBook(bookId, () => ({ title: nextTitle }))
}

export function deleteWritingBook(bookId) {
  const books = loadWritingBooks()
  const removed = findWritingBook(books, bookId)
  if (!removed) return mutationFailure('not-found')
  const remaining = books.filter((book) => String(book.id) !== String(bookId))
  const persisted = saveWritingBooksDurable(remaining)
  return persisted.ok
    ? mutationSuccess({ book: removed, revision: persisted.revision })
    : persisted
}

export function subscribeWritingBooks(listener) {
  if (typeof listener !== 'function') return () => {}
  revisionListeners.add(listener)
  return () => revisionListeners.delete(listener)
}

export function currentWritingBooksRevision() {
  return revision
}
