/**
 * BookStore 是作品(书)级业务与具体存储之间的边界,与 ChapterStore 平级。
 *
 * 约束:
 * - 所有方法返回 `{ ok, value }` 或 `{ ok:false, error }`;
 * - `read` 找不到时返回 `{ ok:true, value:null }`(是否存在由 Service 判定 BOOK_NOT_FOUND);
 * - `create` 撞已有 id 返回 DUPLICATE_BOOK;`rename`/`remove` 找不到返回 BOOK_NOT_FOUND;
 * - Store 不依赖 Vue/DOM/Electron/Capacitor/Node fs。
 *
 * @typedef {Object} BookStore
 * @property {() => Promise<{ok: boolean, value?: object[], error?: object}>} list
 * @property {(bookId: string) => Promise<{ok: boolean, value?: object|null, error?: object}>} read
 * @property {(book: object) => Promise<{ok: boolean, value?: object, error?: object}>} create
 * @property {(bookId: string, title: string) => Promise<{ok: boolean, value?: object, error?: object}>} rename
 * @property {(bookId: string) => Promise<{ok: boolean, value?: object, error?: object}>} remove
 */

export const BOOK_STORE_METHODS = Object.freeze(['list', 'read', 'create', 'rename', 'remove'])

export function isBookStore(candidate) {
  return Boolean(candidate) && BOOK_STORE_METHODS.every((name) => typeof candidate[name] === 'function')
}
