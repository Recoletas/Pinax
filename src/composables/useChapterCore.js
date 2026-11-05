import { chapterRevision, createChapterService, createSyncChapterService } from '@pinax/core'
import { createBrowserChapterStore } from '../services/writing/chapterCoreStore.js'

/**
 * Web 的章节 Core 接入点：把页面级 books/chapters 作为 Store 的工作集，
 * 保存仍走既有 saveBooks（它会合并 fresh 探索/大纲并写 localStorage）。
 * 业务创建/修订/错误语义在独立 @pinax/core 包，不在页面里复制。
 *
 * 创建仍用异步 Service；Web 页面保存是同步布尔返回，因此保存走与异步版
 * 共用同一套校验/domain 的 createSyncChapterService。
 */
export function useChapterCore({ books, chapters, saveBooks }) {
  function store() {
    return createBrowserChapterStore({
      loadBooks: () => books.value,
      saveBooks: (nextBooks) => {
        books.value = nextBooks
        return saveBooks()
          ? { ok: true, value: { books: nextBooks } }
          : { ok: false, error: { code: 'IO_FAILED', message: '章节保存失败' } }
      }
    })
  }

  function service() {
    return createChapterService({
      store: store(),
      idFactory: () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    })
  }

  function syncService() {
    return createSyncChapterService({ store: store() })
  }

  function listChapters(bookId) {
    return syncService().list(bookId)
  }

  function readChapter(bookId, chapterId) {
    return syncService().read(bookId, chapterId)
  }

  async function createChapter(bookId) {
    if (!bookId) return { ok: false, error: { code: 'INVALID_INPUT', message: 'bookId 必填' } }
    const book = books.value.find((item) => String(item?.id) === String(bookId))
    if (!book) return { ok: false, error: { code: 'BOOK_NOT_FOUND', message: '作品不存在' } }
    const before = chapters.value.slice()
    book.chapters = chapters.value
    const created = await service().create(bookId, {
      title: '',
      content: '',
      extra: { contentFormat: 'md', outlineItems: [], wordCount: 0 }
    })
    if (!created.ok) {
      chapters.value = before
      book.chapters = chapters.value
      return created
    }
    return created
  }

  /**
   * 同步保存当前章。调用方必须传入保存前捕获的 expectedRevision；
   * preservePageOutline 走原 saveBooks 的 preserve 分支，不经过 Core 保存。
   */
  function saveChapter({ bookId, chapter, expectedRevision, preservePageOutline = false } = {}) {
    if (!bookId || !chapter) return false
    const book = books.value.find((item) => String(item?.id) === String(bookId))
    if (!book) return false
    book.chapters = chapters.value
    if (preservePageOutline) {
      book.updatedAt = new Date().toISOString()
      return saveBooks({ preserveOutlineBookId: bookId })
    }
    if (chapterRevision(chapter) !== expectedRevision) return false
    return syncService().save(bookId, chapter.id, {
      title: chapter.title,
      content: chapter.content,
      editorDocument: chapter.editorDocument,
      expectedRevision
    }).ok
  }

  function removeChapter({ bookId, chapterId, expectedRevision } = {}) {
    if (!bookId || !chapterId) return false
    return syncService().remove(bookId, chapterId, { expectedRevision }).ok
  }

  return Object.freeze({ listChapters, readChapter, createChapter, saveChapter, removeChapter, revisionOf: chapterRevision })
}
