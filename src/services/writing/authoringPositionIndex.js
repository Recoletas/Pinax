// Stable authoring text-position index shared by proofing, full-book search and
// later dependency discovery. It is derived from canonical writing documents;
// callers never need to recover node positions by scanning serialized Markdown.

export const AUTHORING_POSITION_INDEX_SCHEMA_VERSION = 1

function text(value) {
  return value == null ? '' : String(value)
}

function integer(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.floor(number) : fallback
}

function fnv1a(source) {
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function unique(values) {
  return [...new Set(values.map((value) => text(value).trim()).filter(Boolean))]
}

function nodeText(node) {
  if (typeof node?.text === 'string') return node.text
  if (node?.type === 'mediaReference') return ''
  return (Array.isArray(node?.content) ? node.content : []).map(nodeText).join('')
}

function normalizedDocumentSource(source, order) {
  const document = source?.document || source?.editorDocument || source
  const documentId = text(source?.documentId || source?.id || source?.chapterId).trim()
  if (!documentId || !document || !Array.isArray(document.content)) return null
  const documentRole = text(source?.documentRole || source?.role || 'manuscript').trim() || 'manuscript'
  const chapterId = text(source?.chapterId || (documentRole === 'manuscript' ? documentId : '')).trim()
  return {
    projectId: text(source?.projectId).trim(),
    documentId,
    documentRole,
    chapterId,
    title: text(source?.title).trim(),
    order: Number.isFinite(Number(source?.order)) ? Number(source.order) : order,
    documentRevision: text(source?.documentRevision ?? document.revision).trim(),
    documentSchemaRevision: text(source?.documentSchemaRevision ?? document.revision).trim(),
    document
  }
}

export function buildAuthoringPositionIndex({
  projectId = '',
  documents = [],
  chapterOrderRevision = ''
} = {}) {
  const normalizedProjectId = text(projectId).trim()
  const documentSources = (Array.isArray(documents) ? documents : [])
    .map((source, order) => normalizedDocumentSource(source, order))
    .filter(Boolean)
  const discoveredProjectIds = unique(documentSources.map((source) => source.projectId))
  const resolvedProjectId = normalizedProjectId
    || (discoveredProjectIds.length === 1 ? discoveredProjectIds[0] : '')
  const normalizedDocuments = documentSources
    // A project-scoped index must never relabel a document from another
    // project. Sources with no project id inherit the explicit outer scope.
    .filter((source) => !resolvedProjectId || !source.projectId || source.projectId === resolvedProjectId)
    .sort((left, right) => left.order - right.order || left.documentId.localeCompare(right.documentId))
  const entries = []

  for (let documentOrder = 0; documentOrder < normalizedDocuments.length; documentOrder += 1) {
    const source = normalizedDocuments[documentOrder]
    const units = Array.isArray(source.document.content) ? source.document.content : []
    let documentNodeOrder = 0
    for (let unitOrder = 0; unitOrder < units.length; unitOrder += 1) {
      const unit = units[unitOrder]
      const unitId = text(unit?.attrs?.unitId).trim()
      if (!unitId) continue
      const unitRevision = text(unit?.attrs?.unitRevision ?? '').trim()
      const nodes = Array.isArray(unit?.content) ? unit.content : []
      for (let nodeOrder = 0; nodeOrder < nodes.length; nodeOrder += 1) {
        const node = nodes[nodeOrder]
        const nodeId = text(node?.attrs?.nodeId || node?.attrs?.blockId).trim()
        if (!nodeId) continue
        const content = nodeText(node)
        const sourceRefs = unique([
          source.chapterId ? `chapter:${source.chapterId}` : '',
          `unit:${source.documentId}:${unitId}`,
          `node:${source.documentId}:${nodeId}`
        ])
        entries.push(Object.freeze({
          projectId: resolvedProjectId,
          documentRole: source.documentRole,
          documentId: source.documentId,
          chapterId: source.chapterId,
          documentRevision: source.documentRevision,
          documentSchemaRevision: source.documentSchemaRevision,
          documentOrder,
          unitId,
          unitRevision,
          unitOrder,
          nodeId,
          nodeRevision: text(node?.attrs?.nodeRevision ?? node?.attrs?.revision ?? '').trim(),
          nodeOrder,
          documentNodeOrder,
          kind: text(node?.attrs?.kind || node?.type || 'prose').trim(),
          text: content,
          sourceRefs: Object.freeze(sourceRefs)
        }))
        documentNodeOrder += 1
      }
    }
  }

  const documentEntries = normalizedDocuments.map((source, documentOrder) => Object.freeze({
    projectId: resolvedProjectId,
    documentRole: source.documentRole,
    documentId: source.documentId,
    chapterId: source.chapterId,
    title: source.title,
    order: documentOrder,
    documentRevision: source.documentRevision,
    documentSchemaRevision: source.documentSchemaRevision,
    unitIds: Object.freeze(unique(entries
      .filter((entry) => entry.documentId === source.documentId)
      .map((entry) => entry.unitId))),
    nodeIds: Object.freeze(entries
      .filter((entry) => entry.documentId === source.documentId)
      .map((entry) => entry.nodeId))
  }))
  const fingerprintSeed = entries.map((entry) => [
    entry.documentId,
    entry.documentRevision,
    entry.unitId,
    entry.unitRevision,
    entry.nodeId,
    entry.nodeRevision,
    entry.documentNodeOrder,
    fnv1a(entry.text)
  ].join(':')).join('|')

  return Object.freeze({
    schemaVersion: AUTHORING_POSITION_INDEX_SCHEMA_VERSION,
    projectId: resolvedProjectId,
    chapterOrderRevision: text(chapterOrderRevision).trim(),
    fingerprint: `position-${fnv1a(fingerprintSeed)}`,
    documents: Object.freeze(documentEntries),
    entries: Object.freeze(entries)
  })
}

export function resolveAuthoringPosition(index, target = {}) {
  if (!index || !Array.isArray(index.entries)) return null
  const projectId = text(target.projectId).trim()
  if (projectId && projectId !== text(index.projectId).trim()) return null
  const documentId = text(target.documentId).trim()
  const nodeId = text(target.nodeId).trim()
  if (!documentId || !nodeId) return null
  const entry = index.entries.find((candidate) => (
    candidate.documentId === documentId
    && candidate.nodeId === nodeId
  ))
  if (!entry) return null
  if (target.documentRole && text(target.documentRole) !== entry.documentRole) return null
  if (target.chapterId && text(target.chapterId) !== entry.chapterId) return null
  if (target.unitId && text(target.unitId) !== entry.unitId) return null
  return entry
}

export function compareAuthoringPositions(index, left = {}, right = {}) {
  const leftPosition = resolveAuthoringPosition(index, left)
  const rightPosition = resolveAuthoringPosition(index, right)
  if (!leftPosition && !rightPosition) return 0
  if (!leftPosition) return 1
  if (!rightPosition) return -1
  return leftPosition.documentOrder - rightPosition.documentOrder
    || leftPosition.documentNodeOrder - rightPosition.documentNodeOrder
    || integer(left.startOffset) - integer(right.startOffset)
    || integer(left.endOffset) - integer(right.endOffset)
}

function exactAtTarget(index, target, startEntry) {
  const endNodeId = text(target.endNodeId || target.nodeId).trim()
  const endEntry = resolveAuthoringPosition(index, {
    ...target,
    unitId: target.endUnitId || target.unitId,
    nodeId: endNodeId
  })
  if (!endEntry || endEntry.documentId !== startEntry.documentId) return null
  if (endEntry.documentNodeOrder < startEntry.documentNodeOrder) return null
  const documentEntries = index.entries.filter((entry) => entry.documentId === startEntry.documentId)
  const startIndex = documentEntries.findIndex((entry) => entry.nodeId === startEntry.nodeId)
  const endIndex = documentEntries.findIndex((entry) => entry.nodeId === endEntry.nodeId)
  if (startIndex < 0 || endIndex < startIndex) return null
  const startOffset = Math.max(0, Math.min(startEntry.text.length, integer(target.startOffset)))
  const endOffset = Math.max(0, Math.min(endEntry.text.length, integer(target.endOffset, endEntry.text.length)))
  if (startIndex === endIndex) return startEntry.text.slice(startOffset, endOffset)
  return [
    startEntry.text.slice(startOffset),
    ...documentEntries.slice(startIndex + 1, endIndex).map((entry) => entry.text),
    endEntry.text.slice(0, endOffset)
  ].join('\n')
}

export function assessAuthoringPositionFreshness(target = {}, index) {
  const entry = resolveAuthoringPosition(index, target)
  if (!entry) {
    return Object.freeze({
      fresh: false,
      stale: true,
      detached: true,
      reason: 'target-detached',
      reasons: Object.freeze(['target-detached'])
    })
  }
  const reasons = []
  const compareRevision = (field, liveValue, reason) => {
    const expected = text(target[field]).trim()
    if (expected && expected !== text(liveValue).trim()) reasons.push(reason)
  }
  compareRevision('documentRevision', entry.documentRevision, 'document-revision-changed')
  compareRevision('unitRevision', entry.unitRevision, 'unit-revision-changed')
  compareRevision('nodeRevision', entry.nodeRevision, 'node-revision-changed')
  if (target.endNodeId && target.endNodeId !== target.nodeId) {
    const endEntry = resolveAuthoringPosition(index, {
      ...target,
      unitId: target.endUnitId || target.unitId,
      nodeId: target.endNodeId
    })
    if (!endEntry) reasons.push('end-target-detached')
    else {
      const expectedEndUnitRevision = text(target.endUnitRevision).trim()
      const expectedEndNodeRevision = text(target.endNodeRevision).trim()
      if (expectedEndUnitRevision && expectedEndUnitRevision !== endEntry.unitRevision) reasons.push('end-unit-revision-changed')
      if (expectedEndNodeRevision && expectedEndNodeRevision !== endEntry.nodeRevision) reasons.push('end-node-revision-changed')
    }
  }
  if (Object.prototype.hasOwnProperty.call(target, 'exact')) {
    const exact = exactAtTarget(index, target, entry)
    if (exact == null) reasons.push('target-range-invalid')
    else if (exact !== text(target.exact)) reasons.push('target-text-changed')
  }
  const detached = reasons.includes('end-target-detached') || reasons.includes('target-range-invalid')
  return Object.freeze({
    fresh: reasons.length === 0,
    stale: reasons.length > 0,
    detached,
    reason: reasons[0] || '',
    reasons: Object.freeze(reasons)
  })
}

function reviewBlock(entry) {
  return Object.freeze({
    projectId: entry.projectId,
    documentRole: entry.documentRole,
    documentId: entry.documentId,
    chapterId: entry.chapterId,
    documentRevision: entry.documentRevision,
    unitId: entry.unitId,
    unitRevision: entry.unitRevision,
    nodeId: entry.nodeId,
    nodeRevision: entry.nodeRevision,
    kind: entry.kind,
    text: entry.text,
    fullText: entry.fullText || entry.text,
    reviewStartOffset: Math.max(0, Number(entry.reviewStartOffset) || 0),
    order: entry.documentNodeOrder,
    sourceRefs: entry.sourceRefs
  })
}

export function getAuthoringReviewWindows(index, {
  documentId = '',
  maxNodes = 6,
  overlap = 1,
  maxChars = 12000
} = {}) {
  if (!index || !Array.isArray(index.entries)) return []
  const targetDocumentId = text(documentId).trim()
  const nodeLimit = Math.max(1, integer(maxNodes, 6))
  const overlapCount = Math.max(0, Math.min(nodeLimit - 1, integer(overlap, 1)))
  const charLimit = Math.max(1, integer(maxChars, 12000))
  const windows = []
  const documentIds = targetDocumentId
    ? [targetDocumentId]
    : unique(index.entries.map((entry) => entry.documentId))

  for (const currentDocumentId of documentIds) {
    const nodes = index.entries.filter((entry) => (
      entry.documentId === currentDocumentId && entry.text.trim()
    ))
    let cursor = 0
    while (cursor < nodes.length) {
      const selected = []
      let usedChars = 0
      let next = cursor
      while (next < nodes.length && selected.length < nodeLimit) {
        const entry = nodes[next]
        if (selected.length && usedChars + entry.text.length > charLimit) break
        selected.push(entry)
        usedChars += entry.text.length
        next += 1
      }
      if (!selected.length) {
        selected.push(nodes[cursor])
        next = cursor + 1
        usedChars = nodes[cursor].text.length
      }
      const first = selected[0]
      const last = selected[selected.length - 1]
      windows.push(Object.freeze({
        id: `review-window-${fnv1a([
          first.documentId,
          first.documentRevision,
          ...selected.map((entry) => entry.nodeId)
        ].join(':'))}`,
        projectId: first.projectId,
        documentRole: first.documentRole,
        documentId: first.documentId,
        chapterId: first.chapterId,
        documentRevision: first.documentRevision,
        firstNodeId: first.nodeId,
        lastNodeId: last.nodeId,
        usedChars,
        blocks: Object.freeze(selected.map(reviewBlock))
      }))
      if (next >= nodes.length) break
      cursor = Math.max(cursor + 1, next - overlapCount)
    }
  }
  return Object.freeze(windows)
}
