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

// W-B 双栏退役：buildAuthoringReviewRewriteTarget / compareAuthoringReviewRewriteTarget
// 是双栏副窗审稿改写专用（目标 pane 恒为 'dual'），随双栏功能一并移除；
// 主栏审稿改写走 compareWritingRewriteTarget。

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
