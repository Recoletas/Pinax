const RESULT_SCHEMA_VERSION = 1

const RESULT_STATUSES = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  STALE: 'stale',
  APPLIED: 'applied'
})

const SUGGESTION_TYPES = Object.freeze({
  TEXT: 'text-patch',
  OUTLINE: 'outline-item',
  ASSET: 'create-asset',
  REFERENCE: 'set-reference',
  OPTION: 'option',
  REVIEW: 'review',
  RUNTIME_EVENT: 'runtime-event',
  GENERATION: 'generation-request'
})

const ACTION_TYPES = Object.freeze({
  TEXT_PATCH: 'text-patch',
  OUTLINE_ITEM: 'outline-item',
  CREATE_ASSET: 'create-asset',
  SET_REFERENCE: 'set-reference',
  RUNTIME_CANDIDATE: 'runtime-candidate',
  GENERATION_REQUEST: 'generation-request',
  REVIEW_ONLY: 'review-only'
})

const SIDE_EFFECT_TYPES = Object.freeze({
  ADD_OUTLINE_ITEM: 'add-outline-item',
  CREATE_ASSET: 'create-asset',
  SET_REFERENCE: 'set-reference',
  APPLY_RUNTIME: 'apply-runtime',
  SUBMIT_GENERATION: 'submit-generation'
})

let nextResultId = 1
export function _resetResultIdCounter(value = 1) {
  nextResultId = value
}

function makeResultId() {
  const id = `agent_result_${nextResultId.toString(36)}_${Date.now().toString(36)}`
  nextResultId += 1
  return id
}

function safeStr(value, fallback = '') {
  if (value == null) return fallback
  return String(value)
}

export {
  RESULT_SCHEMA_VERSION,
  RESULT_STATUSES,
  SUGGESTION_TYPES,
  ACTION_TYPES,
  SIDE_EFFECT_TYPES
}

export function createPendingResult(taskType, { baseRevision = null, target = null } = {}) {
  if (!taskType) {
    throw new Error('createPendingResult requires a taskType')
  }

  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    id: makeResultId(),
    taskType: safeStr(taskType),
    status: RESULT_STATUSES.PENDING,
    summary: '',
    suggestions: [],
    actions: [],
    sideEffects: [],
    baseRevision: baseRevision != null ? safeStr(baseRevision) : null,
    target: target && typeof target === 'object'
      ? {
          type: safeStr(target.type),
          id: target.id != null ? safeStr(target.id) : null,
          revision: target.revision != null ? safeStr(target.revision) : null
        }
      : null,
    error: null,
    createdAt: new Date().toISOString(),
    appliedAt: null,
    acknowledgedAt: null,
    staleReason: null
  }
}

export function markCompleted(result, {
  summary = '',
  suggestions = [],
  actions = [],
  sideEffects = []
} = {}) {
  if (!result || typeof result !== 'object') return result
  return {
    ...result,
    status: RESULT_STATUSES.COMPLETED,
    summary: safeStr(summary),
    suggestions: Array.isArray(suggestions) ? suggestions.map(normalizeSuggestion) : [],
    actions: Array.isArray(actions) ? actions.map(normalizeAction) : [],
    sideEffects: Array.isArray(sideEffects) ? sideEffects.map(normalizeSideEffect) : [],
    error: null
  }
}

export function markFailed(result, error) {
  if (!result || typeof result !== 'object') return result
  const errorObj = error && typeof error === 'object'
    ? {
        code: safeStr(error.code) || 'UNKNOWN',
        message: safeStr(error.message) || 'Unknown error',
        retryable: Boolean(error.retryable),
        details: error.details || null
      }
    : {
        code: 'UNKNOWN',
        message: safeStr(error),
        retryable: false,
        details: null
      }
  return {
    ...result,
    status: RESULT_STATUSES.FAILED,
    error: errorObj,
    summary: errorObj.message
  }
}

export function markStale(result, reason, currentRevision) {
  if (!result || typeof result !== 'object') return result
  return {
    ...result,
    status: RESULT_STATUSES.STALE,
    staleReason: safeStr(reason) || 'base-text-changed',
    baseRevision: currentRevision != null ? safeStr(currentRevision) : result.baseRevision
  }
}

export function markApplied(result) {
  if (!result || typeof result !== 'object') return result
  return {
    ...result,
    status: RESULT_STATUSES.APPLIED,
    appliedAt: new Date().toISOString()
  }
}

export function acknowledgeApply(result) {
  if (!result || typeof result !== 'object') return result
  return {
    ...result,
    acknowledgedAt: new Date().toISOString()
  }
}

export function isActive(result) {
  if (!result || typeof result !== 'object') return false
  return result.status === RESULT_STATUSES.PENDING || result.status === RESULT_STATUSES.COMPLETED
}

export function canApply(result, currentRevision) {
  if (!result || typeof result !== 'object') return false
  if (result.status === RESULT_STATUSES.APPLIED) return false
  if (result.status === RESULT_STATUSES.FAILED) return false
  if (result.status === RESULT_STATUSES.STALE) return false
  if (!result.baseRevision) return true
  if (currentRevision == null) return true
  return safeStr(result.baseRevision) === safeStr(currentRevision)
}

export function needsAcknowledge(result) {
  if (!result || typeof result !== 'object') return false
  return result.status === RESULT_STATUSES.APPLIED && !result.acknowledgedAt
}

function normalizeSuggestion(s) {
  if (!s || typeof s !== 'object') return null
  return {
    type: safeStr(s.type) || SUGGESTION_TYPES.OPTION,
    label: safeStr(s.label) || safeStr(s.summary) || '',
    content: s.content != null ? s.content : s.text || '',
    sourceRefs: Array.isArray(s.sourceRefs) ? s.sourceRefs : [],
    priority: Number.isFinite(s.priority) ? s.priority : null
  }
}

function normalizeAction(a) {
  if (!a || typeof a !== 'object') return null
  return {
    type: safeStr(a.type) || ACTION_TYPES.REVIEW_ONLY,
    label: safeStr(a.label) || '',
    content: a.content != null ? a.content : a.text || '',
    sourceRefs: Array.isArray(a.sourceRefs) ? a.sourceRefs : [],
    range: a.range && typeof a.range === 'object'
      ? { start: Number(a.range.start), end: Number(a.range.end) }
      : null,
    baseText: a.baseText != null ? safeStr(a.baseText) : null
  }
}

function normalizeSideEffect(se) {
  if (!se || typeof se !== 'object') return null
  return {
    type: safeStr(se.type) || SIDE_EFFECT_TYPES.ADD_OUTLINE_ITEM,
    ...se
  }
}

export function extractTextPatch(result) {
  if (!result || typeof result !== 'object') return null
  if (!Array.isArray(result.actions)) return null

  const patchActions = result.actions.filter(
    (a) => a && a.type === ACTION_TYPES.TEXT_PATCH && a.content
  )
  if (patchActions.length === 0) return null

  return {
    actions: patchActions,
    summary: result.summary
  }
}

export function extractSuggestions(result) {
  if (!result || typeof result !== 'object') return null
  if (!Array.isArray(result.suggestions) || result.suggestions.length === 0) return null
  return result.suggestions.filter(Boolean)
}

export function extractGenerationRequest(result) {
  if (!result || typeof result !== 'object') return null
  if (!Array.isArray(result.actions)) return null

  const genActions = result.actions.filter(
    (a) => a && a.type === ACTION_TYPES.GENERATION_REQUEST
  )
  if (genActions.length === 0) return null

  return genActions.map((a) => ({
    modality: safeStr(a.modality) || 'image',
    prompt: safeStr(a.content),
    sourceRefs: a.sourceRefs || []
  }))
}
