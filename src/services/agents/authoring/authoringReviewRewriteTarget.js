function nodeText(node) {
  return (node?.content || []).map((item) => item?.text || '').join('')
}

function documentNodes(document) {
  return (document?.content || []).flatMap((unit) => (unit.content || []).map((node) => ({
    unitId: String(unit?.attrs?.unitId || ''),
    unitRevision: Number(unit?.attrs?.unitRevision || 0),
    nodeId: String(node?.attrs?.nodeId || ''),
    nodeRevision: Number(node?.attrs?.nodeRevision || 0),
    text: nodeText(node)
  }))).filter((node) => node.nodeId)
}

export function buildAuthoringReviewRewriteTarget(source, finding) {
  const target = finding?.target || {}
  if (!source?.document || !source.documentId) return null
  const nodes = documentNodes(source.document)
  const startIndex = nodes.findIndex((node) => node.nodeId === target.nodeId)
  const endIndex = nodes.findIndex((node) => node.nodeId === (target.endNodeId || target.nodeId))
  if (startIndex < 0 || endIndex < startIndex) return null
  const selected = nodes.slice(startIndex, endIndex + 1).map((node, index, values) => {
    const startOffset = index === 0 ? Math.max(0, Number(target.startOffset) || 0) : 0
    const requestedEnd = index === values.length - 1 ? Number(target.endOffset) : node.text.length
    const endOffset = Number.isFinite(requestedEnd)
      ? Math.min(node.text.length, Math.max(startOffset, requestedEnd))
      : node.text.length
    const text = node.text.slice(startOffset, endOffset)
    return { ...node, startOffset, endOffset, baseText: text, text }
  })
  const first = selected[0]
  const common = {
    pane: 'dual',
    documentId: String(source.documentId),
    documentRole: source.documentRole,
    chapterId: source.chapterId || source.documentId,
    documentRevision: source.documentRevision,
    unitId: first.unitId,
    unitRevision: first.unitRevision,
    nodeId: first.nodeId,
    nodeRevision: first.nodeRevision,
    text: selected.map((node) => node.text).join('\n')
  }
  return selected.length > 1
    ? { ...common, kind: 'multi-selection', nodeIds: selected.map((node) => node.nodeId), nodes: selected }
    : { ...common, kind: 'selection', startOffset: first.startOffset, endOffset: first.endOffset }
}

export function compareAuthoringReviewRewriteTarget(source, target) {
  if (!source?.document || String(source.documentId) !== String(target?.documentId)) return null
  const byId = new Map(documentNodes(source.document).map((node) => [node.nodeId, node]))
  const targets = target.kind === 'multi-selection' ? target.nodes : [target]
  const nodes = targets.map((item) => {
    const live = byId.get(item.nodeId)
    if (!live) return null
    const startOffset = Math.max(0, Number(item.startOffset) || 0)
    const requestedEnd = item.endOffset == null ? live.text.length : Number(item.endOffset)
    const endOffset = Number.isFinite(requestedEnd)
      ? Math.min(live.text.length, Math.max(startOffset, requestedEnd))
      : live.text.length
    return { ...live, text: live.text.slice(startOffset, endOffset) }
  }).filter(Boolean)
  if (nodes.length !== targets.length) return null
  return { chapterId: target.chapterId, documentRevision: source.documentRevision, nodes, ...nodes[0] }
}

export function compareWritingRewriteTarget({ document, target, chapterId, markdown = '' } = {}) {
  if (!document || !target) return null
  const byId = new Map(documentNodes(document).map((node) => [node.nodeId, node]))
  if (target.kind === 'multi-selection') {
    const nodes = (target.nodes || []).map((item) => {
      const live = byId.get(item.nodeId)
      if (!live) return null
      const startOffset = Math.max(0, Number(item.startOffset) || 0)
      const requestedEnd = item.endOffset == null ? live.text.length : Number(item.endOffset)
      const endOffset = Number.isFinite(requestedEnd)
        ? Math.min(live.text.length, Math.max(startOffset, requestedEnd))
        : live.text.length
      return { ...live, text: live.text.slice(startOffset, endOffset) }
    }).filter(Boolean)
    return nodes.length === (target.nodes || []).length
      ? { chapterId, documentRevision: Number(document.revision || 0), nodes }
      : null
  }
  const live = byId.get(target.nodeId)
  if (!live) return null
  const hasOffsets = target.startOffset != null && target.endOffset != null
    && Number.isFinite(Number(target.startOffset)) && Number.isFinite(Number(target.endOffset))
  const text = target.kind !== 'selection'
    ? live.text
    : hasOffsets
      ? live.text.slice(Math.max(0, Number(target.startOffset)), Math.max(Number(target.startOffset), Number(target.endOffset)))
      : target.range
        ? String(markdown).slice(target.range.start, target.range.end)
        : ''
  const node = { ...live, text }
  return { chapterId, documentRevision: Number(document.revision || 0), nodes: [node], ...node }
}
