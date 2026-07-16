/**
 * runtimeEvents - append-only runtime event envelope (v1) for sessions.
 *
 * Sidecar store only: this module never mutates game store state directly,
 * never touches prompt assembly, and never persists full prompt content.
 *
 * Design references: docs/superpowers/specs/2026-06-18-nova-runtime-foundation-design.md
 * (Section D: Runtime event envelope).
 */

export const RUNTIME_EVENT_SCHEMA_VERSION = 1
export const RUNTIME_EVENT_LIMIT = 200

export const RUNTIME_EVENT_TYPES = [
  'turn',
  'state_delta',
  'display_event',
  'hot_choices',
  'branch'
]

export const RUNTIME_EVENT_SOURCES = ['user', 'assistant', 'system', 'runtime']

export const STATE_OPS = ['set', 'merge', 'push', 'pull', 'inc', 'unset']

// Allowlisted top-level state paths for state_delta events.
// Rejected paths never mutate runtime state.
export const STATE_PATH_ROOTS = [
  'goals',
  'encounteredCharacters',
  'factionRelations',
  'keyChoices',
  'plotJournal',
  'activities',
  'worldMapState',
  'mechanismContext',
  'milestoneEvent',
  'flags',
  'inventory',
  'quests'
]

const ARRAY_STATE_ROOTS = new Set([
  'goals',
  'encounteredCharacters',
  'keyChoices',
  'plotJournal',
  'activities',
  'inventory',
  'quests'
])
const OBJECT_STATE_ROOTS = new Set([
  'factionRelations',
  'worldMapState',
  'mechanismContext',
  'milestoneEvent',
  'flags'
])
const WORLD_MAP_PATCH_KEYS = new Set(['placeId', 'currentCountry', 'currentCity', 'currentScene'])

const DEFAULT_BRANCH_ID = 'main'
const DEFAULT_SOURCE = 'runtime'
const DEFAULT_TYPE = 'turn'

let runtimeEventIdCounter = 0

function generateRuntimeEventId() {
  runtimeEventIdCounter += 1
  return `evt_${Date.now().toString(36)}_${runtimeEventIdCounter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeType(type) {
  return RUNTIME_EVENT_TYPES.includes(type) ? type : DEFAULT_TYPE
}

function normalizeSource(source) {
  return RUNTIME_EVENT_SOURCES.includes(source) ? source : DEFAULT_SOURCE
}

function normalizeBranchId(branchId) {
  const value = String(branchId == null ? '' : branchId).trim()
  return value || DEFAULT_BRANCH_ID
}

function normalizeTimestamp(ts) {
  const num = Number(ts)
  if (!Number.isFinite(num) || num <= 0) return Date.now()
  return Math.floor(num)
}

function normalizeId(id) {
  const value = String(id == null ? '' : id).trim()
  return value || generateRuntimeEventId()
}

function normalizePayload(payload, type) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {}

  // Display events are non-contextual by default so they never get
  // re-injected as model-side context unless callers opt in explicitly.
  if (type === 'display_event' && source.contextual === undefined) {
    return { ...source, contextual: false }
  }

  return { ...source }
}

export function createRuntimeEvent(input = {}) {
  const safe = input && typeof input === 'object' ? input : {}
  const type = normalizeType(safe.type)
  return {
    v: RUNTIME_EVENT_SCHEMA_VERSION,
    type,
    id: normalizeId(safe.id),
    parentId: String(safe.parentId == null ? '' : safe.parentId).trim(),
    branchId: normalizeBranchId(safe.branchId),
    ts: normalizeTimestamp(safe.ts),
    source: normalizeSource(safe.source),
    payload: normalizePayload(safe.payload, type)
  }
}

export function normalizeRuntimeEvent(raw = {}) {
  if (!raw || typeof raw !== 'object') return null
  return createRuntimeEvent(raw)
}

function isSafeStatePathRoot(path) {
  if (!path || typeof path !== 'string') return false
  // Reject prototype pollution paths and any nested paths; only top-level
  // allowlisted roots are valid v1 state-delta targets.
  if (path.includes('__')) return false
  if (path.includes('.') || path.includes('[') || path.includes(' ')) return false
  return STATE_PATH_ROOTS.includes(path)
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isSafeJsonValue(value, depth = 0) {
  if (depth > 6 || value === undefined || typeof value === 'function' || typeof value === 'symbol') return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every((item) => isSafeJsonValue(item, depth + 1))
  if (!isPlainRecord(value)) return false
  return Object.entries(value).every(([key, item]) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false
    return isSafeJsonValue(item, depth + 1)
  })
}

function cloneValue(value) {
  if (value === undefined) return undefined
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return undefined
  }
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function hasOnlyWorldMapPatchKeys(value) {
  return isPlainRecord(value) && Object.keys(value).every((key) => WORLD_MAP_PATCH_KEYS.has(key))
}

function hasNumericRecordValues(value) {
  return isPlainRecord(value)
    && Object.keys(value).length <= 24
    && Object.values(value).every((item) => typeof item === 'number' && Number.isFinite(item))
}

function validateStateDeltaValue(op, path, value, index) {
  if (op === 'unset') return null
  if (!isSafeJsonValue(value)) {
    return { index, code: 'unsafe-value', message: `value for "${path}" is not safe JSON data` }
  }

  if (op === 'push' || op === 'pull') {
    if (!ARRAY_STATE_ROOTS.has(path)) {
      return { index, code: 'invalid-operation', message: `op "${op}" requires an array state root` }
    }
    return null
  }

  if (op === 'inc') {
    if (path !== 'factionRelations' || !hasNumericRecordValues(value)) {
      return { index, code: 'invalid-value', message: 'inc only accepts numeric factionRelations changes' }
    }
    return null
  }

  if (op === 'merge') {
    if (!OBJECT_STATE_ROOTS.has(path) || !isPlainRecord(value)) {
      return { index, code: 'invalid-value', message: `merge requires an object state root for "${path}"` }
    }
    if (path === 'worldMapState' && !hasOnlyWorldMapPatchKeys(value)) {
      return { index, code: 'invalid-value', message: 'worldMapState merge only accepts place patch fields' }
    }
    if (path === 'factionRelations' && !hasNumericRecordValues(value)) {
      return { index, code: 'invalid-value', message: 'factionRelations merge values must be numeric' }
    }
    return null
  }

  if (op === 'set') {
    if (ARRAY_STATE_ROOTS.has(path) && !Array.isArray(value)) {
      return { index, code: 'invalid-value', message: `set requires an array value for "${path}"` }
    }
    if (OBJECT_STATE_ROOTS.has(path) && !isPlainRecord(value)) {
      return { index, code: 'invalid-value', message: `set requires an object value for "${path}"` }
    }
    if (path === 'worldMapState' && !hasOnlyWorldMapPatchKeys(value)) {
      return { index, code: 'invalid-value', message: 'worldMapState set only accepts place patch fields' }
    }
    if (path === 'factionRelations' && !hasNumericRecordValues(value)) {
      return { index, code: 'invalid-value', message: 'factionRelations values must be numeric' }
    }
  }

  return null
}

export function validateStateDelta(ops = []) {
  if (!Array.isArray(ops)) {
    return {
      valid: false,
      sanitized: [],
      errors: [{
        index: -1,
        code: 'not-array',
        message: 'state_delta ops must be an array'
      }]
    }
  }

  const errors = []
  const sanitized = []

  ops.forEach((op, index) => {
    if (!op || typeof op !== 'object' || Array.isArray(op)) {
      errors.push({ index, code: 'invalid-op', message: 'op must be an object' })
      return
    }
    if (!STATE_OPS.includes(op.op)) {
      errors.push({
        index,
        code: 'unknown-op',
        message: `op "${String(op.op)}" is not in the allowed state-op allowlist`
      })
      return
    }
    if (!isSafeStatePathRoot(op.path)) {
      errors.push({
        index,
        code: 'invalid-path',
        message: `path "${String(op.path)}" is not an allowed state-delta root`
      })
      return
    }
    const valueError = validateStateDeltaValue(op.op, op.path, op.value, index)
    if (valueError) {
      errors.push(valueError)
      return
    }
    sanitized.push({
      op: op.op,
      path: op.path,
      ...(op.op === 'unset' ? {} : { value: cloneValue(op.value) })
    })
  })

  return {
    valid: errors.length === 0,
    sanitized: errors.length === 0 ? sanitized : [],
    errors
  }
}

function sameCollectionItem(item, target) {
  if (item && target && typeof item === 'object' && typeof target === 'object') {
    if (item.id && target.id) return String(item.id) === String(target.id)
  }
  return valuesEqual(item, target)
}

function applyOneStateDelta(state, operation) {
  const path = operation.path
  const current = state[path]
  switch (operation.op) {
    case 'set':
      state[path] = cloneValue(operation.value)
      break
    case 'merge':
      state[path] = { ...(isPlainRecord(current) ? current : {}), ...cloneValue(operation.value) }
      break
    case 'push':
      state[path] = [...(Array.isArray(current) ? current : []), cloneValue(operation.value)]
      break
    case 'pull':
      state[path] = (Array.isArray(current) ? current : [])
        .filter((item) => !sameCollectionItem(item, operation.value))
      break
    case 'inc':
      state[path] = { ...(isPlainRecord(current) ? current : {}) }
      for (const [key, delta] of Object.entries(operation.value || {})) {
        state[path][key] = Number(state[path][key] || 0) + delta
      }
      break
    case 'unset':
      delete state[path]
      break
    default:
      break
  }
}

/**
 * Apply a validated v1 delta to a cloned state snapshot and return inverse
 * operations. This is deliberately pure so callers can preview first.
 */
export function applyStateDelta(currentState = {}, ops = []) {
  const validation = validateStateDelta(ops)
  const state = cloneValue(currentState) || {}
  if (!validation.valid) {
    return {
      valid: false,
      state,
      appliedOps: [],
      inverseOps: [],
      before: {},
      after: {},
      errors: validation.errors
    }
  }

  const before = {}
  const beforeExists = {}
  for (const operation of validation.sanitized) {
    if (beforeExists[operation.path]) continue
    beforeExists[operation.path] = true
    before[operation.path] = cloneValue(state[operation.path])
  }
  for (const operation of validation.sanitized) applyOneStateDelta(state, operation)

  const after = {}
  const inverseOps = []
  for (const path of Object.keys(before)) {
    after[path] = cloneValue(state[path])
    inverseOps.push(before[path] === undefined
      ? { op: 'unset', path }
      : { op: 'set', path, value: before[path] })
  }

  return {
    valid: true,
    state,
    appliedOps: validation.sanitized,
    inverseOps,
    before,
    after,
    errors: []
  }
}

export function buildStateDeltaPreview(currentState = {}, ops = []) {
  const result = applyStateDelta(currentState, ops)
  const changes = Object.keys(result.before || {}).map((path) => ({
    path,
    before: cloneValue(result.before[path]),
    after: cloneValue(result.after[path])
  }))
  return { ...result, changes }
}

/**
 * Roll back an applied state_delta only when every touched root still has the
 * value written by that event. Later changes therefore produce a conflict
 * instead of silently overwriting newer state.
 */
export function rollbackStateDelta(currentState = {}, event = {}) {
  const payload = event?.payload || event || {}
  const after = payload.after && typeof payload.after === 'object' ? payload.after : null
  const inverseOps = Array.isArray(payload.inverseOps) ? payload.inverseOps : []
  if (!after || inverseOps.length === 0) {
    return { valid: false, code: 'missing-rollback-data', conflicts: [], state: cloneValue(currentState) || {} }
  }

  const conflicts = Object.keys(after).filter((path) => !valuesEqual(currentState?.[path], after[path]))
  if (conflicts.length > 0) {
    return {
      valid: false,
      code: 'rollback-conflict',
      conflicts,
      state: cloneValue(currentState) || {}
    }
  }

  return {
    ...applyStateDelta(currentState, inverseOps),
    code: 'rolled-back',
    conflicts: []
  }
}

export function buildStateDeltaExplanation({ causes = [], consequences = [], fallback = '当前剧情压力' } = {}) {
  const left = (Array.isArray(causes) ? causes : [causes]).map((item) => String(item || '').trim()).filter(Boolean).slice(0, 2)
  const right = (Array.isArray(consequences) ? consequences : [consequences]).map((item) => String(item || '').trim()).filter(Boolean).slice(0, 1)
  return `因为${left.join('和') || fallback}，所以${right[0] || '当前世界状态发生变化'}`
}

export function capRuntimeEvents(events = [], limit = RUNTIME_EVENT_LIMIT) {
  const safeLimit = Math.max(1, Math.floor(Number(limit) || RUNTIME_EVENT_LIMIT))
  const list = Array.isArray(events) ? events : Array.from(events || [])
  if (list.length <= safeLimit) return list.slice()
  return list.slice(list.length - safeLimit)
}

export function appendRuntimeEvent(events = [], input = {}, limit = RUNTIME_EVENT_LIMIT) {
  const current = Array.isArray(events) ? events : []
  const event = createRuntimeEvent(input)
  const next = current.concat([event])
  return {
    event,
    events: capRuntimeEvents(next, limit)
  }
}

export default {
  RUNTIME_EVENT_SCHEMA_VERSION,
  RUNTIME_EVENT_LIMIT,
  RUNTIME_EVENT_TYPES,
  RUNTIME_EVENT_SOURCES,
  STATE_OPS,
  STATE_PATH_ROOTS,
  createRuntimeEvent,
  normalizeRuntimeEvent,
  validateStateDelta,
  applyStateDelta,
  buildStateDeltaPreview,
  rollbackStateDelta,
  buildStateDeltaExplanation,
  capRuntimeEvents,
  appendRuntimeEvent
}
