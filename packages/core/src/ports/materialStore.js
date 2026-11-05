/**
 * MaterialStore 是资料(narrative asset)业务与存储之间的边界(扁平列表,按 projectId 归属)。
 *
 * 约束:
 * - 所有方法返回 `{ ok, value }` 或 `{ ok:false, error }`;
 * - `read` 找不到返回 `{ ok:true, value:null }`(Service 判 MATERIAL_NOT_FOUND);
 * - `create` 撞已有 id → DUPLICATE_MATERIAL;`update`/`remove` 找不到 → MATERIAL_NOT_FOUND;
 * - 无乐观并发(与宿主一致);内容哈希去重由 Service 用 list 比对,不在本端口;Store 不依赖平台 API。
 *
 * @typedef {Object} MaterialStore
 * @property {() => Promise<{ok: boolean, value?: object[], error?: object}>} list
 * @property {(materialId: string) => Promise<{ok: boolean, value?: object|null, error?: object}>} read
 * @property {(material: object) => Promise<{ok: boolean, value?: object, error?: object}>} create
 * @property {(materialId: string, material: object) => Promise<{ok: boolean, value?: object, error?: object}>} update
 * @property {(materialId: string) => Promise<{ok: boolean, value?: object, error?: object}>} remove
 */

export const MATERIAL_STORE_METHODS = Object.freeze(['list', 'read', 'create', 'update', 'remove'])

export function isMaterialStore(candidate) {
  return Boolean(candidate) && MATERIAL_STORE_METHODS.every((name) => typeof candidate[name] === 'function')
}
