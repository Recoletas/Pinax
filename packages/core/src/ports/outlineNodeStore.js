/**
 * OutlineNodeStore 是大纲节点业务与存储之间的边界,与 ChapterStore/BookStore 平级。
 *
 * 约束:
 * - 所有方法返回 `{ ok, value }` 或 `{ ok:false, error }`;
 * - `update`/`remove` 必须校验 expectedRevision,冲突时不得写入(STALE_REVISION);
 * - `read` 找不到返回 `{ ok:true, value:null }`(由 Service 判 OUTLINE_NODE_NOT_FOUND);
 * - `create` 撞已有 id 返回 DUPLICATE_OUTLINE_NODE;
 * - Store 不依赖 Vue/DOM/Electron/Capacitor/Node fs。换父级/边图不在本端口(后续切片)。
 *
 * @typedef {Object} OutlineNodeStore
 * @property {(bookId: string) => Promise<{ok: boolean, value?: object[], error?: object}>} list
 * @property {(bookId: string, nodeId: string) => Promise<{ok: boolean, value?: object|null, error?: object}>} read
 * @property {(bookId: string, node: object) => Promise<{ok: boolean, value?: object, error?: object}>} create
 * @property {(bookId: string, nodeId: string, patch: object, options: {expectedRevision: number}) => Promise<{ok: boolean, value?: object, error?: object}>} update
 * @property {(bookId: string, nodeId: string, changes: {parentId?: string|null, order?: number}, options: {expectedRevision: number}) => Promise<{ok: boolean, value?: object, error?: object}>} move
 * @property {(bookId: string, nodeId: string, options: {expectedRevision: number}) => Promise<{ok: boolean, value?: object, error?: object}>} remove
 */

export const OUTLINE_NODE_STORE_METHODS = Object.freeze(['list', 'read', 'create', 'update', 'move', 'remove'])

export function isOutlineNodeStore(candidate) {
  return Boolean(candidate) && OUTLINE_NODE_STORE_METHODS.every((name) => typeof candidate[name] === 'function')
}
