import {
  buildWritingCandidateDiff,
  getWritingCandidateStaleReason,
  normalizeWritingCandidates
} from '../../../shared/writingCandidateContract.js'

export { buildWritingCandidateDiff, getWritingCandidateStaleReason, normalizeWritingCandidates }

export function createWritingCandidateRequest({ target, documentRevision, chapterId, question }) {
  const nodes = (Array.isArray(target?.nodes) ? target.nodes : (Array.isArray(target?.blocks) ? target.blocks : []))
    .map((node) => ({
      unitId: node?.unitId || null,
      unitRevision: node?.unitRevision ?? null,
      nodeId: node?.nodeId || node?.blockId || null,
      nodeRevision: node?.nodeRevision ?? node?.blockRevision ?? null,
      kind: node?.kind || 'prose',
      text: String(node?.text || ''),
      ...(node?.range ? { range: node.range } : {}),
      ...(node?.editorRange ? { editorRange: node.editorRange } : {})
    }))
    .filter((node) => node.nodeId)
  const targetKind = target?.kind === 'block' || target?.kind === 'paragraph'
    ? 'paragraph'
    : 'selection'
  return {
    question: String(question || '').trim(),
    target: {
      kind: targetKind,
      range: target?.range || null,
      text: String(target?.text || ''),
      nodeIds: nodes.map((node) => node.nodeId),
      nodes,
      nodeId: target?.nodeId || target?.blockId || null,
      unitId: target?.unitId || null,
      unitRevision: target?.unitRevision ?? null,
      nodeRevision: target?.nodeRevision ?? target?.blockRevision ?? null,
      revision: String(documentRevision ?? ''),
      chapterId: chapterId || null
    },
    fallback: {
      chapterId: chapterId || null,
      documentRevision: Number.isFinite(Number(documentRevision)) ? Number(documentRevision) : null,
      nodeId: target?.nodeId || target?.blockId || null,
      unitId: target?.unitId || null,
      unitRevision: target?.unitRevision ?? null,
      nodeRevision: target?.nodeRevision ?? target?.blockRevision ?? null,
      baseText: String(target?.text || ''),
      targetRange: target?.range || null,
      nodes,
      multiBlock: target?.kind === 'multi-selection'
    }
  }
}

export function normalizeWritingCandidateResponse(result, request) {
  const raw = result?.candidates
  const fallback = {
    ...request?.fallback,
    text: result?.replacement || '',
    rationale: result?.summary || '',
    resultId: result?.id || 'writing-candidate'
  }
  return normalizeWritingCandidates(raw, fallback)
}
