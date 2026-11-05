function text(value) {
  return String(value ?? '').trim()
}

/**
 * 大纲边的 Core 规范形状。端点用 fromNodeId/toNodeId(兼容 legacy from/to);自环或端点缺失判为无效(返回 null)。
 * kind 缺省 'causes';sourceRefs 归一为去空字符串数组;其余字段原样保留。id 必存在(边的定位键)。
 */
export function normalizeOutlineEdge(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const id = text(raw.id)
  const fromNodeId = text(raw.fromNodeId ?? raw.from)
  const toNodeId = text(raw.toNodeId ?? raw.to)
  if (!id || !fromNodeId || !toNodeId || fromNodeId === toNodeId) return null
  const sourceRefs = Array.isArray(raw.sourceRefs) ? raw.sourceRefs.map(text).filter(Boolean) : []
  return {
    ...raw,
    id,
    kind: text(raw.kind) || 'causes',
    fromNodeId,
    toNodeId,
    sourceRefs
  }
}

export function createOutlineEdge({
  id,
  from,
  to,
  kind = 'causes',
  sourceRefs = [],
  extra = {}
} = {}) {
  const normalizedId = text(id)
  const fromNodeId = text(from)
  const toNodeId = text(to)
  if (!normalizedId || !fromNodeId || !toNodeId || fromNodeId === toNodeId) return null
  return {
    ...extra,
    id: normalizedId,
    kind: text(kind) || 'causes',
    fromNodeId,
    toNodeId,
    sourceRefs: Array.isArray(sourceRefs) ? sourceRefs.map(text).filter(Boolean) : []
  }
}

// 去重键：同一 kind + 同一有向端点对视为同一条边（与宿主写侧一致）。
export function outlineEdgeKey(edge) {
  return `${edge.kind}:${edge.fromNodeId}:${edge.toNodeId}`
}

export function outlineEdgeSummary(edge) {
  return { id: edge.id, kind: edge.kind, fromNodeId: edge.fromNodeId, toNodeId: edge.toNodeId }
}
