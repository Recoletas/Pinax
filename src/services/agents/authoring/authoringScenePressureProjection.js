// F1-2: derive one evidence-bounded scene pressure from the already frozen C1
// AuthoringRunSession. This module is pure: no repository, storage or provider.

export const AUTHORING_SCENE_PRESSURE_SCHEMA_VERSION = 1

function text(value) {
  return String(value ?? '').trim()
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function unique(values = []) {
  return [...new Set(list(values).map(text).filter(Boolean))]
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

function fingerprint(prefix, value) {
  const source = JSON.stringify(stableValue(value))
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) deepFreeze(child, seen)
  return Object.isFrozen(value) ? value : Object.freeze(value)
}

function failure(reason, details = {}) {
  return deepFreeze({ ok: false, reason: text(reason) || 'scene-pressure-invalid', ...details })
}

function sourceRefForEntity(entity, kind) {
  const refs = unique(entity?.sourceRefs)
  const canonical = refs.find((ref) => ref.startsWith('worldbook-entry:'))
  if (canonical) return canonical
  const id = text(entity?.id)
  return id ? `${kind}:${id}` : ''
}

function entityProjection(entity, roles, kind) {
  const ref = sourceRefForEntity(entity, kind)
  const name = text(entity?.name || entity?.label)
  if (!ref || !name) return null
  return { ref, name, roles: unique(roles) }
}

function blockEvidence(block, candidate) {
  const refs = unique(block?.sourceRefs)
  const ref = text(candidate?.primarySourceRef) || refs[0]
  if (!ref) return null
  return {
    ref,
    kind: text(block?.kind || candidate?.kind || 'context'),
    label: text(candidate?.label) || text(block?.label) || ref,
    summary: text(block?.text || candidate?.representations?.summary || candidate?.representations?.full).slice(0, 280),
    revision: text(block?.revision || candidate?.revision),
    sourceRefs: refs
  }
}

function relationSeed(relation) {
  const subjectRef = text(relation?.subjectRef) || (relation?.subjectId ? `worldbook-entry:${relation.subjectId}` : '')
  const objectRef = text(relation?.objectRef) || (relation?.objectId ? `worldbook-entry:${relation.objectId}` : '')
  const summary = text(relation?.label || relation?.summary || relation?.relation)
  if (!summary || (!subjectRef && !objectRef)) return null
  return {
    kind: 'relationship-friction',
    subjectRefs: unique([subjectRef, objectRef]),
    evidenceRefs: unique(relation?.sourceRefs),
    summary
  }
}

function eventSeed(event) {
  const summary = text(event?.label || event?.summary || event?.text)
  if (!summary) return null
  return {
    kind: 'unresolved-event',
    subjectRefs: unique(event?.subjectRefs),
    evidenceRefs: unique(event?.sourceRefs),
    summary
  }
}

function intentSeed(intent) {
  const entityRef = `worldbook-entry:${text(intent?.entityId)}`
  const summary = text(intent?.content || intent?.label)
  if (!text(intent?.entityId) || !summary) return null
  return {
    kind: 'explicit-author-intent',
    subjectRefs: [entityRef],
    evidenceRefs: unique(intent?.sourceRefs),
    summary
  }
}

function referenceSeed(reference) {
  if (!['intent', 'fact'].includes(reference?.usageRole)) return null
  const summary = text(reference?.excerpt || reference?.label)
  if (!summary) return null
  return {
    kind: reference.usageRole === 'intent' ? 'explicit-author-intent' : 'information-gap',
    subjectRefs: [],
    evidenceRefs: unique(reference?.sourceRefs),
    summary
  }
}

export function buildAuthoringScenePressureProjection(session = {}) {
  if (session?.kind !== 'authoring-run-session' || session?.status !== 'prepared') {
    return failure('authoring-run-session-invalid')
  }
  const manifestFingerprint = text(session?.manifest?.fingerprint)
  const target = session?.target || session?.manifest?.target
  const projection = session?.sceneProjection
  if (!manifestFingerprint || !target || !projection?.projectionFingerprint) {
    return failure('authoring-run-session-incomplete')
  }

  const candidateById = new Map(list(session.candidates).map((candidate) => [text(candidate?.id), candidate]))
  const evidence = list(session.manifest?.blocks)
    .map((block) => blockEvidence(block, candidateById.get(text(block?.candidateId))))
    .filter(Boolean)
  const includedRefs = new Set(evidence.flatMap((item) => [item.ref, ...item.sourceRefs]))

  const roleMap = new Map()
  const addRole = (entity, role) => {
    const ref = sourceRefForEntity(entity, 'scene-character')
    if (!ref || !text(entity?.name)) return
    const previous = roleMap.get(ref) || { entity, roles: [] }
    previous.roles.push(role)
    roleMap.set(ref, previous)
  }
  addRole(projection.viewpointCharacter, 'viewpoint')
  addRole(projection.activeActor, 'active-actor')
  addRole(projection.dialogueTarget, 'dialogue-target')
  for (const person of list(projection.presentCharacters)) addRole(person, 'present')
  for (const person of list(projection.plannedCharacters)) addRole(person, 'planned')
  const participants = [...roleMap.values()]
    .map(({ entity, roles }) => entityProjection(entity, roles, 'scene-character'))
    .filter(Boolean)

  const locationRef = sourceRefForEntity(projection.location, 'scene-location')
  const location = locationRef && text(projection.location?.name)
    ? {
        ref: locationRef,
        name: text(projection.location.name),
        mapStatus: text(projection.location?.mapStatus || projection.location?.bindingStatus || 'unbound')
      }
    : null

  const pressureSeeds = [
    ...list(projection.activeRelations).map(relationSeed),
    ...list(projection.unresolvedEvents).map(eventSeed),
    ...list(session.sceneIntents).map(intentSeed),
    ...list(session.references).map(referenceSeed)
  ].filter(Boolean).map((seed) => ({
    ...seed,
    evidenceRefs: unique(seed.evidenceRefs).filter((ref) => includedRefs.has(ref))
  })).filter((seed) => seed.evidenceRefs.length > 0)

  const locationEvidence = evidence.find((item) => item.ref === locationRef || item.sourceRefs.includes(locationRef))
  if (location && locationEvidence && /规则|禁止|只能|必须|暗格|机关|失窃/u.test(locationEvidence.summary)) {
    pressureSeeds.push({
      kind: 'location-rule',
      subjectRefs: [location.ref],
      evidenceRefs: [locationEvidence.ref],
      summary: locationEvidence.summary
    })
  }

  const conflict = ['scene-conflict', 'worldbook-mismatch'].includes(text(projection.anchorStatus))
    || text(projection.worldbookStatus) === 'conflict'
  const availability = conflict ? 'conflict' : pressureSeeds.length ? 'ready' : 'insufficient'
  const exclusions = list(session.manifest?.excluded).map((item) => ({
    ref: unique(item?.sourceRefs)[0] || text(item?.candidateId),
    reason: text(item?.reason || 'excluded')
  })).filter((item) => item.ref)
  const targetFingerprint = fingerprint('scene-target', {
    projectId: target.projectId,
    chapterId: target.chapterId,
    documentId: target.documentId,
    unitId: target.unitId,
    nodeId: target.nodeId,
    documentRevision: target.documentRevision,
    unitRevision: target.unitRevision,
    nodeRevision: target.nodeRevision
  })
  const value = {
    kind: 'authoring-scene-pressure-projection',
    version: AUTHORING_SCENE_PRESSURE_SCHEMA_VERSION,
    targetFingerprint,
    sessionFingerprint: manifestFingerprint,
    availability,
    participants,
    location,
    evidence,
    pressureSeeds,
    exclusions
  }
  value.fingerprint = fingerprint('scene-pressure', value)
  return deepFreeze({ ok: true, projection: value })
}

export default buildAuthoringScenePressureProjection
