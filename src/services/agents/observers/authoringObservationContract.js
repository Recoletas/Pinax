export const OBSERVER_EXCEPTION_REASONS = Object.freeze([
  'locked-conflict',
  'identity-ambiguity',
  'destructive-retcon'
])

export function normalizeObservation(value) {
  return Object.freeze({
    id: String(value.id),
    kind: String(value.kind),
    authority: 'derived',
    text: String(value.text || ''),
    sourceRefs: [...new Set(value.sourceRefs || [])],
    baseRevision: String(value.baseRevision || ''),
    conflictsWith: value.conflictsWith ? String(value.conflictsWith) : null
  })
}
