import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import { chapterSummary, createChapterRecord, normalizeChapterRecord } from '../domain/chapter.js'
import { isChapterStore } from '../ports/chapterStore.js'
import { validateChapterSaveInput } from './chapterSaveInput.js'

function nonEmptyId(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function defaultIdFactory() {
  return `chapter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 同步章节 Service：给 localStorage/内存这类同步存储的 Host 用（Web 当前形态）。
 * 与异步 createChapterService 共用 domain、错误码与保存校验；移动端继续用异步版。
 * 要求 Store 方法返回普通结果，不要返回 Promise。
 */
export function createSyncChapterService({
  store,
  now = () => new Date().toISOString(),
  idFactory = defaultIdFactory
} = {}) {
  if (!isChapterStore(store)) throw new TypeError('createSyncChapterService 需要实现 list/read/create/update 的 ChapterStore')

  function list(bookId) {
    if (!nonEmptyId(bookId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 必填')
    const listed = store.list(bookId)
    if (!listed.ok) return listed
    return ok((Array.isArray(listed.value) ? listed.value : [])
      .map((chapter) => normalizeChapterRecord(chapter, { bookId }))
      .filter(Boolean)
      .map(chapterSummary))
  }

  function read(bookId, chapterId) {
    if (!nonEmptyId(bookId) || !nonEmptyId(chapterId)) {
      return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 与 chapterId 必填')
    }
    const readResult = store.read(bookId, chapterId)
    if (!readResult.ok) return readResult
    if (!readResult.value) return fail(CORE_ERROR_CODES.CHAPTER_NOT_FOUND, '章节不存在', { bookId, chapterId })
    return ok(normalizeChapterRecord(readResult.value, { bookId }))
  }

  function create(bookId, input = {}) {
    if (!nonEmptyId(bookId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 必填')
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return fail(CORE_ERROR_CODES.INVALID_INPUT, '章节输入必须是对象')
    }
    const chapter = createChapterRecord({
      id: nonEmptyId(input.id) ? input.id.trim() : idFactory(),
      title: input.title,
      content: input.content,
      editorDocument: input.editorDocument,
      now: now(),
      extra: input.extra && typeof input.extra === 'object' ? input.extra : {}
    })
    if (!chapter) return fail(CORE_ERROR_CODES.INVALID_INPUT, '章节 id 无效')
    const created = store.create(bookId, chapter)
    if (!created.ok) return created
    return ok(normalizeChapterRecord(created.value, { bookId }))
  }

  function save(bookId, chapterId, input = {}) {
    if (!nonEmptyId(bookId) || !nonEmptyId(chapterId)) {
      return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 与 chapterId 必填')
    }
    const validated = validateChapterSaveInput(input)
    if (!validated.ok) return validated
    const updated = store.update(bookId, chapterId, validated.value.patch, {
      expectedRevision: validated.value.expectedRevision
    })
    if (!updated.ok) return updated
    return ok(normalizeChapterRecord(updated.value, { bookId }))
  }

  function remove(bookId, chapterId, { expectedRevision } = {}) {
    if (!nonEmptyId(bookId) || !nonEmptyId(chapterId)) {
      return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 与 chapterId 必填')
    }
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      return fail(CORE_ERROR_CODES.INVALID_INPUT, 'expectedRevision 必须是 ≥0 的整数', { expectedRevision })
    }
    return store.remove(bookId, chapterId, { expectedRevision })
  }

  return Object.freeze({ list, read, create, save, remove })
}
