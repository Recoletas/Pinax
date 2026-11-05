import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import { createNote, normalizeNote, updateNote } from '../domain/note.js'
import { isNoteStore } from '../ports/noteStore.js'

function nonEmptyId(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function defaultIdFactory() {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function noteSummary(note) {
  return { id: note.id, title: note.title, wordCount: note.wordCount, updatedAt: note.updatedAt }
}

/**
 * 笔记更新输入的清洗:只认 title/content 两个可写字段,至少给一个;正文不能为空。
 * content 为 undefined=不改,给出则 trim;空正文拒绝(素材内容不能为空)。
 */
export function buildNoteUpdatePatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return fail(CORE_ERROR_CODES.INVALID_INPUT, '笔记更新输入必须是对象')
  }
  const hasTitle = Object.prototype.hasOwnProperty.call(input, 'title')
  const hasContent = Object.prototype.hasOwnProperty.call(input, 'content')
  if (!hasTitle && !hasContent) return fail(CORE_ERROR_CODES.INVALID_INPUT, '至少要提供 title 或 content')
  const patch = {}
  if (hasTitle) {
    if (typeof input.title !== 'string') return fail(CORE_ERROR_CODES.INVALID_INPUT, 'title 必须是字符串')
    patch.title = input.title.trim()
  }
  if (hasContent) {
    if (typeof input.content !== 'string') return fail(CORE_ERROR_CODES.INVALID_INPUT, 'content 必须是字符串')
    const content = input.content.trim()
    if (!content) return fail(CORE_ERROR_CODES.INVALID_INPUT, '素材内容不能为空')
    patch.content = content
  }
  return ok(patch)
}

/**
 * 笔记业务用例(异步)。字数口径、标题回退、非空正文、去重都在这里,三端共用一份。
 */
export function createNoteService({ store, now = () => new Date().toISOString(), idFactory = defaultIdFactory } = {}) {
  if (!isNoteStore(store)) throw new TypeError('createNoteService 需要实现 list/read/create/update/remove 的 NoteStore')

  async function list() {
    const listed = await store.list()
    if (!listed.ok) return listed
    const notes = (Array.isArray(listed.value) ? listed.value : []).map(normalizeNote).filter(Boolean)
    return ok(notes.map(noteSummary))
  }

  async function read(noteId) {
    if (!nonEmptyId(noteId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'noteId 必填')
    const result = await store.read(noteId)
    if (!result.ok) return result
    if (!result.value) return fail(CORE_ERROR_CODES.NOTE_NOT_FOUND, '笔记不存在', { noteId })
    const normalized = normalizeNote(result.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.INVALID_INPUT, '笔记数据形状无效', { noteId })
  }

  async function create(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(CORE_ERROR_CODES.INVALID_INPUT, '笔记输入必须是对象')
    const content = String(input.content ?? '').trim()
    if (!content) return fail(CORE_ERROR_CODES.INVALID_INPUT, '素材内容不能为空')
    const note = createNote({
      id: nonEmptyId(input.id) ? input.id.trim() : idFactory(),
      title: input.title,
      content,
      contentFormat: input.contentFormat,
      wordCount: input.wordCount,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      source: input.source,
      extra: input.extra,
      now: now()
    })
    if (!note) return fail(CORE_ERROR_CODES.INVALID_INPUT, '笔记 id 无效')
    const created = await store.create(note)
    if (!created.ok) return created
    const normalized = normalizeNote(created.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的笔记形状无效')
  }

  async function update(noteId, input = {}) {
    if (!nonEmptyId(noteId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'noteId 必填')
    const patch = buildNoteUpdatePatch(input)
    if (!patch.ok) return patch
    const current = await store.read(noteId)
    if (!current.ok) return current
    if (!current.value) return fail(CORE_ERROR_CODES.NOTE_NOT_FOUND, '笔记不存在', { noteId })
    const next = updateNote(normalizeNote(current.value), patch.value, { now: now() })
    const updated = await store.update(noteId, next)
    if (!updated.ok) return updated
    const normalized = normalizeNote(updated.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的笔记形状无效')
  }

  async function remove(noteId) {
    if (!nonEmptyId(noteId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'noteId 必填')
    return store.remove(noteId)
  }

  return Object.freeze({ list, read, create, update, remove })
}
