import { canonicalJson, fingerprintJson, withFingerprint } from '../../../../shared/collaboration/canonicalJson.js'
import {
  validateCollaborableArtifact,
  validateStableLocator
} from '../../../../shared/collaboration/contracts.js'
import {
  createAuthoringInterventionRehearsalScope,
  selectAuthoringInterventionRehearsalDirection
} from './authoringInterventionRehearsal.js'
import { createAuthoringInterventionRehearsalRequest } from './authoringInterventionRehearsalRun.js'

const ARTIFACT_KINDS = new Set(['intervention', 'direction-set', 'impact-group', 'rehearsal-branch'])

function text (value, limit = 240) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function rawText (value, limit = 12_000) {
  return String(value ?? '').trim().slice(0, limit)
}

function list (value) {
  return Array.isArray(value) ? value : []
}

function revision (value) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  return text(value, 160)
}

function deepFreeze (value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) deepFreeze(child, seen)
  return Object.freeze(value)
}

function failure (reason) {
  return Object.freeze({ ok: false, reason })
}

function projectFingerprint (projectId) {
  const id = text(projectId)
  return id ? fingerprintJson({ projectId: id }) : ''
}

function targetLocator (target, projectId) {
  const locator = {
    projectFingerprint: projectFingerprint(projectId),
    documentId: text(target?.documentId || target?.chapterId),
    documentRevision: revision(target?.documentRevision),
    unitId: text(target?.unitId),
    unitRevision: revision(target?.unitRevision),
    nodeId: text(target?.nodeId),
    nodeRevision: revision(target?.nodeRevision)
  }
  return validateStableLocator(locator).valid ? Object.freeze(locator) : null
}

function evidenceLocator (evidence, projectId) {
  const source = evidence?.locator || {}
  const common = {
    kind: text(source.kind, 40),
    projectFingerprint: projectFingerprint(projectId),
    sourceRevision: revision(evidence?.revision)
  }
  let locator
  if (common.kind === 'manuscript') {
    locator = {
      ...common,
      documentId: text(source.documentId || source.chapterId),
      chapterId: text(source.chapterId || source.documentId)
    }
    for (const key of ['unitId', 'nodeId']) {
      const value = text(source[key])
      if (value) locator[key] = value
    }
    if (Number.isSafeInteger(source.start) && source.start >= 0) locator.startOffset = source.start
    if (Number.isSafeInteger(source.end) && source.end >= 0) locator.endOffset = source.end
  } else if (common.kind === 'worldbook-entry') {
    locator = { ...common, worldbookId: text(source.worldbookId), entryId: text(source.entryId) }
  } else if (common.kind === 'outline-node') {
    locator = { ...common, nodeId: text(source.nodeId) }
  } else if (common.kind === 'exploration') {
    locator = { ...common, documentId: text(source.documentId) }
  } else if (common.kind === 'memory-source') {
    locator = { ...common, memoryId: text(source.memoryId) }
  } else if (common.kind === 'history') {
    locator = { ...common, historyId: text(source.historyId) }
  } else if (common.kind === 'scene') {
    locator = { ...common, chapterId: text(source.chapterId), unitId: text(source.unitId) }
    const anchorId = text(source.anchorId)
    if (anchorId) locator.anchorId = anchorId
  } else {
    return null
  }
  return validateStableLocator(locator).valid ? Object.freeze(locator) : null
}

function sourceRevisions (target, evidenceLocators) {
  const entries = []
  for (const locator of [target, ...evidenceLocators]) {
    const fingerprint = fingerprintJson(locator)
    const revisions = Object.fromEntries(Object.entries(locator)
      .filter(([key]) => key === 'sourceRevision' || key.endsWith('Revision')))
    const revisionKeys = Object.keys(revisions)
    const value = revisionKeys.length === 1 && revisionKeys[0] === 'sourceRevision'
      ? revisions.sourceRevision
      : fingerprintJson(revisions)
    entries.push([`locator:${fingerprint}`, value])
  }
  if (!entries.length || entries.some(([, value]) => value === '')) return null
  return Object.freeze(Object.fromEntries(entries))
}

function matchingSessionAndScope (session, scope) {
  const intervention = session?.intervention
  const shapeMatches = Boolean(
    session?.kind === 'authoring-intervention-session'
    && session.status === 'ready'
    && Object.isFrozen(scope)
    && intervention?.kind === 'narrative-intervention'
    && intervention.projectId === session.projectId
    && intervention.positionFingerprint === session.positionFingerprint
    && scope?.kind === 'authoring-intervention-rehearsal-scope'
    && scope.projectId === session.projectId
    && scope.sessionFingerprint === session.fingerprint
    && scope.interventionId === intervention.id
    && text(scope.fingerprint, 160)
  )
  if (!shapeMatches) return false
  const candidateReviews = Object.fromEntries(list(scope.reviews)
    .map(review => [text(review?.groupId), text(review?.decision, 40)])
    .filter(([groupId, decision]) => groupId && decision))
  const rebuilt = createAuthoringInterventionRehearsalScope({ session, candidateReviews })
  try {
    return rebuilt.ok && canonicalJson(rebuilt.scope) === canonicalJson(scope)
  } catch {
    return false
  }
}

function evidenceIndex (session) {
  return new Map(list(session?.evidenceEnvelope?.evidence)
    .map(item => [text(item?.sourceRef), item])
    .filter(([sourceRef]) => sourceRef))
}

function exactEvidence (session, refs) {
  const expected = [...new Set(list(refs).map(ref => text(ref)).filter(Boolean))]
  const byRef = evidenceIndex(session)
  const values = expected.map(ref => byRef.get(ref))
  if (values.some(value => !value)) return null
  const mapped = values.map(value => ({
    authority: text(value.authority, 40),
    label: text(value.label, 160),
    excerpt: rawText(value.excerpt, 1_200),
    revision: revision(value.revision),
    locator: evidenceLocator(value, session.projectId)
  }))
  return mapped.every(item => item.locator) ? mapped : null
}

function locatorForRef (session, sourceRef) {
  const evidence = evidenceIndex(session).get(text(sourceRef))
  return evidence ? evidenceLocator(evidence, session.projectId) : null
}

function visibleEvidence (evidence) {
  return evidence.map(item => ({
    authority: item.authority,
    label: item.label,
    excerpt: item.excerpt,
    revision: item.revision,
    locator: item.locator
  }))
}

function artifact (core) {
  const value = withFingerprint(core)
  return validateCollaborableArtifact(value).valid ? deepFreeze(value) : null
}

function makeArtifact ({ artifactId, kind, target, evidence, revisionLocators = [], visiblePayload, authority }) {
  const refs = evidence.map(item => item.locator)
  const revisions = sourceRevisions(target, [...refs, ...revisionLocators])
  if (!revisions) return null
  return artifact({
    schemaVersion: 1,
    artifactId: text(artifactId),
    kind,
    target,
    sourceRevisions: revisions,
    evidenceRefs: refs,
    visiblePayload,
    authority
  })
}

function interventionArtifact (session, scope) {
  if (!matchingSessionAndScope(session, scope)) return null
  const intervention = session.intervention
  const target = targetLocator(intervention.target, session.projectId)
  const evidence = exactEvidence(session, intervention.evidenceRefs)
  if (!target || !evidence) return null
  return makeArtifact({
    artifactId: intervention.id,
    kind: 'intervention',
    target,
    evidence,
    visiblePayload: {
      operation: text(intervention.operation, 80),
      before: rawText(intervention.before, 1_600),
      after: rawText(intervention.after, 1_600),
      rationale: rawText(intervention.rationale, 800),
      evidence: visibleEvidence(evidence)
    },
    authority: 'author-frozen'
  })
}

function establishedScopeGroup (session, scope, candidate) {
  if (!candidate || candidate.status !== 'established') return null
  const sessionGroup = list(session.impactGroups).find(group => group === candidate)
  if (!sessionGroup) return null
  const scopeGroup = list(scope.directions)
    .flatMap(direction => list(direction?.targetGroups))
    .find(group => group === candidate)
  return scopeGroup || null
}

function directionArtifact (session, scope) {
  if (!matchingSessionAndScope(session, scope)) return null
  const sourceIntervention = interventionArtifact(session, scope)
  const target = targetLocator(session.target, session.projectId)
  const evidence = exactEvidence(session, scope.includedEvidenceRefs)
  if (!sourceIntervention || !target || !evidence) return null
  const directions = []
  for (const direction of list(scope.directions)) {
    const targets = []
    for (const group of list(direction?.targetGroups)) {
      if (!establishedScopeGroup(session, scope, group)) return null
      const locator = locatorForRef(session, group.targetRef)
      if (!locator) return null
      targets.push({
        groupId: text(group.id),
        title: text(group.title, 160),
        locator,
        evidence: list(group.evidenceRefs).map(ref => locatorForRef(session, ref))
      })
      if (targets.at(-1).evidence.some(item => !item)) return null
    }
    const declaredIds = list(direction?.targetRefs).map(ref => text(ref))
    const groupIds = list(direction?.targetGroups).map(group => text(group?.targetRef))
    if (!text(direction?.id, 120) || declaredIds.length !== groupIds.length
      || declaredIds.some((value, index) => value !== groupIds[index])) return null
    directions.push({
      directionId: text(direction.id, 120),
      label: text(direction.label, 160),
      intent: rawText(direction.intent, 800),
      targets
    })
  }
  if (!directions.length) return null
  const reviews = []
  for (const review of list(scope.reviews)) {
    const target = locatorForRef(session, review?.targetRef)
    const assignedEvidence = list(review?.evidenceRefs).map(ref => locatorForRef(session, ref))
    if (!target || assignedEvidence.some(item => !item)) return null
    reviews.push({
      groupId: text(review.groupId),
      decision: text(review.decision, 40),
      target,
      evidence: assignedEvidence
    })
  }
  const unchanged = list(scope.unchangedTargetRefs).map(ref => locatorForRef(session, ref))
  const excluded = list(scope.excludedTargetRefs).map(ref => locatorForRef(session, ref))
  if (unchanged.some(item => !item) || excluded.some(item => !item)) return null
  return makeArtifact({
    artifactId: scope.fingerprint,
    kind: 'direction-set',
    target,
    evidence,
    visiblePayload: {
      interventionArtifactFingerprint: sourceIntervention.fingerprint,
      constraints: { reviews, unchanged, excluded },
      directions
    },
    authority: 'derived-established'
  })
}

function impactArtifact (session, scope, impactGroup) {
  if (!matchingSessionAndScope(session, scope) || !establishedScopeGroup(session, scope, impactGroup)) return null
  const target = targetLocator(impactGroup.position, session.projectId)
  const evidenceRefs = [
    ...list(impactGroup.evidenceRefs),
    ...list(impactGroup.relationPath).flatMap(link => list(link?.evidenceRefs))
  ]
  const evidence = exactEvidence(session, evidenceRefs)
  const targetEvidenceLocator = locatorForRef(session, impactGroup.targetRef)
  if (!target || !evidence || !targetEvidenceLocator) return null
  const relations = []
  for (const link of list(impactGroup.relationPath)) {
    const from = locatorForRef(session, link?.fromRef)
    const to = locatorForRef(session, link?.toRef)
    if (!from || !to) return null
    relations.push({ relation: text(link.relation, 80), from, to })
  }
  return makeArtifact({
    artifactId: impactGroup.id,
    kind: 'impact-group',
    target,
    evidence,
    visiblePayload: {
      title: text(impactGroup.title, 160),
      status: 'established',
      reason: rawText(impactGroup.reason, 800),
      target: targetEvidenceLocator,
      relations
    },
    authority: 'derived-established'
  })
}

function matchingSelection (session, scope, selection) {
  if (selection?.kind !== 'authoring-intervention-rehearsal-selection'
    || selection.projectId !== session.projectId
    || selection.sessionFingerprint !== session.fingerprint
    || selection.scopeFingerprint !== scope.fingerprint
    || selection.interventionId !== scope.interventionId
    || selection.interventionTargetRef !== scope.interventionTargetRef) return null
  const direction = list(scope.directions).find(item => item?.id === selection.directionId)
  if (!direction) return null
  const canonicalSelection = selectAuthoringInterventionRehearsalDirection(scope, direction.id)
  try {
    if (!canonicalSelection.ok || canonicalJson(canonicalSelection.selection) !== canonicalJson(selection)) return null
  } catch {
    return null
  }
  const expectedTargets = list(direction.targetRefs).map(ref => text(ref))
  const selectedTargets = list(selection.rewriteTargetRefs).map(ref => text(ref))
  if (expectedTargets.length !== selectedTargets.length
    || expectedTargets.some((ref, index) => ref !== selectedTargets[index])
    || text(direction.label, 160) !== text(selection.label, 160)
    || rawText(direction.intent, 800) !== rawText(selection.intent, 800)) return null
  return direction
}

function branchArtifact (session, scope, selection, result) {
  if (!matchingSessionAndScope(session, scope) || !matchingSelection(session, scope, selection)) return null
  const canonicalRequest = createAuthoringInterventionRehearsalRequest({ session, selection })
  if (result?.kind !== 'authoring-intervention-rehearsal-result'
    || result.projectId !== session.projectId
    || result.sessionFingerprint !== session.fingerprint
    || result.selectionFingerprint !== selection.fingerprint
    || result.status !== 'fresh'
    || result.adoptable !== true
    || result.reconciliation?.stale === true
    || !canonicalRequest.ok
    || !sameRequest(canonicalRequest.request, result.request)
    || result.request?.kind !== 'authoring-intervention-rehearsal-request'
    || result.request.sessionFingerprint !== session.fingerprint
    || result.request.selectionFingerprint !== selection.fingerprint
    || result.request.directionId !== selection.directionId) return null
  const target = targetLocator(session.target, session.projectId)
  const requestEvidenceRefs = list(result.request?.evidenceEnvelope?.evidence).map(item => item?.sourceRef)
  const evidence = exactEvidence(session, requestEvidenceRefs)
  const requestTargets = new Map()
  for (const item of list(result.request?.targets)) {
    const ref = text(item?.targetRef)
    if (!ref || requestTargets.has(ref)) return null
    requestTargets.set(ref, item)
  }
  const drafts = list(result.drafts)
  if (!target || !evidence || !drafts.length || drafts.length !== requestTargets.size) return null
  const preview = []
  const seenTargetRefs = new Set()
  for (const draft of drafts) {
    const draftTargetRef = text(draft?.targetRef)
    const requestTarget = requestTargets.get(draftTargetRef)
    const locator = targetLocator(draft?.target, session.projectId)
    const requestLocator = targetLocator(requestTarget?.position, session.projectId)
    if (!requestTarget || !locator
      || !requestLocator
      || seenTargetRefs.has(draftTargetRef)
      || draft.status !== 'fresh'
      || draft.kind !== 'authoring-intervention-ghost'
      || draft.requestFingerprint !== result.request.fingerprint
      || text(requestTarget.targetRef) !== text(draft.targetRef)
      || text(requestTarget.role, 40) !== text(draft.role, 40)
      || text(requestTarget.title, 160) !== text(draft.title, 160)
      || canonicalJson(requestLocator) !== canonicalJson(locator)
      || rawText(requestTarget.originalText) !== rawText(draft.originalText)) return null
    seenTargetRefs.add(draftTargetRef)
    preview.push({
      role: text(draft.role, 40),
      title: text(draft.title, 160),
      target: locator,
      before: rawText(draft.originalText),
      after: rawText(draft.text),
      revision: Number.isSafeInteger(draft.revision) ? draft.revision : 0
    })
  }
  if (seenTargetRefs.size !== requestTargets.size
    || [...requestTargets.keys()].some(ref => !seenTargetRefs.has(ref))) return null
  const direction = list(scope.directions).find(item => item.id === selection.directionId)
  return makeArtifact({
    artifactId: result.fingerprint,
    kind: 'rehearsal-branch',
    target,
    evidence,
    revisionLocators: preview.map(item => item.target),
    visiblePayload: {
      direction: {
        directionId: text(direction.id, 120),
        label: text(direction.label, 160),
        intent: rawText(direction.intent, 800)
      },
      preview
    },
    authority: 'derived-plausible'
  })
}

function sameRequest (expected, actual) {
  try {
    return canonicalJson(expected) === canonicalJson(actual)
  } catch {
    return false
  }
}

export function toCollaborableArtifact ({ kind, session, scope, impactGroup = null, selection = null, result = null } = {}) {
  if (!ARTIFACT_KINDS.has(kind)) return failure('collaborable-artifact-kind-invalid')
  if ((kind === 'intervention' && (impactGroup || selection || result))
    || (kind === 'direction-set' && (impactGroup || selection || result))
    || (kind === 'impact-group' && (!impactGroup || selection || result))
    || (kind === 'rehearsal-branch' && (impactGroup || !selection || !result))) {
    return failure('collaborable-artifact-input-invalid')
  }
  const value = kind === 'intervention'
    ? interventionArtifact(session, scope)
    : kind === 'direction-set'
      ? directionArtifact(session, scope)
      : kind === 'impact-group'
        ? impactArtifact(session, scope, impactGroup)
        : branchArtifact(session, scope, selection, result)
  return value
    ? Object.freeze({ ok: true, artifact: value })
    : failure('collaborable-artifact-source-invalid')
}

export default toCollaborableArtifact
