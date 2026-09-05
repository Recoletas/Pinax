// Read-only adapter from the existing project-outline truth to transient F3
// typed links. It does not persist a second graph and deliberately refuses to
// infer causality from chapter co-membership or lexical similarity.

function text(value) {
  return String(value ?? '').trim()
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function nodeRef(entry) {
  return entry?.documentId && entry?.nodeId
    ? `node:${entry.documentId}:${entry.nodeId}`
    : ''
}

function unitRef(entry) {
  return entry?.documentId && entry?.unitId
    ? `unit:${entry.documentId}:${entry.unitId}`
    : ''
}

function outlineNodeMatchesTarget(node, targetEntry) {
  const targetNodeRef = nodeRef(targetEntry)
  const targetUnitRef = unitRef(targetEntry)
  if (list(node?.sourceRefs).some((ref) => [targetNodeRef, targetUnitRef].includes(text(ref)))) return true
  return list(node?.unitRefs).some((ref) => (
    text(ref?.unitId) === text(targetEntry?.unitId)
    && (!text(ref?.chapterId) || text(ref.chapterId) === text(targetEntry?.chapterId))
  ))
}

function canonicalOutlineNodeRef(node, positionIndex) {
  const exact = list(node?.sourceRefs)
    .map(text)
    .find((ref) => /^node:[^:]+:[^:]+$/.test(ref)
      && list(positionIndex?.entries).some((entry) => nodeRef(entry) === ref))
  if (exact) return exact
  for (const ref of list(node?.unitRefs)) {
    const entry = list(positionIndex?.entries).find((candidate) => (
      text(candidate?.unitId) === text(ref?.unitId)
      && (!text(ref?.chapterId) || text(candidate?.chapterId) === text(ref.chapterId))
    ))
    if (entry) return nodeRef(entry)
  }
  return ''
}

function relationForOutlineKind(kind) {
  if (kind === 'causes') return { relation: 'causes', explicit: true }
  if (kind === 'foreshadows') return { relation: 'mentions', explicit: false }
  return { relation: 'similar-to', explicit: false }
}

function edgeReason(edge, fromNode, toNode) {
  const from = text(fromNode?.title) || '前项'
  const to = text(toNode?.title) || '后项'
  if (edge.kind === 'causes') return `大纲明确：“${from}”导致“${to}”。改变前项可能使后项失去原有前提。`
  if (edge.kind === 'foreshadows') return `大纲把“${from}”与“${to}”标为伏笔关系，只列作待核对线索。`
  return `大纲把“${from}”与“${to}”并列关联，只列作待核对线索。`
}

export function readAuthoringOutlineCausalLinks({
  projectId = '',
  target = null,
  positionIndex = null,
  outlineNodes = [],
  outlineEdges = [],
  maxLinks = 12
} = {}) {
  const resolvedProjectId = text(projectId)
  if (!resolvedProjectId || resolvedProjectId !== text(positionIndex?.projectId) || !target) return Object.freeze([])
  const targetEntry = list(positionIndex.entries).find((entry) => (
    text(entry.documentId) === text(target.documentId || target.chapterId)
    && text(entry.unitId) === text(target.unitId)
    && text(entry.nodeId) === text(target.nodeId)
  ))
  if (!targetEntry) return Object.freeze([])
  const targetRef = nodeRef(targetEntry)
  const nodes = list(outlineNodes)
  const nodeById = new Map(nodes.map((node) => [text(node?.id), node]).filter(([id]) => id))
  const refsByOutlineId = new Map(nodes.map((node) => [text(node?.id), canonicalOutlineNodeRef(node, positionIndex)]))
  const roots = nodes.filter((node) => outlineNodeMatchesTarget(node, targetEntry)).map((node) => text(node.id))
  for (const root of roots) refsByOutlineId.set(root, targetRef)
  if (!roots.length) return Object.freeze([])

  const allowedEdges = list(outlineEdges).filter((edge) => (
    nodeById.has(text(edge?.fromNodeId))
    && nodeById.has(text(edge?.toNodeId))
    && ['causes', 'foreshadows', 'alternative', 'parallel'].includes(text(edge?.kind))
  ))
  const reachable = new Set(roots)
  const selectedEdges = []
  let frontier = roots
  for (let depth = 0; depth < 2 && frontier.length; depth += 1) {
    const next = []
    for (const edge of allowedEdges) {
      const fromId = text(edge.fromNodeId)
      const toId = text(edge.toNodeId)
      if (!frontier.includes(fromId) || !refsByOutlineId.get(fromId) || !refsByOutlineId.get(toId)) continue
      selectedEdges.push(edge)
      if (!reachable.has(toId)) next.push(toId)
      reachable.add(toId)
      if (selectedEdges.length >= Math.max(1, Math.min(24, Number(maxLinks) || 12))) break
    }
    frontier = [...new Set(next)]
  }

  return Object.freeze(selectedEdges.map((edge) => {
    const fromId = text(edge.fromNodeId)
    const toId = text(edge.toNodeId)
    const fromRef = refsByOutlineId.get(fromId)
    const toRef = refsByOutlineId.get(toId)
    const relation = relationForOutlineKind(text(edge.kind))
    return Object.freeze({
      id: `outline-link:${text(edge.id) || `${edge.kind}:${fromId}:${toId}`}`,
      projectId: resolvedProjectId,
      fromRef,
      toRef,
      ...relation,
      reason: edgeReason(edge, nodeById.get(fromId), nodeById.get(toId)),
      evidenceRefs: Object.freeze([...new Set([fromRef, toRef])]),
      revision: `outline-edge:${text(edge.id)}:${text(nodeById.get(fromId)?.revision)}:${text(nodeById.get(toId)?.revision)}`
    })
  }))
}

export default readAuthoringOutlineCausalLinks
