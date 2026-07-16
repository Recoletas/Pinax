import { normalizeRuntimeEvent } from './runtimeEvents'

export const RUNTIME_CAUSALITY_VERSION = 1

function clone(value) {
  if (value === undefined) return undefined
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return undefined
  }
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function text(value) {
  return String(value ?? '').trim()
}

function eventPathSnapshot(event, field) {
  const value = event?.payload?.[field]
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function snapshotPaths(event) {
  return [...new Set([
    ...Object.keys(eventPathSnapshot(event, 'before')),
    ...Object.keys(eventPathSnapshot(event, 'after'))
  ])]
}

function eventOrder(event, index) {
  const ts = Number(event?.ts)
  return Number.isFinite(ts) ? ts : index
}

function normalizeEvents(events) {
  return (Array.isArray(events) ? events : [])
    .map((event, index) => ({ event: normalizeRuntimeEvent(event), index }))
    .filter(({ event }) => event)
}

/**
 * 找出事件链中可以确定的冲突。
 *
 * v1 只比较 state_delta 的 before/after 快照，避免把不同地点的正常剧情
 * 变化误报成冲突。父事件缺失也在这里报告，因为它会让后续历史无法解释。
 */
export function detectRuntimeEventConflicts(events = []) {
  const normalized = normalizeEvents(events)
  const byId = new Map()
  const conflicts = []

  for (const { event } of normalized) {
    if (!event.id) continue
    if (byId.has(event.id)) {
      conflicts.push({
        code: 'duplicate-event-id',
        eventId: event.id,
        message: `事件 ID 重复：${event.id}`
      })
    }
    byId.set(event.id, event)
  }

  for (const { event } of normalized) {
    if (event.parentId && !byId.has(event.parentId)) {
      conflicts.push({
        code: 'orphan-parent',
        eventId: event.id,
        parentId: event.parentId,
        message: `找不到父事件：${event.parentId}`
      })
    }
  }

  const stateEvents = normalized
    .filter(({ event }) => event.type === 'state_delta')
    .sort((left, right) => eventOrder(left.event, left.index) - eventOrder(right.event, right.index))
  const latestByBranchAndPath = new Map()

  for (const { event } of stateEvents) {
    const branchId = text(event.branchId) || 'main'
    const before = eventPathSnapshot(event, 'before')
    const after = eventPathSnapshot(event, 'after')
    for (const path of snapshotPaths(event)) {
      const key = `${branchId}\u0000${path}`
      const previous = latestByBranchAndPath.get(key)
      if (previous && Object.prototype.hasOwnProperty.call(before, path)
        && !equal(previous.after, before[path])) {
        conflicts.push({
          code: 'state-snapshot-divergence',
          eventId: event.id,
          previousEventId: previous.eventId,
          branchId,
          path,
          expected: clone(previous.after),
          actual: clone(before[path]),
          message: `状态字段 ${path} 未接上上一事件的结果`
        })
      }
      if (Object.prototype.hasOwnProperty.call(after, path)) {
        latestByBranchAndPath.set(key, {
          eventId: event.id,
          after: clone(after[path])
        })
      }
    }
  }

  return conflicts
}

/**
 * Build a small causal graph for the event log.
 *
 * `parent` edges come from the event envelope. `state-continuity` edges are
 * inferred only when two state_delta events touch the same root on a branch;
 * they make downstream stale state visible without changing stored events.
 */
export function buildRuntimeEventCausality(events = []) {
  const normalized = normalizeEvents(events)
  const byId = new Map(normalized.map(({ event }) => [event.id, event]))
  const edges = []
  const edgeKeys = new Set()

  function addEdge(from, to, kind) {
    if (!from || !to || from === to) return
    const key = `${from}\u0000${to}\u0000${kind}`
    if (edgeKeys.has(key)) return
    edgeKeys.add(key)
    edges.push({ from, to, kind })
  }

  for (const { event } of normalized) {
    if (event.parentId && byId.has(event.parentId)) addEdge(event.parentId, event.id, 'parent')
  }

  const previousByBranchAndPath = new Map()
  const orderedStateEvents = normalized
    .filter(({ event }) => event.type === 'state_delta')
    .sort((left, right) => eventOrder(left.event, left.index) - eventOrder(right.event, right.index))

  for (const { event } of orderedStateEvents) {
    const branchId = text(event.branchId) || 'main'
    for (const path of snapshotPaths(event)) {
      const key = `${branchId}\u0000${path}`
      const previous = previousByBranchAndPath.get(key)
      if (previous) addEdge(previous.eventId, event.id, 'state-continuity')
      if (Object.prototype.hasOwnProperty.call(eventPathSnapshot(event, 'after'), path)) {
        previousByBranchAndPath.set(key, { eventId: event.id })
      }
    }
  }

  const roots = normalized
    .filter(({ event }) => !event.parentId || !byId.has(event.parentId))
    .map(({ event }) => event)
  const conflicts = detectRuntimeEventConflicts(events)

  return {
    version: RUNTIME_CAUSALITY_VERSION,
    nodes: normalized.map(({ event }) => ({
      id: event.id,
      parentId: event.parentId,
      branchId: event.branchId,
      ts: event.ts,
      type: event.type,
      source: event.source,
      placeId: text(event.payload?.placeId)
    })),
    edges,
    roots,
    orphanParentIds: [...new Set(conflicts
      .filter((item) => item.code === 'orphan-parent')
      .map((item) => item.parentId))],
    conflicts,
    isConsistent: conflicts.length === 0
  }
}

export default {
  RUNTIME_CAUSALITY_VERSION,
  detectRuntimeEventConflicts,
  buildRuntimeEventCausality
}
