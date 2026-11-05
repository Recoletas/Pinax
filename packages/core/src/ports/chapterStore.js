/**
 * ChapterStore 是业务内核与具体存储之间的唯一边界。
 *
 * 约束：
 * - 所有方法返回 `{ ok, value }` 或 `{ ok:false, error }`；
 * - `update` 必须原子校验 expectedRevision，冲突时不得写入；
 * - Store 不依赖 Vue/DOM/Electron/Capacitor/Node fs。
 *
 * @typedef {Object} ChapterStore
 * @property {(bookId: string) => Promise<{ok: boolean, value?: object[], error?: object}>} list
 * @property {(bookId: string, chapterId: string) => Promise<{ok: boolean, value?: object|null, error?: object}>} read
 * @property {(bookId: string, chapter: object) => Promise<{ok: boolean, value?: object, error?: object}>} create
 * @property {(bookId: string, chapterId: string, patch: object, options: {expectedRevision: number}) => Promise<{ok: boolean, value?: object, error?: object}>} update
 * @property {(bookId: string, chapterId: string, options: {expectedRevision: number}) => Promise<{ok: boolean, value?: object, error?: object}>} remove
 */

export const CHAPTER_STORE_METHODS = Object.freeze(['list', 'read', 'create', 'update', 'remove'])

export function isChapterStore(candidate) {
  return Boolean(candidate) && CHAPTER_STORE_METHODS.every((name) => typeof candidate[name] === 'function')
}
