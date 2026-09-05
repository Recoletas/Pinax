import { selectAuthoringEvidenceEnvelope } from './authoringKnowledgeAnswerContract.js'

export const AUTHORING_INTERVENTION_REHEARSAL_RUN_SCHEMA_VERSION = 1

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
  return deepFreeze({ ok: false, reason: text(reason) || 'intervention-rehearsal-failed', ...details })
}

function targetRefForSession(session) {
  const documentId = text(session?.target?.documentId || session?.target?.chapterId, 240)
  const nodeId = text(session?.target?.nodeId, 240)
  return documentId && nodeId ? `node:${documentId}:${nodeId}` : ''
}

function targetFromGroup(group, evidenceByRef) {
  const targetRef = text(group?.targetRef, 240)
  const evidence = evidenceByRef.get(targetRef)
  const position = group?.position || {}
  if (!targetRef || !evidence || !position.documentId || !position.unitId || !position.nodeId) return null
  return {
    targetRef,
    role: 'downstream',
    title: text(group.title, 160) || evidence.label,
    originalText: evidence.excerpt,
    evidenceRefs: unique(group.evidenceRefs),
    position: {
      documentId: text(position.documentId, 240),
      chapterId: text(position.chapterId, 240),
      unitId: text(position.unitId, 240),
      nodeId: text(position.nodeId, 240),
      documentRevision: text(position.documentRevision, 240),
      unitRevision: text(position.unitRevision, 240),
      nodeRevision: text(position.nodeRevision, 240)
    }
  }
}

export function createAuthoringInterventionRehearsalRequest({ session, selection } = {}) {
  if (!session || session.kind !== 'authoring-intervention-session' || session.status !== 'ready') {
    return failure('intervention-session-invalid')
  }
  if (!selection || selection.kind !== 'authoring-intervention-rehearsal-selection') {
    return failure('intervention-selection-invalid')
  }
  if (selection.projectId !== session.projectId
    || selection.sessionFingerprint !== session.fingerprint
    || selection.interventionId !== session.intervention?.id) {
    return failure('intervention-selection-mismatch')
  }
  const interventionTargetRef = targetRefForSession(session)
  if (!interventionTargetRef || selection.interventionTargetRef !== interventionTargetRef) {
    return failure('intervention-target-mismatch')
  }
  const evidenceByRef = new Map(list(session.evidenceEnvelope?.evidence)
    .map((item) => [text(item?.sourceRef, 240), item]))
  const interventionEvidence = evidenceByRef.get(interventionTargetRef)
  if (!interventionEvidence) return failure('intervention-target-evidence-missing')
  const establishedByRef = new Map(list(session.impactGroups)
    .filter((group) => group?.status === 'established')
    .map((group) => [text(group.targetRef, 240), group]))
  const rewriteTargetRefs = unique(selection.rewriteTargetRefs)
  if (rewriteTargetRefs.some((targetRef) => !establishedByRef.has(targetRef))) {
    return failure('intervention-rewrite-target-invalid')
  }
  const blockedRefs = new Set([
    ...unique(selection.unchangedTargetRefs),
    ...unique(selection.excludedTargetRefs)
  ])
  if (rewriteTargetRefs.some((targetRef) => blockedRefs.has(targetRef))) {
    return failure('intervention-rewrite-target-conflict')
  }
  const targets = [{
    targetRef: interventionTargetRef,
    role: 'intervention',
    title: interventionEvidence.label,
    originalText: session.intervention.before,
    evidenceRefs: unique(session.intervention.evidenceRefs),
    position: { ...session.intervention.target }
  }]
  for (const targetRef of rewriteTargetRefs) {
    const target = targetFromGroup(establishedByRef.get(targetRef), evidenceByRef)
    if (!target) return failure('intervention-rewrite-target-evidence-missing', { targetRef })
    targets.push(target)
  }
  const evidenceRefs = unique([
    ...selection.evidenceRefs,
    ...targets.flatMap((target) => target.evidenceRefs),
    interventionTargetRef
  ])
  const evidenceEnvelope = selectAuthoringEvidenceEnvelope(session.evidenceEnvelope, evidenceRefs)
  if (!evidenceEnvelope) return failure('intervention-evidence-subset-invalid')
  const core = {
    schemaVersion: AUTHORING_INTERVENTION_REHEARSAL_RUN_SCHEMA_VERSION,
    kind: 'authoring-intervention-rehearsal-request',
    projectId: session.projectId,
    sessionFingerprint: session.fingerprint,
    selectionFingerprint: selection.fingerprint,
    directionId: selection.directionId,
    intervention: {
      id: session.intervention.id,
      operation: session.intervention.operation,
      before: session.intervention.before,
      after: session.intervention.after,
      rationale: session.intervention.rationale
    },
    targets,
    constraints: {
      unchangedTargetRefs: unique(selection.unchangedTargetRefs),
      excludedTargetRefs: unique(selection.excludedTargetRefs)
    },
    evidenceEnvelope,
    toolPolicy: {
      allowTools: false,
      toolChoice: 'none',
      authorizedSourceRefs: unique(evidenceEnvelope.sourceAuthorization?.sources.map((source) => source.sourceRef))
    }
  }
  return deepFreeze({
    ok: true,
    request: { ...core, fingerprint: `intervention-rehearsal-request-${hash(core)}` }
  })
}

export function normalizeAuthoringInterventionRehearsalDrafts(request, input) {
  if (!request || request.kind !== 'authoring-intervention-rehearsal-request') {
    return failure('intervention-rehearsal-request-invalid')
  }
  const rawDrafts = list(input?.drafts ?? input)
  const expected = new Map(request.targets.map((target) => [target.targetRef, target]))
  const seen = new Set()
  const drafts = []
  for (const raw of rawDrafts) {
    const targetRef = text(raw?.targetRef, 240)
    const draftText = text(raw?.text, 12000)
    if (!targetRef || !expected.has(targetRef)) return failure('intervention-provider-target-unauthorized', { targetRef })
    if (seen.has(targetRef)) return failure('intervention-provider-target-duplicate', { targetRef })
    if (!draftText) return failure('intervention-provider-draft-empty', { targetRef })
    seen.add(targetRef)
    const target = expected.get(targetRef)
    drafts.push({
      id: `intervention-ghost-${hash([request.fingerprint, targetRef])}`,
      kind: 'authoring-intervention-ghost',
      requestFingerprint: request.fingerprint,
      targetRef,
      role: target.role,
      title: target.title,
      target: target.position,
      originalText: target.originalText,
      text: draftText,
      status: 'fresh',
      revision: 0
    })
  }
  const missingTargetRefs = [...expected.keys()].filter((targetRef) => !seen.has(targetRef))
  if (missingTargetRefs.length) return failure('intervention-provider-target-missing', { missingTargetRefs })
  return deepFreeze({ ok: true, drafts })
}

export function createAuthoringInterventionRehearsalRun({ reconcileSession, generateDrafts } = {}) {
  if (typeof reconcileSession !== 'function' || typeof generateDrafts !== 'function') {
    throw new TypeError('authoring intervention rehearsal run requires reconcile and provider owners')
  }

  async function run({ session, selection } = {}, { signal = null } = {}) {
    if (signal?.aborted) return failure('intervention-rehearsal-aborted')
    const built = createAuthoringInterventionRehearsalRequest({ session, selection })
    if (!built.ok) return built
    const before = await reconcileSession(session, { signal })
    if (signal?.aborted) return failure('intervention-rehearsal-aborted')
    if (!before?.ok) return failure(before?.reason || 'intervention-reconcile-failed')
    if (before.stale) return failure('intervention-rehearsal-stale', { phase: 'before-provider', reconciliation: before })
    let generated
    try {
      generated = await generateDrafts(built.request, { signal })
    } catch (error) {
      if (signal?.aborted || error?.code === 'AGENT_REQUEST_ABORTED') {
        return failure('intervention-rehearsal-aborted')
      }
      return failure('intervention-provider-failed', {
        code: text(error?.code, 120),
        retryable: error?.retryable !== false
      })
    }
    if (signal?.aborted) return failure('intervention-rehearsal-aborted')
    const normalized = normalizeAuthoringInterventionRehearsalDrafts(built.request, generated)
    if (!normalized.ok) return normalized
    const after = await reconcileSession(session, { signal })
    if (signal?.aborted) return failure('intervention-rehearsal-aborted')
    if (!after?.ok) return failure(after?.reason || 'intervention-reconcile-failed')
    const stale = after.stale === true
    const core = {
      schemaVersion: AUTHORING_INTERVENTION_REHEARSAL_RUN_SCHEMA_VERSION,
      kind: 'authoring-intervention-rehearsal-result',
      projectId: session.projectId,
      sessionFingerprint: session.fingerprint,
      selectionFingerprint: selection.fingerprint,
      request: built.request,
      reconciliation: after,
      status: stale ? 'stale' : 'fresh',
      adoptable: !stale,
      drafts: normalized.drafts.map((draft) => ({ ...draft, status: stale ? 'stale' : 'fresh' }))
    }
    return deepFreeze({
      ok: true,
      result: { ...core, fingerprint: `intervention-rehearsal-result-${hash(core)}` }
    })
  }

  async function retry({ session, result, ghostId } = {}, { signal = null } = {}) {
    if (!result || result.kind !== 'authoring-intervention-rehearsal-result'
      || result.sessionFingerprint !== session?.fingerprint) return failure('intervention-result-invalid')
    const existing = result.drafts.find((draft) => draft.id === text(ghostId, 240))
    const target = result.request?.targets?.find((item) => item.targetRef === existing?.targetRef)
    if (!existing || !target) return failure('intervention-ghost-missing')
    const evidenceEnvelope = selectAuthoringEvidenceEnvelope(
      result.request.evidenceEnvelope,
      unique(target.evidenceRefs)
    )
    if (!evidenceEnvelope) return failure('intervention-evidence-subset-invalid')
    const retryCore = {
      ...result.request,
      targets: [target],
      evidenceEnvelope,
      toolPolicy: {
        allowTools: false,
        toolChoice: 'none',
        authorizedSourceRefs: unique(evidenceEnvelope.sourceAuthorization?.sources.map((source) => source.sourceRef))
      },
      retryOf: result.request.fingerprint
    }
    const retryRequest = deepFreeze({
      ...retryCore,
      fingerprint: `intervention-rehearsal-request-${hash(retryCore)}`
    })
    const before = await reconcileSession(session, { signal })
    if (signal?.aborted) return failure('intervention-rehearsal-aborted')
    if (!before?.ok) return failure(before?.reason || 'intervention-reconcile-failed')
    if (before.stale) return failure('intervention-rehearsal-stale', { phase: 'before-provider', reconciliation: before })
    let generated
    try {
      generated = await generateDrafts(retryRequest, { signal })
    } catch (error) {
      if (signal?.aborted || error?.code === 'AGENT_REQUEST_ABORTED') return failure('intervention-rehearsal-aborted')
      return failure('intervention-provider-failed', { code: text(error?.code, 120), retryable: error?.retryable !== false })
    }
    const normalized = normalizeAuthoringInterventionRehearsalDrafts(retryRequest, generated)
    if (!normalized.ok) return normalized
    const after = await reconcileSession(session, { signal })
    if (!after?.ok) return failure(after?.reason || 'intervention-reconcile-failed')
    const stale = after.stale === true
    const replacement = { ...normalized.drafts[0], id: existing.id, revision: Number(existing.revision || 0) + 1, status: stale ? 'stale' : 'fresh' }
    return deepFreeze({
      ok: true,
      result: {
        ...result,
        status: stale ? 'stale' : 'fresh',
        adoptable: !stale,
        reconciliation: after,
        drafts: result.drafts.map((draft) => draft.id === existing.id ? replacement : draft)
      }
    })
  }

  return Object.freeze({ run, retry })
}

export function editAuthoringInterventionGhost(result, ghostId, nextText) {
  if (!result || result.kind !== 'authoring-intervention-rehearsal-result') return failure('intervention-result-invalid')
  const id = text(ghostId, 240)
  const draftText = String(nextText ?? '')
  if (!id || !draftText.trim()) return failure('intervention-ghost-edit-invalid')
  let changed = false
  const drafts = result.drafts.map((draft) => {
    if (draft.id !== id) return draft
    changed = true
    return { ...draft, text: draftText, revision: Number(draft.revision || 0) + 1 }
  })
  if (!changed) return failure('intervention-ghost-missing')
  return deepFreeze({ ok: true, result: { ...result, drafts } })
}

export function discardAuthoringInterventionGhost(result, ghostId) {
  if (!result || result.kind !== 'authoring-intervention-rehearsal-result') return failure('intervention-result-invalid')
  const drafts = result.drafts.filter((draft) => draft.id !== text(ghostId, 240))
  if (drafts.length === result.drafts.length) return failure('intervention-ghost-missing')
  return deepFreeze({ ok: true, result: { ...result, drafts } })
}

export default createAuthoringInterventionRehearsalRun
