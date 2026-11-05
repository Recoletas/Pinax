/**
 * NoteStore 是笔记业务与存储之间的边界(扁平列表,不分书)。
 *
 * 约束:
 * - 所有方法返回 `{ ok, value }` 或 `{ ok:false, error }`;
 * - `read` 找不到返回 `{ ok:true, value:null }`(由 Service 判 NOTE_NOT_FOUND);
 * - `create` 撞已有 id → DUPLICATE_NOTE;`update`/`remove` 找不到 → NOTE_NOT_FOUND;
 * - 笔记无乐观并发(与宿主现状一致);Store 不依赖 Vue/DOM/Electron/Capacitor/Node fs。
 *
 * @typedef {Object} NoteStore
 * @property {() => Promise<{ok: boolean, value?: object[], error?: object}>} list
 * @property {(noteId: string) => Promise<{ok: boolean, value?: object|null, error?: object}>} read
 * @property {(note: object) => Promise<{ok: boolean, value?: object, error?: object}>} create
 * @property {(noteId: string, note: object) => Promise<{ok: boolean, value?: object, error?: object}>} update
 * @property {(noteId: string) => Promise<{ok: boolean, value?: object, error?: object}>} remove
 */

export const NOTE_STORE_METHODS = Object.freeze(['list', 'read', 'create', 'update', 'remove'])

export function isNoteStore(candidate) {
  return Boolean(candidate) && NOTE_STORE_METHODS.every((name) => typeof candidate[name] === 'function')
}
