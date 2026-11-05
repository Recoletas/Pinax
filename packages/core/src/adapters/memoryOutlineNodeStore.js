import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import { normalizeOutlineNode, outlineNodeRevision } from '../domain/outlineNode.js'
import { applyOutlineNodePatch } from '../domain/outlineNodePatch.js'

/**
 * 内存 OutlineNodeStore:用于 Core 合同测试与 Host 适配器对照,不是生产存储。
 * 按 bookId 分桶保存节点。
 */
export function createMemoryOutlineNodeStore({ buckets = new Map() } = {}) {
  const state = buckets instanceof Map ? buckets : new Map(Object.entries(buckets || {}))

  function nodesOf(bookId) {
    const key = String(bookId)
    if (!state.has(key)) state.set(key, [])
    return state.get(key)
  }

  function findNode(bookId, nodeId) {
    return nodesOf(bookId).find((node) => String(node?.id) === String(nodeId)) || null
  }

  return {
    list(bookId) {
      if (!state.has(String(bookId))) return ok([])
      return ok(nodesOf(bookId).map(normalizeOutlineNode).filter(Boolean))
    },

    read(bookId, nodeId) {
      const node = findNode(bookId, nodeId)
      return ok(node ? normalizeOutlineNode(node) : null)
    },

    create(bookId, node) {
      const record = normalizeOutlineNode(node)
      if (!record) return fail(CORE_ERROR_CODES.INVALID_INPUT, '节点形状无效')
      if (findNode(bookId, record.id)) {
        return fail(CORE_ERROR_CODES.DUPLICATE_OUTLINE_NODE, '节点已存在', { bookId, nodeId: record.id })
      }
      nodesOf(bookId).push(record)
      return ok(record)
    },

    update(bookId, nodeId, patch, { expectedRevision } = {}) {
      const nodes = nodesOf(bookId)
      const index = nodes.findIndex((node) => String(node?.id) === String(nodeId))
      if (index < 0) return fail(CORE_ERROR_CODES.OUTLINE_NODE_NOT_FOUND, '节点不存在', { bookId, nodeId })
      const result = applyOutlineNodePatch(nodes[index], patch, { expectedRevision, now: new Date().toISOString() })
      if (!result.ok) return result
      nodes[index] = result.value
      return ok(normalizeOutlineNode(result.value))
    },

    move(bookId, nodeId, { parentId, order } = {}, { expectedRevision } = {}) {
      const nodes = nodesOf(bookId)
      const index = nodes.findIndex((node) => String(node?.id) === String(nodeId))
      if (index < 0) return fail(CORE_ERROR_CODES.OUTLINE_NODE_NOT_FOUND, '节点不存在', { bookId, nodeId })
      const current = nodes[index]
      const actual = outlineNodeRevision(current)
      if (actual !== expectedRevision) {
        return fail(CORE_ERROR_CODES.STALE_REVISION, '节点修订号已变化', { expected: expectedRevision, actual })
      }
      const normalizedParent = String(parentId ?? '').trim() || null
      const nextOrder = Number.isFinite(Number(order)) ? Number(order) : (Number.isFinite(Number(current.order)) ? Number(current.order) : 0)
      const moved = { ...current, parentId: normalizedParent, order: nextOrder, revision: actual + 1, updatedAt: new Date().toISOString() }
      nodes[index] = moved
      return ok(normalizeOutlineNode(moved))
    },

    remove(bookId, nodeId, { expectedRevision } = {}) {
      const nodes = nodesOf(bookId)
      const index = nodes.findIndex((node) => String(node?.id) === String(nodeId))
      if (index < 0) return fail(CORE_ERROR_CODES.OUTLINE_NODE_NOT_FOUND, '节点不存在', { bookId, nodeId })
      const actual = outlineNodeRevision(nodes[index])
      if (actual !== expectedRevision) {
        return fail(CORE_ERROR_CODES.STALE_REVISION, '节点修订号已变化', { expected: expectedRevision, actual })
      }
      const [removed] = nodes.splice(index, 1)
      return ok(normalizeOutlineNode(removed))
    },

    snapshot(bookId) {
      return state.get(String(bookId)) || []
    }
  }
}
