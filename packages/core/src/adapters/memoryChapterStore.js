import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import { chapterRevision, normalizeChapterRecord } from '../domain/chapter.js'
import { applyChapterPatch } from '../domain/chapterPatch.js'

/**
 * 内存 ChapterStore：用于 Core 合同测试与 Host 适配器对照，不是生产存储。
 */
export function createMemoryChapterStore({ books = new Map() } = {}) {
  const state = books instanceof Map ? books : new Map(Object.entries(books || {}))

  function chaptersOf(bookId) {
    const key = String(bookId)
    if (!state.has(key)) state.set(key, [])
    return state.get(key)
  }

  function findChapter(bookId, chapterId) {
    return chaptersOf(bookId).find((chapter) => String(chapter?.id) === String(chapterId)) || null
  }

  return {
    list(bookId) {
      if (!state.has(String(bookId))) return fail(CORE_ERROR_CODES.BOOK_NOT_FOUND, '作品不存在', { bookId })
      return ok(chaptersOf(bookId).map((chapter) => normalizeChapterRecord(chapter, { bookId })).filter(Boolean))
    },

    read(bookId, chapterId) {
      if (!state.has(String(bookId))) return fail(CORE_ERROR_CODES.BOOK_NOT_FOUND, '作品不存在', { bookId })
      const chapter = findChapter(bookId, chapterId)
      return ok(chapter ? normalizeChapterRecord(chapter, { bookId }) : null)
    },

    create(bookId, chapter) {
      const key = String(bookId)
      const record = normalizeChapterRecord(chapter, { bookId: key })
      if (!record) return fail(CORE_ERROR_CODES.INVALID_INPUT, '章节形状无效')
      if (findChapter(key, record.id)) {
        return fail(CORE_ERROR_CODES.DUPLICATE_CHAPTER, '章节已存在', { bookId: key, chapterId: record.id })
      }
      state.set(key, [...chaptersOf(key), record])
      return ok(record)
    },

    update(bookId, chapterId, patch, { expectedRevision } = {}) {
      const key = String(bookId)
      if (!state.has(key)) return fail(CORE_ERROR_CODES.BOOK_NOT_FOUND, '作品不存在', { bookId: key })
      const chapters = chaptersOf(key)
      const index = chapters.findIndex((chapter) => String(chapter?.id) === String(chapterId))
      if (index < 0) return fail(CORE_ERROR_CODES.CHAPTER_NOT_FOUND, '章节不存在', { bookId: key, chapterId })
      // 保存语义与 Host 适配器共用 Core 的 applyChapterPatch，避免参照实现漂移。
      const result = applyChapterPatch(chapters[index], patch, { expectedRevision, now: new Date().toISOString() })
      if (!result.ok) return result
      chapters[index] = result.value
      return ok(normalizeChapterRecord(result.value, { bookId: key }))
    },

    remove(bookId, chapterId, { expectedRevision } = {}) {
      const key = String(bookId)
      if (!state.has(key)) return fail(CORE_ERROR_CODES.BOOK_NOT_FOUND, '作品不存在', { bookId: key })
      const chapters = chaptersOf(key)
      const index = chapters.findIndex((chapter) => String(chapter?.id) === String(chapterId))
      if (index < 0) return fail(CORE_ERROR_CODES.CHAPTER_NOT_FOUND, '章节不存在', { bookId: key, chapterId })
      const actual = chapterRevision(chapters[index])
      if (actual !== expectedRevision) {
        return fail(CORE_ERROR_CODES.STALE_REVISION, '章节修订号已变化', { expected: expectedRevision, actual })
      }
      const [removed] = chapters.splice(index, 1)
      return ok(normalizeChapterRecord(removed, { bookId: key }))
    },

    snapshot(bookId) {
      return state.get(String(bookId)) || []
    }
  }
}
