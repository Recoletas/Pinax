import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import { normalizeNote } from '../domain/note.js'

/**
 * 内存 NoteStore:用于 Core 合同测试与 Host 适配器对照,不是生产存储。
 * 扁平列表,新笔记插入到最前(与宿主 prependWritingNote 的“最新在前”一致)。
 */
export function createMemoryNoteStore({ notes = [] } = {}) {
  const state = Array.isArray(notes) ? [...notes] : []

  function indexOf(noteId) {
    return state.findIndex((note) => String(note?.id) === String(noteId))
  }

  return {
    list() {
      return ok(state.map((note) => normalizeNote(note)).filter(Boolean))
    },

    read(noteId) {
      const index = indexOf(noteId)
      return ok(index < 0 ? null : normalizeNote(state[index]))
    },

    create(note) {
      const record = normalizeNote(note)
      if (!record) return fail(CORE_ERROR_CODES.INVALID_INPUT, '笔记形状无效')
      if (indexOf(record.id) >= 0) return fail(CORE_ERROR_CODES.DUPLICATE_NOTE, '笔记已存在', { noteId: record.id })
      state.unshift(record)
      return ok(record)
    },

    update(noteId, note) {
      const index = indexOf(noteId)
      if (index < 0) return fail(CORE_ERROR_CODES.NOTE_NOT_FOUND, '笔记不存在', { noteId })
      const record = normalizeNote(note)
      if (!record) return fail(CORE_ERROR_CODES.INVALID_INPUT, '笔记形状无效')
      state[index] = record
      return ok(record)
    },

    remove(noteId) {
      const index = indexOf(noteId)
      if (index < 0) return fail(CORE_ERROR_CODES.NOTE_NOT_FOUND, '笔记不存在', { noteId })
      const [removed] = state.splice(index, 1)
      return ok(normalizeNote(removed))
    },

    snapshot() {
      return state
    }
  }
}
