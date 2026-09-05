export const OBSERVER_EXCEPTION_REASONS = Object.freeze([
  'locked-conflict',
  'identity-ambiguity',
  'destructive-retcon'
])

export const AUTHORING_OBSERVATION_SCHEMA_VERSION = 1

function uniqueStrings(values) {
  return Object.freeze([...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))])
}

function positiveTimestamp(value, fallback = Date.now()) {
  const timestamp = Number(value)
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : fallback
}

export function normalizeAuthoringObserverTarget(value = {}) {
  const documentId = String(value.documentId || value.id || '').trim()
  const revision = String(value.revision || value.documentRevision || '').trim()
  const unitRevision = Number(value.unitRevision || 0)
  return Object.freeze({
    type: String(value.type || 'document'),
    id: String(value.id || documentId),
    projectId: String(value.projectId || value.memoryProjectId || ''),
    documentId,
    chapterId: String(value.chapterId || ''),
    unitId: String(value.unitId || ''),
    unitRevision: Number.isFinite(unitRevision) ? unitRevision : 0,
    revision,
    sourceDocumentRevision: String(value.sourceDocumentRevision || '')
  })
}

export function normalizeAuthoringObserverProvenance(value = {}, fallbackTarget = {}) {
  const target = normalizeAuthoringObserverTarget(value.target || {
    ...fallbackTarget,
    projectId: value.projectId || fallbackTarget.projectId,
    documentId: value.documentId || fallbackTarget.documentId,
    chapterId: value.chapterId || fallbackTarget.chapterId,
    unitId: value.unitId || fallbackTarget.unitId,
    unitRevision: value.unitRevision ?? fallbackTarget.unitRevision,
    sourceDocumentRevision: value.sourceDocumentRevision || fallbackTarget.sourceDocumentRevision
  })
  const unitRevision = Number(value.unitRevision ?? target.unitRevision ?? 0)
  return Object.freeze({
    schemaVersion: AUTHORING_OBSERVATION_SCHEMA_VERSION,
    derivedAt: positiveTimestamp(value.derivedAt),
    projectId: String(value.projectId || target.projectId || ''),
    documentId: String(value.documentId || target.documentId || ''),
    chapterId: String(value.chapterId || target.chapterId || ''),
    unitId: String(value.unitId || target.unitId || ''),
    unitRevision: Number.isFinite(unitRevision) ? unitRevision : 0,
    documentRevision: String(value.documentRevision || target.sourceDocumentRevision || target.revision || ''),
    sourceRefs: uniqueStrings(value.sourceRefs),
    target
  })
}

export function normalizeObservation(value, context = {}) {
  const provenance = normalizeAuthoringObserverProvenance(
    value.provenance || context.provenance || {},
    value.target || context.target || {}
  )
  const kind = String(value.kind)
  const subjectId = String(value.subjectId || '')
  const objectId = String(value.objectId || '')
  const identityUnresolved = kind === 'relation' && (!subjectId || !objectId)
  const status = value.status === 'candidate' || identityUnresolved ? 'candidate' : 'applied'
  return Object.freeze({
    id: String(value.id),
    kind,
    authority: 'derived',
    schemaVersion: provenance.schemaVersion,
    derivedAt: provenance.derivedAt,
    documentId: provenance.documentId,
    target: provenance.target,
    provenance,
    text: String(value.text || ''),
    subject: String(value.subject || ''),
    object: String(value.object || ''),
    subjectId,
    objectId,
    relation: String(value.relation || ''),
    sourceRefs: uniqueStrings(Array.isArray(value.sourceRefs) && value.sourceRefs.length
      ? value.sourceRefs
      : provenance.sourceRefs),
    baseRevision: String(value.baseRevision || ''),
    conflictsWith: value.conflictsWith ? String(value.conflictsWith) : null,
    status,
    identityStatus: value.identityStatus === 'ambiguous'
      ? 'ambiguous'
      : identityUnresolved ? 'unresolved' : 'resolved'
  })
}
