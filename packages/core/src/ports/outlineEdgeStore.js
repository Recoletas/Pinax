/**
 * OutlineEdgeStore 是大纲边业务与存储之间的边界(与 OutlineNodeStore 平级)。
 *
 * 约束:
 * - 所有方法返回 `{ ok, value }` 或 `{ ok:false, error }`;
 * - `add` 撞同 id 或同 (kind,from,to) → DUPLICATE_OUTLINE_EDGE;`remove` 找不到 → OUTLINE_EDGE_NOT_FOUND;
 * - 端点是否指向存在节点由 Host/上层决定,本端口不跨表校验;Store 不依赖 Vue/DOM/Electron/Capacitor/Node fs。
 *
 * @typedef {Object} OutlineEdgeStore
 * @property {(bookId: string) => Promise<{ok: boolean, value?: object[], error?: object}>} list
 * @property {(bookId: string, edge: object) => Promise<{ok: boolean, value?: object, error?: object}>} add
 * @property {(bookId: string, edgeId: string) => Promise<{ok: boolean, value?: object, error?: object}>} remove
 */

export const OUTLINE_EDGE_STORE_METHODS = Object.freeze(['list', 'add', 'remove'])

export function isOutlineEdgeStore(candidate) {
  return Boolean(candidate) && OUTLINE_EDGE_STORE_METHODS.every((name) => typeof candidate[name] === 'function')
}
