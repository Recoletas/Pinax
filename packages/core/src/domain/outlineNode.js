function text(value) {
  return String(value ?? '').trim()
}

export function outlineNodeRevision(node) {
  const direct = Number(node?.revision)
  return Number.isSafeInteger(direct) && direct >= 0 ? direct : 0
}

/**
 * 大纲节点的 Core 规范形状。只承诺 id/title/intent/parentId/order/status/revision 的语义;
 * chapterRefs/explorationRefs/entityRefs/unitRefs/sourceRefs 等富字段作为未知字段原样保留。
 * 标题可为空——显示占位由 Host 决定,Core 不写死“未命名节点”。
 */
export function normalizeOutlineNode(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const id = text(raw.id)
  if (!id) return null
  const order = Number(raw.order)
  return {
    ...raw,
    id,
    title: text(raw.title),
    intent: text(raw.intent),
    parentId: text(raw.parentId) || null,
    order: Number.isFinite(order) ? order : 0,
    status: typeof raw.status === 'string' ? raw.status : '',
    revision: outlineNodeRevision(raw)
  }
}

export function createOutlineNode({
  id,
  parentId = '',
  title = '',
  intent = '',
  status = 'exploring',
  order = 0,
  now = new Date().toISOString(),
  extra = {}
} = {}) {
  const normalizedId = text(id)
  if (!normalizedId) return null
  const numericOrder = Number(order)
  return {
    ...extra,
    id: normalizedId,
    title: text(title),
    intent: text(intent),
    parentId: text(parentId) || null,
    order: Number.isFinite(numericOrder) ? numericOrder : 0,
    status: text(status),
    revision: 1,
    createdAt: now,
    updatedAt: now
  }
}

export function outlineNodeSummary(node) {
  return {
    id: node.id,
    title: node.title,
    parentId: node.parentId ?? null,
    order: node.order ?? 0,
    status: node.status ?? '',
    revision: outlineNodeRevision(node)
  }
}
