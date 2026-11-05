/**
 * WorldbookEntryStore 是世界书条目业务与存储之间的边界,与 ChapterStore/BookStore 平级。
 *
 * 约束:
 * - 所有方法返回 `{ ok, value }` 或 `{ ok:false, error }`;
 * - `read` 找不到返回 `{ ok:true, value:null }`(由 Service 判 ENTRY_NOT_FOUND);
 * - `create` 撞已有 id 返回 DUPLICATE_ENTRY(可自动建世界书容器);
 * - `update` 至少改一个字段并刷新 updatedAt,保留宿主富字段;`remove` 找不到返回 ENTRY_NOT_FOUND;
 * - 条目不带乐观并发修订号(与宿主现状一致);Store 不依赖 Vue/DOM/Electron/Capacitor/Node fs。
 *
 * @typedef {Object} WorldbookEntryStore
 * @property {(worldbookId: string) => Promise<{ok: boolean, value?: object[], error?: object}>} list
 * @property {(worldbookId: string, entryId: string) => Promise<{ok: boolean, value?: object|null, error?: object}>} read
 * @property {(worldbookId: string, entry: object) => Promise<{ok: boolean, value?: object, error?: object}>} create
 * @property {(worldbookId: string, entryId: string, patch: object) => Promise<{ok: boolean, value?: object, error?: object}>} update
 * @property {(worldbookId: string, entryId: string) => Promise<{ok: boolean, value?: object, error?: object}>} remove
 */

export const WORLDBOOK_ENTRY_STORE_METHODS = Object.freeze(['list', 'read', 'create', 'update', 'remove'])

export function isWorldbookEntryStore(candidate) {
  return Boolean(candidate) && WORLDBOOK_ENTRY_STORE_METHODS.every((name) => typeof candidate[name] === 'function')
}
