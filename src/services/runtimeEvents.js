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
    sanitized.push({
      op: op.op,
      path: op.path,
      value: op.value
    })
  })

  return {
    valid: errors.length === 0,
    sanitized: errors.length === 0 ? sanitized : [],
    errors
  }
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
  capRuntimeEvents,
  appendRuntimeEvent
}
