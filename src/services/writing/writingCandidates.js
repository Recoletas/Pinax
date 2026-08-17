import {
  buildWritingCandidateDiff,
  getWritingCandidateStaleReason,
  normalizeWritingCandidates
} from '../../../shared/writingCandidateContract.js'

export { buildWritingCandidateDiff, getWritingCandidateStaleReason, normalizeWritingCandidates }

export function createWritingCandidateRequest({ target, documentRevision, chapterId, question }) {
  const targetKind = target?.kind === 'block' || target?.kind === 'paragraph'
    ? 'paragraph'
    : 'selection'
  return {
    question: String(question || '').trim(),
    target: {
      kind: targetKind,
      range: target?.range || null,
      text: String(target?.text || ''),
      blockIds: Array.isArray(target?.blocks) ? target.blocks.map((block) => block.blockId).filter(Boolean) : [],
      blocks: Array.isArray(target?.blocks) ? target.blocks : [],
      blockId: target?.blockId || null,
      blockRevision: target?.blockRevision ?? null,
      revision: String(documentRevision ?? ''),
      chapterId: chapterId || null
    },
    fallback: {
      chapterId: chapterId || null,
      documentRevision: Number.isFinite(Number(documentRevision)) ? Number(documentRevision) : null,
      blockId: target?.blockId || null,
      blockRevision: target?.blockRevision ?? null,
      baseText: String(target?.text || ''),
      targetRange: target?.range || null,
      blocks: Array.isArray(target?.blocks) ? target.blocks : [],
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
