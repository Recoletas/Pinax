import { consequenceFingerprint } from '../../../../shared/authoringRehearsalConsequenceContract.js'

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function hash(value) {
  let result = 2166136261
  for (const character of String(value)) {
    result ^= character.charCodeAt(0)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(36)
}

function failure(reason) {
  return Object.freeze({ ok: false, reason })
}

export function buildAdoptedRehearsalMemoryProposal({
  adoptionReceipt,
  locator,
  consequence,
  content = '',
  supportText = ''
} = {}) {
  if (!adoptionReceipt?.adoptedText || !adoptionReceipt?.afterDocumentRevision) {
    return failure('adoption-receipt-required')
  }
  const bookId = text(locator?.bookId || locator?.projectId)
  const chapterId = text(locator?.chapterId)
  const writingUnitId = text(locator?.writingUnitId || locator?.unitId || adoptionReceipt?.insertedUnitId)
  const revision = text(locator?.revision || adoptionReceipt?.afterDocumentRevision)
  const adoptedText = text(locator?.text || adoptionReceipt.adoptedText)
  if (!bookId || !chapterId || !writingUnitId || !revision || !adoptedText || !consequence) {
    return failure('formal-source-required')
  }
  const remembered = text(content || supportText || consequence.content || consequence.name)
  const evidence = text(supportText || consequence.supportText || remembered)
  if (!remembered || !evidence || !adoptedText.includes(evidence)) {
    return failure('unsupported-by-adopted-text')
  }
  const start = adoptedText.indexOf(evidence)
  const end = start + evidence.length
  const consequenceId = consequenceFingerprint('adopted-consequence', consequence)
  const adoptionId = text(adoptionReceipt.transactionId || adoptionReceipt.candidateId || adoptionReceipt.observationSourceRef)
  const sourceRef = `unit:${chapterId}:${writingUnitId}`
  const proposalId = `mem_rehearsal_${hash(`${adoptionId}:${consequenceId}:${revision}:${start}:${end}`)}`
  return Object.freeze({
    ok: true,
    proposal: Object.freeze({
      id: proposalId,
      scope: 'project',
      scopeId: bookId,
      kind: consequence.kind === 'commitment' ? 'character-state' : 'plot-event',
      content: remembered,
      status: 'pending',
      authority: 'derived',
      derivedBy: 'prose-commit',
      sourceRef,
      sourceRefs: Object.freeze([`book:${bookId}`, `chapter:${chapterId}`, sourceRef]),
      sourceRevision: revision,
      metadata: Object.freeze({
        sourceType: 'adopted-rehearsal',
        title: '试演采用后的变化',
        adoptionId,
        consequenceFingerprint: consequenceId,
        range: Object.freeze({ start, end })
      })
    })
  })
}

export default buildAdoptedRehearsalMemoryProposal
