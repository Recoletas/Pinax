import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import { outlineNodeRevision } from './outlineNode.js'

function text(value) {
  return String(value ?? '').trim()
}

function normParent(value) {
  const t = text(value)
  return t || null
}

function finiteOrder(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** startId 是否等于/处于 ancestorId 之下（沿 parentId 上溯，带环保护）。 */
export function isDescendantOrSelf(nodes, startId, ancestorId) {
  const from = text(startId)
  const to = text(ancestorId)
  if (!from || !to) return false
  const byId = new Map((Array.isArray(nodes) ? nodes : []).map((node) => [text(node?.id), node]))
  let cursor = from
  const guard = new Set()
  while (cursor) {
    if (cursor === to) return true
    if (guard.has(cursor)) return false
    guard.add(cursor)
    cursor = normParent(byId.get(cursor)?.parentId)
  }
  return false
}

/**
 * 大纲换父级/重排的纯校验规则（不碰存储）：节点/目标父存在、乐观并发、**环检测**。
 * 返回校验后的目标节点（含新 parentId/order 与 revision+1）；调用方据此再落盘。
 */
export function planOutlineMove(nodes, { nodeId, parentId, order, expectedRevision, now } = {}) {
  const id = text(nodeId)
  if (!id) return fail(CORE_ERROR_CODES.INVALID_INPUT, 'nodeId 必填')
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return fail(CORE_ERROR_CODES.INVALID_INPUT, 'expectedRevision 必须是 ≥0 的整数', { expectedRevision })
  }
  const list = Array.isArray(nodes) ? nodes : []
  const node = list.find((item) => text(item?.id) === id)
  if (!node) return fail(CORE_ERROR_CODES.OUTLINE_NODE_NOT_FOUND, '节点不存在', { nodeId: id })

  const actual = outlineNodeRevision(node)
  if (actual !== expectedRevision) {
    return fail(CORE_ERROR_CODES.STALE_REVISION, '节点修订号已变化', { expected: expectedRevision, actual })
  }

  const newParent = normParent(parentId)
  if (newParent) {
    if (newParent === id) return fail(CORE_ERROR_CODES.OUTLINE_CYCLE, '不能把节点移到自身下')
    const parent = list.find((item) => text(item?.id) === newParent)
    if (!parent) return fail(CORE_ERROR_CODES.OUTLINE_NODE_NOT_FOUND, '目标父节点不存在', { parentId: newParent })
    if (isDescendantOrSelf(list, newParent, id)) {
      return fail(CORE_ERROR_CODES.OUTLINE_CYCLE, '移动会形成环', { nodeId: id, parentId: newParent })
    }
  }

  if (order !== undefined && order !== null && !Number.isFinite(Number(order))) {
    return fail(CORE_ERROR_CODES.INVALID_INPUT, 'order 必须是有限数字')
  }
  const nextOrder = order === undefined || order === null
    ? finiteOrder(node.order, 0)
    : Number(order)

  return ok({
    ...node,
    parentId: newParent,
    order: nextOrder,
    revision: actual + 1,
    updatedAt: typeof now === 'string' && now ? now : new Date().toISOString()
  })
}
