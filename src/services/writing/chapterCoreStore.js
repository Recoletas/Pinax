import {
  CORE_ERROR_CODES,
  CHAPTER_SIDECAR_KEYS,
  applyChapterPatch,
  chapterRevision,
  fail,
  normalizeChapterRecord,
  ok
} from '@pinax/core'
import { loadWritingBooks, saveWritingBooksDurable } from './writingBooksRepository.js'

function findBook(books, bookId) {
  return (Array.isArray(books) ? books : []).find((book) => String(book?.id) === String(bookId)) || null
}

function findChapter(book, chapterId) {
  return (Array.isArray(book?.chapters) ? book.chapters : [])
    .find((chapter) => String(chapter?.id) === String(chapterId)) || null
}

function saveFailure(saved) {
  return fail(CORE_ERROR_CODES.IO_FAILED, '章节保存失败', saved?.error ?? null)
}

/**
 * Web/浏览器侧的 ChapterStore 适配器。
 * 业务规则不在这里：这里只把 Core 的章节读写映射到现有 writing_books 仓库。
 * 旧数据没有独立的 chapter.revision 时，沿用 editorDocument.revision；
 * content-only 保存会清掉旧的结构化侧车，避免旧 editorDocument 盖住新正文。
 */
export function createBrowserChapterStore({
  loadBooks = loadWritingBooks,
  saveBooks = saveWritingBooksDurable
} = {}) {
  function persistMutation(book, mutate, undo, value) {
    const updatedAt = book.updatedAt
    const restore = () => {
      undo()
      if (updatedAt === undefined) delete book.updatedAt
      else book.updatedAt = updatedAt
    }
    try {
      mutate()
      const saved = saveBooks(value.books)
      if (!saved?.ok) { restore(); return saveFailure(saved) }
      return ok(value.record())
    } catch (error) { restore(); return saveFailure({ error: String(error?.message || error) }) }
  }
  return {
    list(bookId) {
      const book = findBook(loadBooks(), bookId)
      if (!book) return fail(CORE_ERROR_CODES.BOOK_NOT_FOUND, '作品不存在', { bookId })
      return ok((Array.isArray(book.chapters) ? book.chapters : [])
        .map((chapter) => normalizeChapterRecord(chapter, { bookId }))
        .filter(Boolean))
    },

    read(bookId, chapterId) {
      const book = findBook(loadBooks(), bookId)
      if (!book) return fail(CORE_ERROR_CODES.BOOK_NOT_FOUND, '作品不存在', { bookId })
      const chapter = findChapter(book, chapterId)
      return ok(chapter ? normalizeChapterRecord(chapter, { bookId }) : null)
    },

    create(bookId, chapter) {
      const books = loadBooks()
      const book = findBook(books, bookId)
      if (!book) return fail(CORE_ERROR_CODES.BOOK_NOT_FOUND, '作品不存在', { bookId })
      const record = normalizeChapterRecord(chapter, { bookId })
      if (!record) return fail(CORE_ERROR_CODES.INVALID_INPUT, '章节形状无效')
      if (findChapter(book, record.id)) {
        return fail(CORE_ERROR_CODES.DUPLICATE_CHAPTER, '章节已存在', { bookId, chapterId: record.id })
      }
      const previousList = book.chapters
      return persistMutation(book, () => {
        if (!Array.isArray(book.chapters)) book.chapters = []
        const stored = { ...record }; delete stored.bookId
        book.chapters.push(stored)
        book.updatedAt = record.updatedAt
      }, () => {
        if (Array.isArray(previousList)) previousList.pop()
        else book.chapters = previousList
      }, { books, record: () => record })
    },

    remove(bookId, chapterId, { expectedRevision } = {}) {
      const books = loadBooks()
      const book = findBook(books, bookId)
      if (!book) return fail(CORE_ERROR_CODES.BOOK_NOT_FOUND, '作品不存在', { bookId })
      const chapters = Array.isArray(book.chapters) ? book.chapters : []
      const index = chapters.findIndex((chapter) => String(chapter?.id) === String(chapterId))
      if (index < 0) return fail(CORE_ERROR_CODES.CHAPTER_NOT_FOUND, '章节不存在', { bookId, chapterId })
      const chapter = chapters[index]
      const actual = chapterRevision(chapter)
      if (actual !== expectedRevision) {
        return fail(CORE_ERROR_CODES.STALE_REVISION, '章节修订号已变化', { expected: expectedRevision, actual })
      }
      return persistMutation(book, () => {
        chapters.splice(index, 1)
        book.updatedAt = new Date().toISOString()
      }, () => chapters.splice(index, 0, chapter), { books, record: () => normalizeChapterRecord(chapter, { bookId }) })
    },

    update(bookId, chapterId, patch, { expectedRevision } = {}) {
      const books = loadBooks()
      const book = findBook(books, bookId)
      if (!book) return fail(CORE_ERROR_CODES.BOOK_NOT_FOUND, '作品不存在', { bookId })
      const chapter = findChapter(book, chapterId)
      if (!chapter) return fail(CORE_ERROR_CODES.CHAPTER_NOT_FOUND, '章节不存在', { bookId, chapterId })
      // 修订号、侧车清理、revision 递增与更新时间都在 Core 的 applyChapterPatch 决定。
      const result = applyChapterPatch(chapter, patch, { expectedRevision, now: new Date().toISOString() })
      if (!result.ok) return result
      const next = result.value
      const before = { ...chapter }
      return persistMutation(book, () => {
        for (const key of CHAPTER_SIDECAR_KEYS) if (!(key in next)) delete chapter[key]
        Object.assign(chapter, next)
        book.updatedAt = chapter.updatedAt
      }, () => {
        for (const key of Object.keys(chapter)) if (!(key in before)) delete chapter[key]
        Object.assign(chapter, before)
      }, { books, record: () => normalizeChapterRecord(chapter, { bookId }) })
    }
  }
}
