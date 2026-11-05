import { fail, ok } from '../contracts/result.js'
import { CORE_ERROR_CODES } from '../contracts/errors.js'
import { normalizeOutlineEdge, outlineEdgeKey } from '../domain/outlineEdge.js'

/**
 * 内存 OutlineEdgeStore:用于 Core 合同测试与 Host 适配器对照,不是生产存储。
 * 按 bookId 分桶保存边;add 去重同 id 或同 (kind,from,to)。
 */
export function createMemoryOutlineEdgeStore({ buckets = new Map() } = {}) {
  const state = buckets instanceof Map ? buckets : new Map(Object.entries(buckets || {}))

  function edgesOf(bookId) {
    const key = String(bookId)
    if (!state.has(key)) state.set(key, [])
    return state.get(key)
  }

  return {
    list(bookId) {
      if (!state.has(String(bookId))) return ok([])
      return ok(edgesOf(bookId).map(normalizeOutlineEdge).filter(Boolean))
    },

    add(bookId, edge) {
      const record = normalizeOutlineEdge(edge)
      if (!record) return fail(CORE_ERROR_CODES.INVALID_INPUT, '边形状无效')
      const edges = edgesOf(bookId)
      const key = outlineEdgeKey(record)
      const duplicate = edges.some((existing) => {
        const normalized = normalizeOutlineEdge(existing)
        return normalized && (normalized.id === record.id || outlineEdgeKey(normalized) === key)
      })
      if (duplicate) {
        return fail(CORE_ERROR_CODES.DUPLICATE_OUTLINE_EDGE, '边已存在', { bookId, kind: record.kind, fromNodeId: record.fromNodeId, toNodeId: record.toNodeId })
      }
      edges.push(record)
      return ok(record)
    },

    remove(bookId, edgeId) {
      const edges = edgesOf(bookId)
      const index = edges.findIndex((edge) => String(edge?.id) === String(edgeId))
      if (index < 0) return fail(CORE_ERROR_CODES.OUTLINE_EDGE_NOT_FOUND, '边不存在', { bookId, edgeId })
      const [removed] = edges.splice(index, 1)
      return ok(normalizeOutlineEdge(removed))
    },

    snapshot(bookId) {
      return state.get(String(bookId)) || []
    }
  }
}
