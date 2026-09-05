import {
  assessAuthoringPositionFreshness,
  resolveAuthoringPosition
} from '../../writing/authoringPositionIndex.js'
import { selectAuthoringEvidenceEnvelope } from './authoringKnowledgeAnswerContract.js'

export const AUTHORING_CAUSAL_SANDBOX_SCHEMA_VERSION = 1

export const NARRATIVE_INTERVENTION_OPERATIONS = Object.freeze([
  'add-presence',
  'remove-presence',
  'change-location',
  'change-time',
  'replace-fact',
  'change-event',
  'change-knowledge',
  'reframe-function'
])

export const TYPED_NARRATIVE_LINK_RELATIONS = Object.freeze([
  'depicts',
  'asserts',
  'reveals',
  'changes',
  'present-in',
  'located-at',
  'knows',
  'causes',
  'precedes',
  'depends-on',
  'mentions',
  'similar-to'
])

const OPERATION_RELATIONS = Object.freeze({
  'add-presence': ['present-in', 'depicts', 'changes', 'depends-on'],
  'remove-presence': ['present-in', 'depicts', 'changes', 'depends-on'],
  'change-location': ['located-at', 'changes', 'depends-on', 'causes'],
  'change-time': ['precedes', 'changes', 'depends-on', 'causes', 'present-in'],
  'replace-fact': ['asserts', 'reveals', 'changes', 'depends-on', 'causes'],
  'change-event': ['asserts', 'reveals', 'changes', 'depends-on', 'causes'],
  'change-knowledge': ['reveals', 'knows', 'depends-on', 'changes'],
  'reframe-function': ['depicts', 'asserts', 'changes', 'depends-on']
})

const DETERMINISTIC_RELATIONS = new Set([
  'depicts',
  'asserts',
  'reveals',
  'changes',
  'present-in',
  'located-at',
  'depends-on'
])
const CANDIDATE_ONLY_RELATIONS = new Set(['mentions', 'similar-to'])
const OPERATIONS = new Set(NARRATIVE_INTERVENTION_OPERATIONS)
const RELATIONS = new Set(TYPED_NARRATIVE_LINK_RELATIONS)

function text(value, limit = Infinity) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  return Number.isFinite(limit) ? normalized.slice(0, limit) : normalized
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function unique(values, limit = 64) {
  return [...new Set(list(values).map((value) => text(value, 240)).filter(Boolean))].slice(0, limit)
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

function nodeTargetFromRef(sourceRef, projectId) {
  const match = /^node:([^:]+):([^:]+)$/.exec(text(sourceRef))
  return match ? { projectId, documentId: match[1], nodeId: match[2] } : null
}

function exactEvidenceSubset(evidenceEnvelope, evidenceRefs) {
  const refs = unique(evidenceRefs)
  if (!refs.length) return null
  return selectAuthoringEvidenceEnvelope(evidenceEnvelope, refs)
}

function isDeterministicLink(link) {
  if (DETERMINISTIC_RELATIONS.has(link.relation)) return true
  if (link.relation === 'causes' || link.relation === 'knows') return link.explicit === true
  return false
}

export function createNarrativeIntervention(input = {}, {
  positionIndex,
  evidenceEnvelope
} = {}) {
  const projectId = text(input.projectId)
  const operation = text(input.operation)
  const before = text(input.before, 1600)
  const after = text(input.after, 1600)
  if (!projectId || projectId !== text(positionIndex?.projectId) || !OPERATIONS.has(operation)) return null
  if (!before || !after || before === after) return null

  const position = resolveAuthoringPosition(positionIndex, input.target)
  if (!position) return null
  const target = {
    projectId,
    documentRole: position.documentRole,
    documentId: position.documentId,
    chapterId: position.chapterId,
    documentRevision: position.documentRevision,
    unitId: position.unitId,
    unitRevision: position.unitRevision,
    nodeId: position.nodeId,
    nodeRevision: position.nodeRevision
  }
  const evidenceRefs = unique(input.evidenceRefs)
  const targetRef = `node:${position.documentId}:${position.nodeId}`
  if (!evidenceRefs.includes(targetRef)) return null
  const evidence = exactEvidenceSubset(evidenceEnvelope, evidenceRefs)
  if (!evidence || evidence.projectId !== projectId) return null
  const subjectRef = text(input.subjectRef, 240)
  if (['add-presence', 'remove-presence', 'change-location', 'change-knowledge'].includes(operation) && !subjectRef) {
    return null
  }
  if (subjectRef.startsWith('worldbook-entry:') && !evidenceRefs.includes(subjectRef)) return null
  const core = {
    schemaVersion: AUTHORING_CAUSAL_SANDBOX_SCHEMA_VERSION,
    kind: 'narrative-intervention',
    projectId,
    operation,
    target,
    subjectRef,
    before,
    after,
    rationale: text(input.rationale, 800),
    evidenceRefs,
    evidenceFingerprint: evidence.fingerprint,
    positionFingerprint: positionIndex.fingerprint
  }
  return deepFreeze({ ...core, id: text(input.id) || `intervention-${hash(core)}` })
}

export function normalizeTypedNarrativeLink(input = {}, {
  projectId = '',
  evidenceEnvelope
} = {}) {
  const resolvedProjectId = text(input.projectId || projectId)
  const relation = text(input.relation)
  const fromRef = text(input.fromRef, 240)
  const toRef = text(input.toRef, 240)
  if (!resolvedProjectId || (projectId && resolvedProjectId !== text(projectId))) return null
  if (!RELATIONS.has(relation) || !fromRef || !toRef || fromRef === toRef) return null
  const evidenceRefs = unique(input.evidenceRefs)
  const sourceEndpoints = [fromRef, toRef].filter((ref) => (
    ref.startsWith('node:') || ref.startsWith('worldbook-entry:')
  ))
  if (sourceEndpoints.some((ref) => !evidenceRefs.includes(ref))) return null
  const evidence = exactEvidenceSubset(evidenceEnvelope, evidenceRefs)
  if (!evidence || evidence.projectId !== resolvedProjectId) return null
  const core = {
    schemaVersion: AUTHORING_CAUSAL_SANDBOX_SCHEMA_VERSION,
    kind: 'typed-narrative-link',
    projectId: resolvedProjectId,
    relation,
    fromRef,
    toRef,
    explicit: input.explicit === true,
    reason: text(input.reason, 600),
    evidenceRefs,
    evidenceFingerprint: evidence.fingerprint,
    revision: text(input.revision, 240)
  }
  return deepFreeze({ ...core, id: text(input.id) || `link-${hash(core)}` })
}

function targetSort(index, sourceRef) {
  const target = nodeTargetFromRef(sourceRef, index?.projectId)
  const entry = target ? resolveAuthoringPosition(index, target) : null
  return entry ? entry.documentOrder * 100000 + entry.documentNodeOrder : Number.MAX_SAFE_INTEGER
}

function pathStatus(path) {
  if (path.some((link) => CANDIDATE_ONLY_RELATIONS.has(link.relation))) return 'uncertain'
  if (path.every(isDeterministicLink) && path.some((link) => link.relation !== 'precedes')) return 'established'
  return 'plausible'
}

function pathReason(path) {
  return path.map((link) => link.reason || `${link.fromRef} ${link.relation} ${link.toRef}`).join(' ')
}

export function deriveCausalImpactGroups({
  intervention,
  links = [],
  positionIndex,
  evidenceEnvelope,
  includeCandidates = false,
  candidateOnly = false,
  maxGroups = 3
} = {}) {
  if (!intervention || intervention.kind !== 'narrative-intervention') return Object.freeze([])
  if (intervention.projectId !== text(positionIndex?.projectId)) return Object.freeze([])
  const freshness = assessAuthoringPositionFreshness(intervention.target, positionIndex)
  if (!freshness.fresh) return Object.freeze([])

  const allowed = new Set(OPERATION_RELATIONS[intervention.operation] || [])
  const normalizedLinks = list(links)
    .map((link) => normalizeTypedNarrativeLink(link, {
      projectId: intervention.projectId,
      evidenceEnvelope
    }))
    .filter((link) => link && (allowed.has(link.relation) || CANDIDATE_ONLY_RELATIONS.has(link.relation)))
  const startRefs = new Set([
    `node:${intervention.target.documentId}:${intervention.target.nodeId}`,
    intervention.subjectRef,
    ...intervention.evidenceRefs
  ].filter(Boolean))
  const paths = []

  // This is deliberately not a general graph traversal. F3-0 expands only two
  // operation-authorized hops from intervention anchors, then stops.
  for (const first of normalizedLinks) {
    if (!startRefs.has(first.fromRef)) continue
    paths.push([first])
    for (const second of normalizedLinks) {
      if (second.fromRef !== first.toRef || second.toRef === first.fromRef) continue
      paths.push([first, second])
    }
  }

  const byTarget = new Map()
  for (const path of paths) {
    const targetRef = path.at(-1).toRef
    const target = nodeTargetFromRef(targetRef, intervention.projectId)
    const position = target ? resolveAuthoringPosition(positionIndex, target) : null
    if (!position || startRefs.has(targetRef)) continue
    const status = pathStatus(path)
    if (candidateOnly ? status === 'established' : (status !== 'established' && !includeCandidates)) continue
    const evidenceRefs = unique(path.flatMap((link) => link.evidenceRefs))
    const evidence = exactEvidenceSubset(evidenceEnvelope, evidenceRefs)
    if (!evidence) continue
    const existing = byTarget.get(targetRef)
    const documentTitle = list(positionIndex?.documents)
      .find((document) => document.documentId === position.documentId)?.title
    const proposal = {
      targetRef,
      status,
      title: `${text(documentTitle) || position.chapterId || position.documentId} · ${text(position.text, 54)}`,
      reason: pathReason(path),
      relationPath: path.map((link) => ({
        linkId: link.id,
        relation: link.relation,
        fromRef: link.fromRef,
        toRef: link.toRef,
        evidenceRefs: link.evidenceRefs
      })),
      evidenceRefs,
      evidenceFingerprint: evidence.fingerprint,
      position: {
        documentId: position.documentId,
        chapterId: position.chapterId,
        unitId: position.unitId,
        nodeId: position.nodeId,
        documentRevision: position.documentRevision,
        unitRevision: position.unitRevision,
        nodeRevision: position.nodeRevision
      }
    }
    const rank = { established: 0, plausible: 1, uncertain: 2 }
    if (!existing || rank[proposal.status] < rank[existing.status]
      || proposal.relationPath.length < existing.relationPath.length) {
      byTarget.set(targetRef, proposal)
    }
  }

  const limit = Math.max(1, Math.min(includeCandidates || candidateOnly ? 5 : 3, Number(maxGroups) || 3))
  return deepFreeze([...byTarget.values()]
    .sort((left, right) => targetSort(positionIndex, left.targetRef) - targetSort(positionIndex, right.targetRef)
      || left.targetRef.localeCompare(right.targetRef))
    .slice(0, limit)
    .map((group) => ({
      ...group,
      id: `impact-${hash([intervention.id, group.targetRef, group.relationPath])}`
    })))
}

export function createCausalRehearsalDirections(impactGroups = []) {
  const established = list(impactGroups).filter((group) => group.status === 'established')
  if (!established.length) return Object.freeze([])
  const immediate = established.slice(0, 1).map((group) => group.targetRef)
  const cascading = established.slice(0, 3).map((group) => group.targetRef)
  const directions = [{
    id: 'minimal-repair',
    label: '最小修补',
    intent: '只调整最直接依赖这次改动的文本。',
    targetRefs: immediate
  }]
  if (cascading.length > immediate.length) {
    directions.push({
      id: 'causal-ripple',
      label: '连锁推演',
      intent: '沿已证实的依赖关系同步调整后续结果。',
      targetRefs: cascading
    })
  } else {
    directions.push({
      id: 'preserve-downstream',
      label: '保留后果',
      intent: '改写过渡原因，但尽量保留既有后续结果。',
      targetRefs: []
    })
  }
  return deepFreeze(directions)
}

export function reconcileNarrativeIntervention(intervention, positionIndex) {
  if (!intervention || intervention.kind !== 'narrative-intervention') return null
  const freshness = assessAuthoringPositionFreshness(intervention.target, positionIndex)
  return deepFreeze({
    interventionId: intervention.id,
    stale: !freshness.fresh || intervention.positionFingerprint !== positionIndex?.fingerprint,
    reasons: freshness.reasons,
    positionFingerprint: text(positionIndex?.fingerprint)
  })
}
