const RESULT_SCHEMA_VERSION = 1

const RESULT_STATUSES = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  STALE: 'stale',
  APPLIED: 'applied',
  DISMISSED: 'dismissed'
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
  MATERIAL_CLASSIFICATION: 'material-classification',
  MATERIAL_SPLIT: 'material-split',
  MATERIAL_RELATIONS: 'material-relations',
  CANVAS_LAYOUT: 'canvas-layout',
  CANVAS_RELATIONS: 'canvas-relations',
  CANVAS_TRANSITION: 'canvas-transition',
  STORYBOARD_SHOT_PATCH: 'storyboard-shot-patch',
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
    suggestions: Array.isArray(suggestions) ? suggestions.map(normalizeSuggestion).filter(Boolean) : [],
    actions: Array.isArray(actions) ? actions.map(normalizeAction).filter(Boolean) : [],
    sideEffects: Array.isArray(sideEffects) ? sideEffects.map(normalizeSideEffect).filter(Boolean) : [],
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

export function markDismissed(result) {
  if (!result || typeof result !== 'object') return result
  return {
    ...result,
    status: RESULT_STATUSES.DISMISSED
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
  if (result.status === RESULT_STATUSES.DISMISSED) return false
  if (!result.baseRevision) return true
  if (currentRevision == null) return true
  return safeStr(result.baseRevision) === safeStr(currentRevision)
}

export function canDismiss(result) {
  if (!result || typeof result !== 'object') return false
  return result.status === RESULT_STATUSES.PENDING
    || result.status === RESULT_STATUSES.COMPLETED
    || result.status === RESULT_STATUSES.FAILED
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
  const validation = validateAgentAction(a)
  if (!validation.valid) return null
  return {
    type: validation.type,
    label: safeStr(a.label) || '',
    content: a.content != null ? a.content : a.text || '',
    payload: a.payload && typeof a.payload === 'object' ? a.payload : null,
    sourceRefs: Array.isArray(a.sourceRefs) ? a.sourceRefs : [],
    range: a.range && typeof a.range === 'object'
      ? { start: Number(a.range.start), end: Number(a.range.end) }
      : null,
    baseText: a.baseText != null ? safeStr(a.baseText) : null
  }
}

function normalizeSideEffect(se) {
  if (!se || typeof se !== 'object') return null
  const type = safeStr(se.type)
  if (!Object.values(SIDE_EFFECT_TYPES).includes(type)) return null
  return {
    type,
    ...se
  }
}

export function validateAgentAction(action) {
  if (!action || typeof action !== 'object') {
    return { valid: false, reason: 'invalid-action' }
  }
  const type = safeStr(action.type)
  if (!Object.values(ACTION_TYPES).includes(type)) {
    return { valid: false, reason: 'unknown-action-type', type }
  }
  if (type === ACTION_TYPES.TEXT_PATCH && !safeStr(action.content).trim()) {
    return { valid: false, reason: 'missing-action-content', type }
  }
  if ([
    ACTION_TYPES.MATERIAL_CLASSIFICATION,
    ACTION_TYPES.MATERIAL_SPLIT,
    ACTION_TYPES.MATERIAL_RELATIONS,
    ACTION_TYPES.CANVAS_LAYOUT,
    ACTION_TYPES.CANVAS_RELATIONS,
    ACTION_TYPES.CANVAS_TRANSITION,
    ACTION_TYPES.STORYBOARD_SHOT_PATCH,
    ACTION_TYPES.RUNTIME_CANDIDATE,
    ACTION_TYPES.GENERATION_REQUEST
  ].includes(type) && (!action.payload || typeof action.payload !== 'object')) {
    return { valid: false, reason: 'missing-action-payload', type }
  }
  return { valid: true, type }
}

export function validateAgentResult(result) {
  if (!result || typeof result !== 'object') {
    return { valid: false, reason: 'invalid-result' }
  }
  if (Number(result.schemaVersion) !== RESULT_SCHEMA_VERSION) {
    return { valid: false, reason: 'unsupported-result-version' }
  }
  if (!Object.values(RESULT_STATUSES).includes(result.status)) {
    return { valid: false, reason: 'unknown-result-status' }
  }
  const invalidAction = (result.actions || []).find((action) => !validateAgentAction(action).valid)
  if (invalidAction) return { valid: false, reason: 'invalid-result-action' }
  return { valid: true }
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
