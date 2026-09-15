import { createWritingSelector } from '../services/writing/writingAnnotations.js'

/**
 * 把 Authoring 编辑器的实时选区冻结为稳定批注范围。
 *
 * 页面注入 ProseMirror / Markdown 读取能力；本层只生成 unit/node/revision
 * 身份和 selector/range，不持有 DOM、响应式状态或长期数据。
 */
export function useAuthoringAnnotationSelection({
  hasDocument,
  isNotebookActive,
  getNotebookSelection,
  getWritingNodeById,
  getWritingUnitByNodeId,
  findNotebookNodeRange,
  getWritingDocument,
  getLiveSelection,
  getWritingBlockAtPosition,
  getMarkdown
}) {
  function getCurrentWritingNodeDescriptors() {
    const markdown = getMarkdown()
    const nodes = (getWritingDocument()?.content || []).flatMap((unit) => (
      (unit?.content || []).map((node) => ({ node, unit }))
    ))
    const descriptors = []
    let probe = 0
    for (const { node, unit } of nodes) {
      const nodeId = node?.attrs?.nodeId
      const text = (node?.content || []).map((item) => item?.text || '').join('')
      let descriptor = null
      if (nodeId) {
        for (let position = probe; position <= markdown.length; position += 1) {
          const candidate = getWritingBlockAtPosition(position, markdown)
          if (candidate?.nodeId === nodeId) {
            descriptor = { ...candidate, text }
            break
          }
        }
      }
      descriptor ||= {
        nodeId: nodeId || null,
        unitId: unit?.attrs?.unitId || null,
        unitRevision: Number(unit?.attrs?.unitRevision || 0),
        nodeRevision: Number(node?.attrs?.nodeRevision ?? node?.attrs?.revision ?? 0),
        start: probe,
        end: probe + text.length,
        text
      }
      descriptors.push(descriptor)
      probe = Math.max(probe + 1, descriptor.end + 1)
    }
    return descriptors
  }

  function buildAnnotationRangeContext({ startBlock, endBlock, localStart, localEnd, exact }) {
    const startNodeId = startBlock?.nodeId
    const endNodeId = endBlock?.nodeId
    if (!startNodeId || !endNodeId || !exact) return null
    const startExact = startBlock.text.slice(localStart, Math.min(startBlock.text.length, localStart + 48))
      || (startBlock.text ? exact.slice(0, 48) : '')
    const endExact = startBlock === endBlock
      ? startBlock.text.slice(Math.max(0, localEnd - 48), localEnd)
      : endBlock.text.slice(Math.max(0, localEnd - 48), localEnd)
        || (endBlock.text ? exact.slice(-48) : '')
    const startSelector = createWritingSelector({
      text: startExact,
      start: localStart,
      end: localStart + startExact.length,
      fullText: startBlock.text
    })
    const endSelector = createWritingSelector({
      text: endExact,
      start: Math.max(0, localEnd - endExact.length),
      end: localEnd,
      fullText: endBlock.text
    })
    const nodes = getCurrentWritingNodeDescriptors()
    const startIndex = nodes.findIndex((node) => node.nodeId === startNodeId)
    const endIndex = nodes.findIndex((node) => node.nodeId === endNodeId)
    const selectedNodes = startIndex >= 0 && endIndex >= startIndex
      ? nodes.slice(startIndex, endIndex + 1)
      : [startBlock, endBlock]

    return {
      block: startBlock,
      selector: startSelector,
      range: {
        start: {
          unitId: startBlock.unitId,
          unitRevision: startBlock.unitRevision,
          nodeId: startNodeId,
          nodeRevision: startBlock.nodeRevision,
          offset: localStart
        },
        end: {
          unitId: endBlock.unitId,
          unitRevision: endBlock.unitRevision,
          nodeId: endNodeId,
          nodeRevision: endBlock.nodeRevision,
          offset: localEnd
        },
        unitIds: [...new Set(selectedNodes.map((node) => node.unitId).filter(Boolean))],
        nodeIds: selectedNodes.map((node) => node.nodeId).filter(Boolean),
        exact,
        ...(startExact ? { startSelector } : {}),
        ...(endExact ? { endSelector } : {})
      }
    }
  }

  function getAnnotationSelectionContext() {
    if (!hasDocument()) return null
    const notebookSelection = getNotebookSelection()
    if (isNotebookActive() && notebookSelection?.text) {
      const startNodeId = notebookSelection.startNodeId || notebookSelection.nodeId
      const endNodeId = notebookSelection.endNodeId || startNodeId
      const startNode = getWritingNodeById(startNodeId)
      const endNode = getWritingNodeById(endNodeId)
      const startUnit = getWritingUnitByNodeId(startNodeId)
      const endUnit = getWritingUnitByNodeId(endNodeId)
      const startRange = findNotebookNodeRange(startNodeId)
      const endRange = findNotebookNodeRange(endNodeId)
      if (!startNode || !endNode || !startRange || !endRange) return null
      const toBlock = (node, unit, nodeId) => ({
        unitId: unit?.attrs?.unitId || null,
        unitRevision: Number(unit?.attrs?.unitRevision || 0),
        nodeId,
        nodeRevision: Number(node.attrs?.nodeRevision || 0),
        text: (node.content || []).map((item) => item?.text || '').join('')
      })
      return buildAnnotationRangeContext({
        startBlock: toBlock(startNode, startUnit, startNodeId),
        endBlock: toBlock(endNode, endUnit, endNodeId),
        localStart: Math.max(0, Number(notebookSelection.from) - startRange.from),
        localEnd: Math.max(0, Number(notebookSelection.to) - endRange.from),
        exact: notebookSelection.text
      })
    }

    const snapshot = getLiveSelection()
    if (!snapshot?.hasSelection) return null
    const markdown = getMarkdown()
    const startBlock = getWritingBlockAtPosition(snapshot.start, markdown)
    const endBlock = getWritingBlockAtPosition(Math.max(snapshot.start, snapshot.end - 1), markdown)
    if (!startBlock?.nodeId || !endBlock?.nodeId) return null
    const localStart = Math.max(0, snapshot.start - startBlock.start)
    const localEnd = Math.max(0, snapshot.end - endBlock.start)
    const exact = snapshot.text || (startBlock.nodeId === endBlock.nodeId
      ? startBlock.text.slice(localStart, localEnd)
      : [startBlock.text.slice(localStart), endBlock.text.slice(0, localEnd)].join('\n'))
    return buildAnnotationRangeContext({ startBlock, endBlock, localStart, localEnd, exact })
  }

  function buildFullNodeAnnotationContext(target) {
    if (!target?.nodeId || !String(target.text || '').trim()) return null
    const selector = createWritingSelector({
      text: target.text,
      start: 0,
      end: target.text.length,
      fullText: target.text
    })
    return {
      block: target,
      selector,
      range: {
        start: { unitId: target.unitId, unitRevision: target.unitRevision, nodeId: target.nodeId, nodeRevision: target.nodeRevision, offset: 0 },
        end: { unitId: target.unitId, unitRevision: target.unitRevision, nodeId: target.nodeId, nodeRevision: target.nodeRevision, offset: target.text.length },
        unitIds: [target.unitId],
        nodeIds: [target.nodeId],
        exact: target.text,
        startSelector: selector,
        endSelector: selector
      }
    }
  }

  return {
    buildAnnotationRangeContext,
    buildFullNodeAnnotationContext,
    getAnnotationSelectionContext,
    getCurrentWritingNodeDescriptors
  }
}
