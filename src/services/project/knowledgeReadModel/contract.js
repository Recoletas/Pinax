/**
 * knowledgeReadModel/contract.js — frozen v1 contract for the read-only
 * knowledge query capability.
 *
 * Scope (night track K, 2026-09-05): in-process, pure, read-only functions.
 * - No provider tool registration, no UI, no store writes, no persistence.
 * - The trusted application boundary supplies an already-authorized frozen
 *   snapshot in `context`; the request can never widen authorization
 *   (project / perspective / branch come from context, not from request).
 * - v1 semantics frozen here: statuses, limits, reason codes, precedence.
 *
 * Status vocabulary: ready | partial | unknown | conflict | unsupported |
 * denied | aborted.
 */

export const KNOWLEDGE_READ_MODEL_SCHEMA_VERSION = 1

export const KNOWLEDGE_STATUSES = [
  'ready',
  'partial',
  'unknown',
  'conflict',
  'unsupported',
  'denied',
  'aborted'
]

export const QUESTION_KINDS = ['entity-context', 'fact-at-time', 'history-causes']

/**
 * v1.1 additive change (round-2 K21/K23): entity kind 'memory' allows exact
 * by-id memory references. Requests that never use it behave exactly as the
 * frozen v1; memories still cannot be attributed to other entities by
 * association.
 */
export const ENTITY_KINDS = ['worldbook-entry', 'runtime-character', 'runtime-place', 'geo-history-node', 'memory']

export const TIME_PRECISIONS = ['era', 'year', 'moment', 'unknown']

export const SOURCE_KINDS = [
  'worldbook-entry',
  'geo-history-node',
  'canonical-fact',
  'research-claim',
  'memory',
  'unadopted-draft'
]

/**
 * v1 limits. These are proposed safety bounds from the foundation plan
 * (§4.3 #8), not measured optima. They are hard caps: caller budgets may
 * only lower them, never raise them.
 */
export const KNOWLEDGE_LIMITS = Object.freeze({
  maxEntities: 8,
  maxOutputItems: 24,
  maxOutputChars: 12000,
  maxEntityRefs: 8,
  maxIdLength: 160,
  maxShortStringLength: 240,
  maxExcerptCharsPerItem: 1200,
  maxDiagnosticEntries: 12,
  maxCausalHops: 2,
  maxCausalItems: 24,
  maxConflictEntries: 12
})

/**
 * Low-sensitivity reason codes. Diagnostics carry codes plus at most public
 * entity keys — never hidden titles, counts, or content.
 */
export const REASON_CODES = Object.freeze({
  // request/context shape
  requestInvalid: 'request-invalid',
  contextInvalid: 'context-invalid',
  schemaVersionUnsupported: 'schema-version-unsupported',
  questionKindUnsupported: 'question-kind-unsupported',
  entityLimitExceeded: 'entity-limit-exceeded',
  // authorization
  projectMismatch: 'project-mismatch',
  crossProjectRef: 'cross-project-ref',
  contextNotAuthorized: 'context-not-authorized',
  sourceScopeExcluded: 'source-scope-excluded',
  unadoptedDraftExcluded: 'unadopted-draft-excluded',
  draftInformalOnly: 'draft-informal-only',
  // identity
  entityNotFound: 'entity-not-found',
  entityAmbiguous: 'entity-ambiguous',
  tombstonePresent: 'tombstone-present',
  legacyAliasUnmapped: 'legacy-alias-unmapped',
  // time
  storyTimeUnknown: 'story-time-unknown',
  timelineUndeclared: 'timeline-undeclared',
  timelineMismatch: 'timeline-mismatch',
  factTimeUnevidenced: 'fact-time-unevidenced',
  timePrecisionUnsupported: 'time-precision-unsupported',
  intervalEndUnknown: 'interval-end-unknown',
  // revisions
  authorRevisionUnavailable: 'author-revision-unavailable',
  manuscriptCutoffUnavailable: 'manuscript-cutoff-unavailable',
  sourceRevisionStale: 'source-revision-stale',
  // perspective
  perspectiveEntityUnknown: 'perspective-entity-unknown',
  characterKnowledgeUnrecorded: 'character-knowledge-unrecorded',
  authorOnlyContent: 'author-only-content',
  // runtime window
  runtimeWindowTruncated: 'runtime-window-truncated',
  // result shape
  outputTruncated: 'output-truncated',
  noMatchingData: 'no-matching-data',
  memoryEntityBindingUnavailable: 'memory-entity-binding-unavailable',
  // history-causes
  historyLinkOrphan: 'history-link-orphan',
  historyCycleTruncated: 'history-cycle-truncated',
  historyHopLimitReached: 'history-hop-limit-reached',
  // lifecycle
  aborted: 'aborted',
  // hardening (round-2 K22)
  snapshotUnfrozen: 'snapshot-unfrozen'
})

const STATUS_PRECEDENCE = Object.freeze({
  aborted: 6,
  denied: 5,
  unsupported: 4,
  conflict: 3,
  partial: 2,
  unknown: 1,
  ready: 0
})

export function worstStatus(left, right) {
  return STATUS_PRECEDENCE[left] >= STATUS_PRECEDENCE[right] ? left : right
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Reject unknown keys instead of silently dropping them: a future field must
 * never quietly become a no-op in a frozen v1. Returns the first unknown key
 * or null.
 */
const ENTITY_REF_KEYS = ['kind', 'id', 'projectId', 'alias']
const REQUEST_KEYS = [
  'schemaVersion', 'projectId', 'entityRefs', 'questionKind', 'storyTime',
  'authorRevision', 'manuscriptCutoff', 'perspective', 'sourceScope'
]

function firstUnknownKey(value, allowedKeys) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) return key
  }
  return null
}

function isNonEmptyString(value, maxLength = KNOWLEDGE_LIMITS.maxIdLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function normalizeEntityRef(raw) {
  if (!isPlainObject(raw)) return { error: 'entity-ref-must-be-object' }
  const unknownKey = firstUnknownKey(raw, ENTITY_REF_KEYS)
  if (unknownKey) return { error: 'unknown-field', detail: unknownKey }
  if (!ENTITY_KINDS.includes(raw.kind)) return { error: 'entity-kind-unsupported' }
  if (!isNonEmptyString(raw.id)) return { error: 'entity-id-required' }
  const ref = { kind: raw.kind, id: raw.id }
  if (raw.projectId !== undefined) {
    if (!isNonEmptyString(raw.projectId)) return { error: 'entity-project-id-invalid' }
    ref.projectId = raw.projectId
  }
  if (raw.alias !== undefined) {
    if (!isNonEmptyString(raw.alias, KNOWLEDGE_LIMITS.maxShortStringLength)) return { error: 'entity-alias-invalid' }
    ref.alias = raw.alias
  }
  return { ref }
}

function normalizeStoryTime(raw) {
  if (!isPlainObject(raw)) return { error: 'story-time-must-be-object' }
  if (!isNonEmptyString(raw.timelineId)) return { error: 'story-time-timeline-required' }
  const hasEra = raw.eraId !== undefined
  const hasOrdinal = raw.ordinal !== undefined
  if (!hasEra && !hasOrdinal) return { error: 'story-time-underdetermined' }
  const time = { timelineId: raw.timelineId, precision: 'unknown' }
  if (hasEra) {
    if (!isNonEmptyString(raw.eraId)) return { error: 'story-time-era-invalid' }
    time.eraId = raw.eraId
    time.precision = hasOrdinal ? 'year' : 'era'
  }
  if (hasOrdinal) {
    // Absurd ordinals (beyond any author timeline) are rejected outright:
    // they would silently lose precision in interval arithmetic.
    if (!Number.isInteger(raw.ordinal) || raw.ordinal < 0 || raw.ordinal > 1000000) {
      return { error: 'story-time-ordinal-invalid' }
    }
    time.ordinal = raw.ordinal
    if (!hasEra) return { error: 'story-time-ordinal-needs-era' }
  }
  if (raw.precision !== undefined) {
    if (!TIME_PRECISIONS.includes(raw.precision)) return { error: 'story-time-precision-invalid' }
    if (raw.precision === 'moment') {
      time.precision = 'moment'
    } else if (raw.precision !== 'unknown' && raw.precision !== time.precision) {
      return { error: 'story-time-precision-mismatch' }
    }
  }
  if (raw.label !== undefined) {
    if (!isNonEmptyString(raw.label, KNOWLEDGE_LIMITS.maxShortStringLength)) return { error: 'story-time-label-invalid' }
    time.label = raw.label
  }
  return { time }
}

function normalizePerspective(raw) {
  if (raw === undefined) return { perspective: { viewer: 'author' } }
  if (!isPlainObject(raw)) return { error: 'perspective-must-be-object' }
  if (raw.viewer === 'author') {
    if (raw.characterRef !== undefined) return { error: 'author-perspective-has-no-character' }
    return { perspective: { viewer: 'author' } }
  }
  if (raw.viewer !== 'character') return { error: 'perspective-viewer-unsupported' }
  const character = normalizeEntityRef(raw.characterRef)
  if (character.error) return { error: `perspective-character-${character.error}` }
  return { perspective: { viewer: 'character', characterRef: character.ref } }
}

function normalizeSourceScope(raw) {
  if (raw === undefined) {
    return {
      sourceScope: {
        includeSources: SOURCE_KINDS.filter((kind) => kind !== 'unadopted-draft'),
        includeUnadoptedDrafts: false
      }
    }
  }
  if (!isPlainObject(raw)) return { error: 'source-scope-must-be-object' }
  const scope = {}
  if (raw.includeSources !== undefined) {
    if (!Array.isArray(raw.includeSources) || raw.includeSources.length === 0) {
      return { error: 'source-scope-include-sources-invalid' }
    }
    for (const kind of raw.includeSources) {
      if (!SOURCE_KINDS.includes(kind)) return { error: 'source-scope-kind-unsupported' }
    }
    scope.includeSources = [...new Set(raw.includeSources)]
  } else {
    scope.includeSources = SOURCE_KINDS.filter((kind) => kind !== 'unadopted-draft')
  }
  if (raw.includeUnadoptedDrafts !== undefined) {
    if (typeof raw.includeUnadoptedDrafts !== 'boolean') return { error: 'source-scope-drafts-flag-invalid' }
    scope.includeUnadoptedDrafts = raw.includeUnadoptedDrafts
  } else {
    scope.includeUnadoptedDrafts = false
  }
  if (scope.includeUnadoptedDrafts) {
    if (!Array.isArray(raw.draftIds) || raw.draftIds.length === 0
      || !raw.draftIds.every((id) => isNonEmptyString(id))) {
      // Unadopted drafts are informal sources: they only enter the result via
      // an explicit id allowlist from the caller, never by bulk inclusion.
      return { error: 'source-scope-draft-ids-required' }
    }
    scope.draftIds = [...new Set(raw.draftIds)]
  }
  if (raw.runtimeBranchId !== undefined) {
    if (!isNonEmptyString(raw.runtimeBranchId)) return { error: 'source-scope-branch-invalid' }
    scope.runtimeBranchId = raw.runtimeBranchId
  }
  return { sourceScope: scope }
}

/**
 * Validate + normalize a query request. Returns { ok, request, errors }.
 * Normalization never widens the request; unknown fields are rejected so
 * future fields cannot silently become no-ops.
 */
export function normalizeKnowledgeRequest(request) {
  const errors = []
  if (!isPlainObject(request)) {
    return { ok: false, request: null, errors: [{ path: 'request', code: 'request-invalid' }] }
  }
  if (request.schemaVersion !== KNOWLEDGE_READ_MODEL_SCHEMA_VERSION) {
    return {
      ok: false,
      request: null,
      errors: [{ path: 'schemaVersion', code: 'schema-version-unsupported' }]
    }
  }
  if (!isNonEmptyString(request.projectId)) {
    return { ok: false, request: null, errors: [{ path: 'projectId', code: 'request-invalid' }] }
  }
  if (!Array.isArray(request.entityRefs) || request.entityRefs.length === 0) {
    return { ok: false, request: null, errors: [{ path: 'entityRefs', code: 'request-invalid' }] }
  }
  const unknownTopKey = firstUnknownKey(request, REQUEST_KEYS)
  if (unknownTopKey) {
    return {
      ok: false,
      request: null,
      errors: [{ path: unknownTopKey, code: 'unknown-field' }]
    }
  }
  if (request.entityRefs.length > KNOWLEDGE_LIMITS.maxEntities) {
    return {
      ok: false,
      request: null,
      errors: [{
        path: 'entityRefs',
        code: 'entity-limit-exceeded',
        limit: KNOWLEDGE_LIMITS.maxEntities
      }]
    }
  }
  const entityRefs = []
  request.entityRefs.forEach((raw, index) => {
    const normalized = normalizeEntityRef(raw)
    if (normalized.error) {
      errors.push({ path: `entityRefs.${index}`, code: normalized.error })
      return
    }
    entityRefs.push(normalized.ref)
  })
  if (!QUESTION_KINDS.includes(request.questionKind)) {
    errors.push({ path: 'questionKind', code: 'question-kind-unsupported' })
  }
  let storyTime = null
  if (request.storyTime !== undefined) {
    const normalized = normalizeStoryTime(request.storyTime)
    if (normalized.error) {
      errors.push({ path: 'storyTime', code: normalized.error })
    } else {
      storyTime = normalized.time
      if (request.questionKind === 'entity-context') {
        // entity-context tolerates an optional time focus; fact-at-time requires one.
      }
    }
  }
  if (request.questionKind === 'fact-at-time' && !storyTime) {
    errors.push({ path: 'storyTime', code: 'story-time-required-for-fact-at-time' })
  }
  let manuscriptCutoff = null
  if (request.manuscriptCutoff !== undefined) {
    if (!isNonEmptyString(request.manuscriptCutoff)) {
      errors.push({ path: 'manuscriptCutoff', code: 'request-invalid' })
    } else {
      manuscriptCutoff = request.manuscriptCutoff
    }
  }
  let authorRevision = null
  if (request.authorRevision !== undefined) {
    if (!isNonEmptyString(request.authorRevision)) {
      errors.push({ path: 'authorRevision', code: 'request-invalid' })
    } else {
      authorRevision = request.authorRevision
    }
  }
  const perspective = normalizePerspective(request.perspective)
  if (perspective.error) {
    errors.push({ path: 'perspective', code: perspective.error })
  }
  const sourceScope = normalizeSourceScope(request.sourceScope)
  if (sourceScope.error) {
    errors.push({ path: 'sourceScope', code: sourceScope.error })
  }
  if (errors.length > 0) return { ok: false, request: null, errors }

  const normalized = {
    schemaVersion: KNOWLEDGE_READ_MODEL_SCHEMA_VERSION,
    projectId: request.projectId,
    entityRefs,
    questionKind: request.questionKind,
    perspective: perspective.perspective,
    sourceScope: sourceScope.sourceScope
  }
  if (storyTime) normalized.storyTime = storyTime
  if (manuscriptCutoff) normalized.manuscriptCutoff = manuscriptCutoff
  if (authorRevision) normalized.authorRevision = authorRevision
  return { ok: true, request: Object.freeze(normalized), errors: [] }
}

function looksLikeAbortSignal(value) {
  return isPlainObject(value)
    && typeof value.aborted === 'boolean'
    && (value.addEventListener === undefined || typeof value.addEventListener === 'function')
}

/**
 * Validate the trusted context. The context must carry an explicitly
 * authorized snapshot: project identity, worldbook binding, and the exact
 * collections the caller decided to share. Anything missing fails closed.
 */
export function validateKnowledgeContext(context) {
  const errors = []
  if (!isPlainObject(context)) {
    return { ok: false, errors: [{ path: 'context', code: 'context-invalid' }] }
  }
  const snapshot = context.snapshot
  if (!isPlainObject(snapshot)) {
    return { ok: false, errors: [{ path: 'context.snapshot', code: 'context-invalid' }] }
  }
  if (snapshot.schemaVersion !== KNOWLEDGE_READ_MODEL_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [{ path: 'context.snapshot.schemaVersion', code: 'schema-version-unsupported' }]
    }
  }
  if (!isPlainObject(snapshot.project) || !isNonEmptyString(snapshot.project.id)) {
    errors.push({ path: 'context.snapshot.project', code: 'context-invalid' })
  }
  if (!isPlainObject(snapshot.worldbook) || !isNonEmptyString(snapshot.worldbook.id)) {
    errors.push({ path: 'context.snapshot.worldbook', code: 'context-invalid' })
  } else if (
    isPlainObject(snapshot.project)
    && isNonEmptyString(snapshot.project.worldbookId)
    && snapshot.project.worldbookId !== snapshot.worldbook.id
  ) {
    errors.push({ path: 'context.snapshot.project.worldbookId', code: 'context-not-authorized' })
  }
  if (context.signal !== undefined && !looksLikeAbortSignal(context.signal)) {
    errors.push({ path: 'context.signal', code: 'context-invalid' })
  }
  if (context.budget !== undefined) {
    if (!isPlainObject(context.budget)) {
      errors.push({ path: 'context.budget', code: 'context-invalid' })
    } else {
      for (const key of ['maxOutputItems', 'maxOutputChars']) {
        const value = context.budget[key]
        if (value === undefined) continue
        if (!Number.isInteger(value) || value <= 0 || value > KNOWLEDGE_LIMITS[key]) {
          errors.push({ path: `context.budget.${key}`, code: 'context-invalid', limit: KNOWLEDGE_LIMITS[key] })
        }
      }
    }
  }
  return { ok: errors.length === 0, errors }
}

export function contextBudget(context) {
  const budget = context && isPlainObject(context.budget) ? context.budget : {}
  return {
    maxOutputItems: budget.maxOutputItems ?? KNOWLEDGE_LIMITS.maxOutputItems,
    maxOutputChars: budget.maxOutputChars ?? KNOWLEDGE_LIMITS.maxOutputChars
  }
}

export function createEmptyResult() {
  return {
    schemaVersion: KNOWLEDGE_READ_MODEL_SCHEMA_VERSION,
    status: 'ready',
    facts: [],
    excerpts: [],
    hypotheses: [],
    conflicts: [],
    coverage: {
      requestedEntities: 0,
      resolvedEntities: 0,
      ambiguousRefs: [],
      unresolvedRefs: [],
      truncated: false,
      excludedByPolicy: {},
      timeUnknownCount: 0,
      windowTruncated: false
    },
    dependencies: {
      snapshotRevision: null,
      worldbookRevision: null,
      runtimeWindow: null,
      scopeRevisions: {},
      returnedRevisions: {}
    },
    diagnostics: [],
    fingerprint: null
  }
}

export function addDiagnostic(result, code, detail) {
  if (result.diagnostics.length >= KNOWLEDGE_LIMITS.maxDiagnosticEntries) return
  const entry = { code }
  if (detail !== undefined) entry.detail = detail
  result.diagnostics.push(entry)
}

export function promoteStatus(result, status) {
  result.status = worstStatus(result.status, status)
}

/**
 * Deterministic JSON: object keys sorted, arrays preserved. Used for
 * fingerprints and scope revisions; must be stable across runs.
 */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined'
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

/** FNV-1a 32-bit hex digest — small, dependency-free, deterministic. */
export function hashText(text) {
  let hash = 0x811c9dc5
  const input = String(text)
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function fingerprintParts(parts) {
  return hashText(stableStringify(parts))
}

/**
 * Deep-freeze helper for trusted callers assembling an authorized snapshot.
 * Freezing is the caller's job before calling queryKnowledge; this utility
 * exists so the "read-only after freeze" invariant is easy to satisfy and to
 * verify (eval compares hashes before/after queries).
 */
export function freezeKnowledgeSnapshot(value) {
  const seen = new Set()
  function walk(node) {
    if (node === null || typeof node !== 'object' || seen.has(node)) return node
    seen.add(node)
    Object.freeze(node)
    for (const key of Object.keys(node)) walk(node[key])
    return node
  }
  return walk(value)
}

/**
 * True when the value (and everything reachable) is frozen. Scope building
 * requires this: a scope must never alias an object the caller could still
 * mutate, otherwise its alias index silently drifts from the content.
 */
export function isDeepFrozen(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return true
  if (seen.has(value)) return true
  seen.add(value)
  if (!Object.isFrozen(value)) return false
  return Object.values(value).every((item) => isDeepFrozen(item, seen))
}

/**
 * Hash of a (possibly frozen) value. Used by eval to prove queries do not
 * mutate their inputs; also used for scope revisions over collections.
 */
export function hashValue(value) {
  return hashText(stableStringify(value))
}
