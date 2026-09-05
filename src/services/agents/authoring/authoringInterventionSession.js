import {
  createNarrativeIntervention,
  deriveCausalImpactGroups,
  normalizeTypedNarrativeLink,
  reconcileNarrativeIntervention
} from './authoringCausalSandbox.js'

export const AUTHORING_INTERVENTION_SESSION_SCHEMA_VERSION = 1

function text(value, limit = Infinity) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  return Number.isFinite(limit) ? normalized.slice(0, limit) : normalized
}

function list(value) {
  return Array.isArray(value) ? value : []
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
  return deepFreeze({ ok: false, reason: text(reason) || 'intervention-session-failed', ...details })
}

function interventionQuestion(input = {}) {
  return [
    `核对故事条件变化：${text(input.before, 800)} → ${text(input.after, 800)}`,
    text(input.rationale, 600) ? `作者目的：${text(input.rationale, 600)}` : '',
    '只查找能够证明原条件、对象身份和明确后续依赖的项目资料。'
  ].filter(Boolean).join('\n')
}

function typedLinkSignature(link = {}) {
  return JSON.stringify({
    id: text(link.id, 240),
    projectId: text(link.projectId, 240),
    relation: text(link.relation, 80),
    fromRef: text(link.fromRef, 240),
    toRef: text(link.toRef, 240),
    explicit: link.explicit === true,
    revision: text(link.revision, 240),
    evidenceRefs: [...new Set(list(link.evidenceRefs).map((ref) => text(ref, 240)).filter(Boolean))].sort()
  })
}

export function createAuthoringInterventionSession({
  prepareEvidence,
  collectEvidenceRevisions,
  readPositionIndex,
  readTypedLinks = null
} = {}) {
  if (typeof prepareEvidence !== 'function' || typeof readPositionIndex !== 'function') {
    throw new TypeError('authoring intervention session requires evidence and position readers')
  }

  async function prepare(input = {}, { signal = null } = {}) {
    if (signal?.aborted) return failure('intervention-session-aborted')
    const projectId = text(input.projectId)
    const target = input.target && typeof input.target === 'object' ? input.target : null
    if (!projectId || !target) return failure('intervention-target-missing')
    let positionIndex
    try {
      positionIndex = await readPositionIndex({ projectId, target, signal })
    } catch {
      return failure('intervention-position-read-failed')
    }
    if (signal?.aborted) return failure('intervention-session-aborted')
    const targetRef = `node:${text(target.documentId || target.chapterId)}:${text(target.nodeId)}`
    const subjectRef = text(input.subjectRef, 240)
    let rawTypedLinks = []
    if (typeof readTypedLinks === 'function') {
      try {
        rawTypedLinks = list(await readTypedLinks({ projectId, target, positionIndex, signal }))
      } catch {
        return failure('intervention-links-read-failed')
      }
    }
    if (signal?.aborted) return failure('intervention-session-aborted')
    const interventionEvidenceRefs = [
      targetRef,
      ...(subjectRef.startsWith('worldbook-entry:') ? [subjectRef] : [])
    ]
    const requiredSourceRefs = [
      ...interventionEvidenceRefs,
      ...rawTypedLinks.flatMap((link) => list(link?.evidenceRefs))
    ]
    let prepared
    try {
      prepared = await prepareEvidence({
        projectId,
        queryIntent: 'whole-book',
        question: interventionQuestion(input),
        target,
        requiredSourceRefs,
        signal
      })
    } catch {
      return failure('intervention-evidence-read-failed')
    }
    if (signal?.aborted) return failure('intervention-session-aborted')
    if (!prepared?.ok || !prepared.session?.evidenceEnvelope) {
      return failure(prepared?.reason || 'intervention-evidence-missing')
    }
    const intervention = createNarrativeIntervention({
      ...input,
      projectId,
      target,
      evidenceRefs: interventionEvidenceRefs
    }, {
      positionIndex,
      evidenceEnvelope: prepared.session.evidenceEnvelope
    })
    if (!intervention) return failure('intervention-invalid')
    const typedLinks = rawTypedLinks.map((link) => normalizeTypedNarrativeLink(link, {
      projectId,
      evidenceEnvelope: prepared.session.evidenceEnvelope
    })).filter(Boolean)
    const impactGroups = deriveCausalImpactGroups({
      intervention,
      links: typedLinks,
      positionIndex,
      evidenceEnvelope: prepared.session.evidenceEnvelope
    })
    const candidateGroups = deriveCausalImpactGroups({
      intervention,
      links: typedLinks,
      positionIndex,
      evidenceEnvelope: prepared.session.evidenceEnvelope,
      candidateOnly: true,
      maxGroups: 5
    })
    const core = {
      schemaVersion: AUTHORING_INTERVENTION_SESSION_SCHEMA_VERSION,
      kind: 'authoring-intervention-session',
      status: 'ready',
      projectId,
      target: intervention.target,
      intervention,
      typedLinks,
      impactGroups,
      candidateGroups,
      evidenceSession: prepared.session,
      evidenceEnvelope: prepared.session.evidenceEnvelope,
      positionFingerprint: positionIndex.fingerprint,
      createdAt: Number(input.now) || Date.now()
    }
    return deepFreeze({
      ok: true,
      session: {
        ...core,
        fingerprint: `intervention-session-${hash({
          interventionId: intervention.id,
          links: typedLinks.map((link) => link.id),
          impacts: impactGroups.map((group) => group.id),
          candidates: candidateGroups.map((group) => group.id),
          evidence: prepared.session.evidenceEnvelope.fingerprint,
          position: positionIndex.fingerprint
        })}`
      }
    })
  }

  async function reconcile(session, { signal = null } = {}) {
    if (!session || session.kind !== 'authoring-intervention-session') {
      return failure('intervention-session-invalid')
    }
    if (signal?.aborted) return failure('intervention-session-aborted')
    let positionIndex
    try {
      positionIndex = await readPositionIndex({
        projectId: session.projectId,
        target: session.target,
        signal
      })
    } catch {
      return failure('intervention-position-read-failed')
    }
    const position = reconcileNarrativeIntervention(session.intervention, positionIndex)
    let currentTypedLinks = []
    if (typeof readTypedLinks === 'function') {
      try {
        currentTypedLinks = list(await readTypedLinks({
          projectId: session.projectId,
          target: session.target,
          positionIndex,
          signal
        }))
      } catch {
        return failure('intervention-links-reconcile-failed')
      }
    }
    if (signal?.aborted) return failure('intervention-session-aborted')
    const expectedLinks = new Map(list(session.typedLinks).map((link) => [text(link.id, 240), link]))
    const actualLinks = new Map(currentTypedLinks.map((link) => [text(link?.id, 240), link]).filter(([id]) => id))
    const linkChanges = typeof readTypedLinks !== 'function' ? [] : [
      ...[...expectedLinks].flatMap(([id, expected]) => {
        const actual = actualLinks.get(id)
        if (!actual) return [{ linkId: id, reason: 'link-missing' }]
        if (typedLinkSignature(actual) === typedLinkSignature(expected)) return []
        return [{ linkId: id, reason: 'link-changed' }]
      }),
      ...[...actualLinks.keys()]
        .filter((id) => !expectedLinks.has(id))
        .map((linkId) => ({ linkId, reason: 'link-added' }))
    ]
    let currentRevisions = {}
    if (typeof collectEvidenceRevisions === 'function') {
      try {
        currentRevisions = await collectEvidenceRevisions(session.evidenceSession, { signal }) || {}
      } catch {
        return failure('intervention-evidence-reconcile-failed')
      }
    }
    const evidenceChanges = list(session.evidenceEnvelope?.sourceAuthorization?.sources).flatMap((source) => {
      const actual = text(currentRevisions?.[source.sourceRef])
      return actual === text(source.revision) ? [] : [{
        sourceRef: source.sourceRef,
        expected: text(source.revision),
        actual,
        reason: actual ? 'revision-changed' : 'source-missing'
      }]
    })
    const stale = Boolean(position?.stale || evidenceChanges.length || linkChanges.length)
    return deepFreeze({
      ok: true,
      stale,
      status: stale ? 'stale' : 'ready',
      reasons: [
        ...list(position?.reasons),
        ...evidenceChanges.map((item) => item.reason),
        ...linkChanges.map((item) => item.reason)
      ],
      evidenceChanges,
      linkChanges,
      position
    })
  }

  return Object.freeze({ prepare, reconcile })
}

export default createAuthoringInterventionSession
