function nodeText(node) {
  if (!node || typeof node !== 'object') return ''
  if (node.type === 'hardBreak') return '\n'
  if (typeof node.text === 'string') return node.text
  return (node.content || []).map(nodeText).join('')
}

export function buildWritingSelectionRanges(document, selection = {}) {
  if (!document || selection.empty !== false || !String(selection.text || '').trim()) return []
  const startId = String(selection.startNodeId || selection.nodeId || '')
  const endId = String(selection.endNodeId || startId)
  const nodes = (document.content || []).flatMap((unit) => (unit.content || []).map((node) => ({
    nodeId: String(node?.attrs?.nodeId || ''), text: nodeText(node)
  }))).filter((node) => node.nodeId)
  const startIndex = nodes.findIndex((node) => node.nodeId === startId)
  const endIndex = nodes.findIndex((node) => node.nodeId === endId)
  if (startIndex < 0 || endIndex < startIndex) return []
  return nodes.slice(startIndex, endIndex + 1).map((node, index, selected) => {
    const startOffset = index === 0 ? Math.max(0, Number(selection.selectionLocalStart) || 0) : 0
    const endOffset = index === selected.length - 1
      ? Math.max(startOffset, Number(selection.selectionLocalEnd) || 0)
      : node.text.length
    return { nodeId: node.nodeId, startOffset: Math.min(node.text.length, startOffset), endOffset: Math.min(node.text.length, endOffset) }
  }).filter((range) => range.endOffset > range.startOffset)
}
