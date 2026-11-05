import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import { createOutlineNode, normalizeOutlineNode, outlineNodeSummary } from '../domain/outlineNode.js'
import { planOutlineMove } from '../domain/outlineTree.js'
import { isOutlineNodeStore } from '../ports/outlineNodeStore.js'

function nonEmptyId(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function defaultIdFactory() {
  return `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function requireExpectedRevision(expectedRevision) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return fail(CORE_ERROR_CODES.INVALID_INPUT, 'expectedRevision 必须是 ≥0 的整数', { expectedRevision })
  }
  return null
}

/**
 * 大纲节点业务用例(异步,供移动/文件端)。id/title/intent/parentId/order/status/revision 与并发语义
 * 都在这里决定;换父级(重排)与边图不在本切片。Host 只注入 OutlineNodeStore。
 */
export function createOutlineNodeService({
  store,
  now = () => new Date().toISOString(),
  idFactory = defaultIdFactory
} = {}) {
  if (!isOutlineNodeStore(store)) throw new TypeError('createOutlineNodeService 需要实现 list/read/create/update/remove 的 OutlineNodeStore')

  async function list(bookId) {
    if (!nonEmptyId(bookId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 必填')
    const listed = await store.list(bookId)
    if (!listed.ok) return listed
    const nodes = (Array.isArray(listed.value) ? listed.value : []).map(normalizeOutlineNode).filter(Boolean)
    return ok(nodes.map(outlineNodeSummary))
  }

  async function read(bookId, nodeId) {
    if (!nonEmptyId(bookId) || !nonEmptyId(nodeId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 与 nodeId 必填')
    const readResult = await store.read(bookId, nodeId)
    if (!readResult.ok) return readResult
    if (!readResult.value) return fail(CORE_ERROR_CODES.OUTLINE_NODE_NOT_FOUND, '节点不存在', { bookId, nodeId })
    const normalized = normalizeOutlineNode(readResult.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.INVALID_INPUT, '节点数据形状无效', { bookId, nodeId })
  }

  async function create(bookId, input = {}) {
    if (!nonEmptyId(bookId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 必填')
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(CORE_ERROR_CODES.INVALID_INPUT, '节点输入必须是对象')
    const node = createOutlineNode({
      id: nonEmptyId(input.id) ? input.id.trim() : idFactory(),
      parentId: input.parentId,
      title: input.title,
      intent: input.intent,
      status: input.status,
      order: input.order,
      now: now(),
      extra: input.extra && typeof input.extra === 'object' ? input.extra : {}
    })
    if (!node) return fail(CORE_ERROR_CODES.INVALID_INPUT, '节点 id 无效')
    const created = await store.create(bookId, node)
    if (!created.ok) return created
    const normalized = normalizeOutlineNode(created.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的节点形状无效')
  }

  async function update(bookId, nodeId, input = {}) {
    if (!nonEmptyId(bookId) || !nonEmptyId(nodeId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 与 nodeId 必填')
    const revisionError = requireExpectedRevision(input.expectedRevision)
    if (revisionError) return revisionError
    const { expectedRevision, ...patch } = input
    const updated = await store.update(bookId, nodeId, patch, { expectedRevision })
    if (!updated.ok) return updated
    const normalized = normalizeOutlineNode(updated.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的节点形状无效')
  }

  async function move(bookId, nodeId, input = {}) {
    if (!nonEmptyId(bookId) || !nonEmptyId(nodeId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 与 nodeId 必填')
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(CORE_ERROR_CODES.INVALID_INPUT, '移动输入必须是对象')
    const listed = await store.list(bookId)
    if (!listed.ok) return listed
    const nodes = (Array.isArray(listed.value) ? listed.value : []).map(normalizeOutlineNode).filter(Boolean)
    const plan = planOutlineMove(nodes, {
      nodeId,
      parentId: input.parentId,
      order: input.order,
      expectedRevision: input.expectedRevision,
      now: now()
    })
    if (!plan.ok) return plan
    const moved = await store.move(bookId, nodeId, { parentId: plan.value.parentId, order: plan.value.order }, { expectedRevision: input.expectedRevision })
    if (!moved.ok) return moved
    const normalized = normalizeOutlineNode(moved.value)
    return normalized ? ok(normalized) : fail(CORE_ERROR_CODES.IO_FAILED, 'Store 返回的节点形状无效')
  }

  async function remove(bookId, nodeId, { expectedRevision } = {}) {
    if (!nonEmptyId(bookId) || !nonEmptyId(nodeId)) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'bookId 与 nodeId 必填')
    const revisionError = requireExpectedRevision(expectedRevision)
    if (revisionError) return revisionError
    return store.remove(bookId, nodeId, { expectedRevision })
  }

  return Object.freeze({ list, read, create, update, move, remove })
}
