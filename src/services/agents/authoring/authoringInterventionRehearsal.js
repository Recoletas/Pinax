import { createCausalRehearsalDirections } from './authoringCausalSandbox.js'

export const AUTHORING_INTERVENTION_REHEARSAL_SCHEMA_VERSION = 1

function text(value, limit = Infinity) {
  const normalized = String(value ?? '').trim()
  return Number.isFinite(limit) ? normalized.slice(0, limit) : normalized
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function unique(values) {
  return [...new Set(list(values).map((value) => text(value, 240)).filter(Boolean))]
}

function hash(value) {
  const source = typeof value === 'string' ? value : JSON.stringify(value)
  let result = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    result ^= source.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(36)
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) deepFreeze(child, seen)
  return Object.freeze(value)
}

function failure(reason, details = {}) {
  return deepFreeze({ ok: false, reason, ...details })
}

function targetRefForSession(session) {
  const documentId = text(session?.target?.documentId || session?.target?.chapterId, 240)
  const nodeId = text(session?.target?.nodeId, 240)
  return documentId && nodeId ? `node:${documentId}:${nodeId}` : ''
}

export function createAuthoringInterventionRehearsalScope({
  session,
  candidateReviews = {}
} = {}) {
  if (!session || session.kind !== 'authoring-intervention-session' || session.status !== 'ready') {
    return failure('intervention-session-invalid')
  }
  const impactGroups = list(session.impactGroups).filter((group) => group?.status === 'established')
  if (!impactGroups.length) return failure('intervention-impact-missing')
  const candidateGroups = list(session.candidateGroups).filter((group) => group?.status !== 'established')
  const candidateById = new Map(candidateGroups.map((group) => [text(group?.id, 240), group]))
  const normalizedReviews = Object.entries(candidateReviews || {}).map(([groupId, decision]) => ({
    groupId: text(groupId, 240),
    decision: text(decision, 40)
  }))
  if (normalizedReviews.some((review) => (
    !candidateById.has(review.groupId) || !['exclude', 'keep'].includes(review.decision)
  ))) return failure('candidate-review-invalid')
  const reviewById = new Map(normalizedReviews.map((review) => [review.groupId, review.decision]))
  const pendingCandidateIds = candidateGroups
    .map((group) => text(group.id, 240))
    .filter((groupId) => !reviewById.has(groupId))
  if (pendingCandidateIds.length) {
    return failure('candidate-review-incomplete', { pendingCandidateIds })
  }
  const unchangedGroups = candidateGroups.filter((group) => reviewById.get(text(group.id, 240)) === 'keep')
  const excludedGroups = candidateGroups.filter((group) => reviewById.get(text(group.id, 240)) === 'exclude')
  const directions = createCausalRehearsalDirections(impactGroups).map((direction) => ({
    ...direction,
    targetGroups: direction.targetRefs.map((targetRef) => impactGroups.find((group) => group.targetRef === targetRef))
      .filter(Boolean),
    targetCount: direction.targetRefs.length
  }))
  if (!directions.length) return failure('intervention-direction-missing')
  const core = {
    schemaVersion: AUTHORING_INTERVENTION_REHEARSAL_SCHEMA_VERSION,
    kind: 'authoring-intervention-rehearsal-scope',
    projectId: session.projectId,
    sessionFingerprint: session.fingerprint,
    interventionId: session.intervention?.id,
    interventionTargetRef: targetRefForSession(session),
    directions,
    reviews: candidateGroups.map((group) => ({
      groupId: group.id,
      targetRef: group.targetRef,
      decision: reviewById.get(text(group.id, 240)),
      evidenceRefs: unique(group.evidenceRefs)
    })),
    unchangedTargetRefs: unique(unchangedGroups.map((group) => group.targetRef)),
    excludedTargetRefs: unique(excludedGroups.map((group) => group.targetRef)),
    includedEvidenceRefs: unique([
      ...impactGroups.flatMap((group) => group.evidenceRefs),
      ...unchangedGroups.flatMap((group) => group.evidenceRefs)
    ])
  }
  return deepFreeze({ ok: true, scope: { ...core, fingerprint: `intervention-scope-${hash(core)}` } })
}

export function selectAuthoringInterventionRehearsalDirection(scope, directionId) {
  if (!scope || scope.kind !== 'authoring-intervention-rehearsal-scope') {
    return failure('intervention-scope-invalid')
  }
  const direction = list(scope.directions).find((item) => text(item?.id, 120) === text(directionId, 120))
  if (!direction) return failure('intervention-direction-invalid')
  const blockedTargets = new Set([...list(scope.unchangedTargetRefs), ...list(scope.excludedTargetRefs)])
  if (list(direction.targetRefs).some((targetRef) => blockedTargets.has(targetRef))) {
    return failure('intervention-direction-conflict')
  }
  const targetEvidenceRefs = unique(list(direction.targetGroups).flatMap((group) => group?.evidenceRefs))
  const keptEvidenceRefs = unique(list(scope.reviews)
    .filter((review) => review.decision === 'keep')
    .flatMap((review) => review.evidenceRefs))
  const core = {
    schemaVersion: AUTHORING_INTERVENTION_REHEARSAL_SCHEMA_VERSION,
    kind: 'authoring-intervention-rehearsal-selection',
    projectId: scope.projectId,
    sessionFingerprint: scope.sessionFingerprint,
    scopeFingerprint: scope.fingerprint,
    interventionId: scope.interventionId,
    interventionTargetRef: scope.interventionTargetRef,
    directionId: direction.id,
    label: direction.label,
    intent: direction.intent,
    rewriteTargetRefs: unique(direction.targetRefs),
    unchangedTargetRefs: unique(scope.unchangedTargetRefs),
    excludedTargetRefs: unique(scope.excludedTargetRefs),
    evidenceRefs: unique([...targetEvidenceRefs, ...keptEvidenceRefs])
  }
  return deepFreeze({ ok: true, selection: { ...core, fingerprint: `intervention-selection-${hash(core)}` } })
}

export default createAuthoringInterventionRehearsalScope
