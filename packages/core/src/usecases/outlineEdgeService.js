import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import { createOutlineEdge, normalizeOutlineEdge, outlineEdgeSummary } from '../domain/outlineEdge.js'
import { isOutlineEdgeStore } from '../ports/outlineEdgeStore.js'
import { isOutlineNodeStore } from '../ports/outlineNodeStore.js'

function nonEmptyId(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function defaultIdFactory() {
  return `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

async function verifyEndpoints(nodeStore, bookId, edge) {
  if (!nodeStore) return ok(true)
  const [fromRes, toRes] = await Promise.all([
    nodeStore.read(bookId, edge.fromNodeId),
    nodeStore.read(bookId, edge.toNodeId)
  ])
  if (!fromRes.ok) return fromRes
  if (!toRes.ok) return toRes
  const missing = []
  if (!fromRes.value) missing.push(edge.fromNodeId)
  if (!toRes.value) missing.push(edge.toNodeId)
  if (missing.length > 0) {
    return fail(CORE_ERROR_CODES.OUTLINE_ENDPOINT_NOT_FOUND, '大纲边引用的节点不存在', {
      bookId,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      missingNodeIds: missing
    })
  }
  return ok(true)
}

/**
 * 大纲边业务用例(异步)。自环/缺端点/缺 id 在 domain 判为无效;去重按 (kind,from,to) 与 id。
 * 当传入可选 `nodeStore` 时,跨表校验两端节点必须存在(否则返回 OUTLINE_ENDPOINT_NOT_FOUND)。
 */
export function createOutlineEdgeService({ store, nodeStore = null, idFactory = defaultIdFactory } = {}) {
  if (!isOutlineEdgeStore(store)) throw new TypeError('createOutlineEdgeService 需要实现 list/add/remove 的 OutlineEdgeStore')
  if (nodeStore !== null && !isOutlineNodeStore(nodeStore)) {
    throw new TypeError('createOutlineEdgeService 的 nodeStore 需要实现 OutlineNodeStore 端口')
  }

  async function list(bookId) {
    if (!nonEmptyId(bookId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 必填')
    const listed = await store.list(bookId)
    if (!listed.ok) return listed
    const edges = (Array.isArray(listed.value) ? listed.value : []).map(normalizeOutlineEdge).filter(Boolean)
    return ok(edges.map(outlineEdgeSummary))
  }

  async function add(bookId, input = {}) {
    if (!nonEmptyId(bookId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 必填')
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(CORE_ERROR_CODES.INVALID_INPUT, '边输入必须是对象')
    const edge = createOutlineEdge({
      id: nonEmptyId(input.id) ? input.id.trim() : idFactory(),
      from: input.fromNodeId ?? input.from,
      to: input.toNodeId ?? input.to,
      kind: input.kind,
      sourceRefs: input.sourceRefs,
      extra: input.extra && typeof input.extra === 'object' ? input.extra : {}
    })
    if (!edge) return fail(CORE_ERROR_CODES.INVALID_INPUT, '边无效：需要 id、两端节点且不自环')
    const endpointCheck = await verifyEndpoints(nodeStore, bookId, edge)
    if (!endpointCheck.ok) return endpointCheck
    const added = await store.add(bookId, edge)
    if (!added.ok) return added
    const normalized = normalizeOutlineEdge(added.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的边形状无效')
  }

  async function remove(bookId, edgeId) {
    if (!nonEmptyId(bookId) || !nonEmptyId(edgeId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 与 edgeId 必填')
    return store.remove(bookId, edgeId)
  }

  return Object.freeze({ list, add, remove })
}
