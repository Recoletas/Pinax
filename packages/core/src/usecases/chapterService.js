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
 * 章节业务用例。Host 只负责把 Store 与平台能力注入；标题、内容、修订号、
 * 错误语义都在这里决定，三端不得自行复制。
 */
export function createChapterService({
  store,
  now = () => new Date().toISOString(),
  idFactory = defaultIdFactory
} = {}) {
  if (!isChapterStore(store)) throw new TypeError('createChapterService 需要实现 list/read/create/update 的 ChapterStore')

  async function list(bookId) {
    if (!nonEmptyId(bookId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 必填')
    const listed = await store.list(bookId)
    if (!listed.ok) return listed
    const chapters = (Array.isArray(listed.value) ? listed.value : [])
      .map((chapter) => normalizeChapterRecord(chapter, { bookId }))
      .filter(Boolean)
    return ok(chapters.map(chapterSummary))
  }

  async function read(bookId, chapterId) {
    if (!nonEmptyId(bookId) || !nonEmptyId(chapterId)) {
      return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 与 chapterId 必填')
    }
    const readResult = await store.read(bookId, chapterId)
    if (!readResult.ok) return readResult
    if (!readResult.value) return fail(CORE_ERROR_CODES.CHAPTER_NOT_FOUND, '章节不存在', { bookId, chapterId })
    const normalized = normalizeChapterRecord(readResult.value, { bookId })
    return normalized
      ? ok(normalized)
      : fail(CORE_ERROR_CODES.INVALID_INPUT, '章节数据形状无效', { bookId, chapterId })
  }

  async function create(bookId, input = {}) {
    if (!nonEmptyId(bookId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 必填')
    if (input && typeof input !== 'object') return fail(CORE_ERROR_CODES.INVALID_INPUT, '章节输入必须是对象')
    const chapter = createChapterRecord({
      id: nonEmptyId(input.id) ? input.id.trim() : idFactory(),
      title: input.title,
      content: input.content,
      editorDocument: input.editorDocument,
      now: now(),
      extra: input.extra && typeof input.extra === 'object' ? input.extra : {}
    })
    if (!chapter) return fail(CORE_ERROR_CODES.INVALID_INPUT, '章节 id 无效')
    const created = await store.create(bookId, chapter)
    if (!created.ok) return created
    const normalized = normalizeChapterRecord(created.value, { bookId })
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的章节形状无效')
  }

  async function save(bookId, chapterId, input = {}) {
    if (!nonEmptyId(bookId) || !nonEmptyId(chapterId)) {
      return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 与 chapterId 必填')
    }
    const validated = validateChapterSaveInput(input)
    if (!validated.ok) return validated
    const updated = await store.update(bookId, chapterId, validated.value.patch, {
      expectedRevision: validated.value.expectedRevision
    })
    if (!updated.ok) return updated
    const normalized = normalizeChapterRecord(updated.value, { bookId })
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的章节形状无效')
  }

  async function remove(bookId, chapterId, { expectedRevision } = {}) {
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
