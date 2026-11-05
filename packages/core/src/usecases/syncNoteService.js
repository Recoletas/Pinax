import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import { createNote, normalizeNote, updateNote } from '../domain/note.js'
import { isNoteStore } from '../ports/noteStore.js'
import { buildNoteUpdatePatch } from './noteService.js'

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
 * 同步笔记 Service:给 localStorage 这类同步存储的 Host 用。与异步版共用 domain、字数/标题规则与校验。
 */
export function createSyncNoteService({ store, now = () => new Date().toISOString(), idFactory = defaultIdFactory } = {}) {
  if (!isNoteStore(store)) throw new TypeError('createSyncNoteService 需要实现 list/read/create/update/remove 的 NoteStore')

  function list() {
    const listed = store.list()
    if (!listed.ok) return listed
    const notes = (Array.isArray(listed.value) ? listed.value : []).map(normalizeNote).filter(Boolean)
    return ok(notes.map(noteSummary))
  }

  function read(noteId) {
    if (!nonEmptyId(noteId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'noteId 必填')
    const result = store.read(noteId)
    if (!result.ok) return result
    if (!result.value) return fail(CORE_ERROR_CODES.NOTE_NOT_FOUND, '笔记不存在', { noteId })
    const normalized = normalizeNote(result.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.INVALID_INPUT, '笔记数据形状无效', { noteId })
  }

  function create(input = {}) {
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
    const created = store.create(note)
    if (!created.ok) return created
    const normalized = normalizeNote(created.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的笔记形状无效')
  }

  function update(noteId, input = {}) {
    if (!nonEmptyId(noteId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'noteId 必填')
    const patch = buildNoteUpdatePatch(input)
    if (!patch.ok) return patch
    const current = store.read(noteId)
    if (!current.ok) return current
    if (!current.value) return fail(CORE_ERROR_CODES.NOTE_NOT_FOUND, '笔记不存在', { noteId })
    const next = updateNote(normalizeNote(current.value), patch.value, { now: now() })
    const updated = store.update(noteId, next)
    if (!updated.ok) return updated
    const normalized = normalizeNote(updated.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的笔记形状无效')
  }

  function remove(noteId) {
    if (!nonEmptyId(noteId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'noteId 必填')
    return store.remove(noteId)
  }

  return Object.freeze({ list, read, create, update, remove })
}
