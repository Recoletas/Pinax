/**
 * knowledgeReadModel/time.js — story-time semantics for the read-only
 * knowledge model (v1).
 *
 * Frozen v1 semantics:
 - Time is only comparable inside one declared timeline. Eras come from an
 * explicitly declared ladder (snapshot.timeline.eras with distinct orders);
 * `ordinal` is the year-ordinal inside an era.
 * - Intervals are half-open [start, end): start inclusive, end exclusive.
 * - `endSemantic:'unknown'` (an endpoint existed but is not recorded) is NOT
 *   `open` (no endpoint). Unknown boundaries make overlap unknown — never
 *   silently true or false.
 * - Wall-clock/recorded timestamps are story-time only when the caller
 *   explicitly provides them as story-time fields. Nothing here reads
 *   Date.now() or event `ts` as story time.
 */

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Validate a declared timeline: { id, eras: [{id, order, label?}] }.
 * Orders must be integers, unique within the timeline, and strictly ordered
 * by their array position (array position is the declared sequence).
 */
export function validateTimeline(timeline) {
  if (timeline === null || timeline === undefined) return { ok: true, timeline: null }
  if (!isPlainObject(timeline) || typeof timeline.id !== 'string' || !timeline.id.trim()) {
    return { ok: false, error: 'timeline-invalid' }
  }
  if (!Array.isArray(timeline.eras) || timeline.eras.length === 0) {
    return { ok: false, error: 'timeline-eras-required' }
  }
  const seenIds = new Set()
  const seenOrders = new Set()
  let previousOrder = null
  for (const era of timeline.eras) {
    if (!isPlainObject(era) || typeof era.id !== 'string' || !era.id.trim()) {
      return { ok: false, error: 'timeline-era-invalid' }
    }
    if (!Number.isInteger(era.order)) return { ok: false, error: 'timeline-era-order-invalid' }
    if (seenIds.has(era.id)) return { ok: false, error: 'timeline-era-duplicate' }
    if (seenOrders.has(era.order)) return { ok: false, error: 'timeline-era-order-duplicate' }
    if (previousOrder !== null && era.order <= previousOrder) {
      // orders must strictly increase with array position
      return { ok: false, error: 'timeline-era-order-not-ascending' }
    }
    seenIds.add(era.id)
    seenOrders.add(era.order)
    previousOrder = era.order
  }
  return { ok: true, timeline }
}

function eraById(timeline, eraId) {
  return timeline.eras.find((era) => era.id === eraId) ?? null
}

/**
 * Resolve an eraId to its declared order. Exported for adapters that must
 * normalize stored intervals ({eraId, ordinal}) into comparable form
 * ({eraOrder, ordinal}) against query windows. Returns null for unknown eras.
 */
export function resolveEraOrder(timeline, eraId) {
  if (!timeline || !timeline.eras) return null
  const era = eraById(timeline, eraId)
  return era ? era.order : null
}

/**
 * Normalize a normalized-request storyTime into a comparable point.
 * Returns { ok, point | error }.
 * point: { timelineId, eraId, ordinal|null, eraOrder, precision, label? }
 */
export function toTimePoint(storyTime, timeline) {
  if (!storyTime || !isPlainObject(storyTime)) return { ok: false, error: 'story-time-unknown' }
  if (storyTime.precision === 'unknown') return { ok: false, error: 'story-time-unknown' }
  if (!timeline) return { ok: false, error: 'timeline-undeclared' }
  if (storyTime.timelineId !== timeline.id) return { ok: false, error: 'timeline-mismatch' }
  const era = eraById(timeline, storyTime.eraId)
  if (!era) return { ok: false, error: 'story-time-unknown' }
  return {
    ok: true,
    point: {
      timelineId: timeline.id,
      eraId: era.id,
      eraOrder: era.order,
      ordinal: storyTime.ordinal ?? null,
      precision: storyTime.precision,
      ...(storyTime.label ? { label: storyTime.label } : {})
    }
  }
}

/**
 * Compare two fully-resolved points on the same declared timeline.
 * Returns -1 | 0 | 1, or null when not comparable (missing ordinal at year
 * precision). Era order decides before ordinal.
 */
export function comparePoints(left, right) {
  if (!left || !right) return null
  if (left.timelineId !== right.timelineId) return null
  if (left.eraOrder !== right.eraOrder) return left.eraOrder < right.eraOrder ? -1 : 1
  if (left.ordinal === null || right.ordinal === null) return null
  if (left.ordinal === right.ordinal) return 0
  return left.ordinal < right.ordinal ? -1 : 1
}

/**
 * Build the half-open query window implied by a story time:
 * - era precision  → [era start, next era start)  (last era: open end)
 * - year precision → [point, point+1year)
 * - moment         → exact point (both bounds equal; start inclusive,
 *                    end exclusive means only that exact ordinal matches)
 * Returns { ok, window | error }.
 * window: { timelineId, start:{eraId,eraOrder,ordinal}, end:{...}|null,
 *           endSemantic:'exclusive'|'open' }
 */
export function toQueryWindow(point, timeline) {
  if (!point) return { ok: false, error: 'story-time-unknown' }
  if (point.precision === 'era') {
    const nextEra = timeline.eras
      .filter((era) => era.order > point.eraOrder)
      .sort((a, b) => a.order - b.order)[0]
    return {
      ok: true,
      window: {
        timelineId: timeline.id,
        start: { eraId: point.eraId, eraOrder: point.eraOrder, ordinal: 0 },
        end: nextEra
          ? { eraId: nextEra.id, eraOrder: nextEra.order, ordinal: 0 }
          : null,
        endSemantic: nextEra ? 'exclusive' : 'open'
      }
    }
  }
  if (point.precision === 'moment') {
    return {
      ok: true,
      window: {
        timelineId: timeline.id,
        start: { eraId: point.eraId, eraOrder: point.eraOrder, ordinal: point.ordinal ?? 0 },
        end: { eraId: point.eraId, eraOrder: point.eraOrder, ordinal: point.ordinal ?? 0 },
        endSemantic: 'exclusive'
      }
    }
  }
  // year precision: [year, year+1) inside the era
  return {
    ok: true,
    window: {
      timelineId: timeline.id,
      start: { eraId: point.eraId, eraOrder: point.eraOrder, ordinal: point.ordinal ?? 0 },
      end: { eraId: point.eraId, eraOrder: point.eraOrder, ordinal: (point.ordinal ?? 0) + 1 },
      endSemantic: 'exclusive'
    }
  }
}

function boundaryInsideWindow(boundary, window) {
  // boundary: {eraOrder, ordinal|null}; ordinal null = "sometime in the era"
  const startCmp = boundary.eraOrder !== window.start.eraOrder
    ? (boundary.eraOrder < window.start.eraOrder ? -1 : 1)
    : (boundary.ordinal === null || window.start.ordinal === null
      ? 0
      : (boundary.ordinal < window.start.ordinal ? -1 : boundary.ordinal > window.start.ordinal ? 1 : 0))
  if (startCmp < 0) return false
  if (window.endSemantic === 'open') return true
  if (window.end === null) return true
  const endCmp = boundary.eraOrder !== window.end.eraOrder
    ? (boundary.eraOrder < window.end.eraOrder ? -1 : 1)
    : (boundary.ordinal === null || window.end.ordinal === null
      ? 0
      : (boundary.ordinal < window.end.ordinal ? -1 : boundary.ordinal > window.end.ordinal ? 1 : 0))
  if (endCmp > 0) return false
  if (endCmp === 0 && window.endSemantic === 'exclusive') {
    // Anything beginning exactly at the exclusive end is outside the window,
    // including an era-granular boundary of the end era itself.
    return false
  }
  return true
}

/**
 * Does a fact interval overlap the query window?
 *
 * interval (already normalized by the adapter):
 * { timelineId, start:{eraOrder, ordinal|null}|null,
 *   end:{eraOrder, ordinal|null}|null, endSemantic:'exclusive'|'open'|'unknown' }
 * start===null means "no recorded start" (start unknown).
 *
 * Returns 'inside' | 'outside' | 'unknown'.
 * Honest-boundary rules:
 * - different timeline → 'unknown' (caller filters by timeline first)
 * - any unknown endpoint that could flip the answer → 'unknown'
 *   (an interval that started before the window with an unknown end may or
 *   may not still have been running: unknown, never silently inside)
 * - `endSemantic:'open'` still counts as "no end boundary" for overlap, but
 *   is reported by the adapter so callers can distinguish it from 'unknown'.
 */
export function intervalOverlapsWindow(interval, window) {
  if (!interval || interval.timelineId !== window.timelineId) return 'unknown'
  const startUnknown = !interval.start
  const endUnknown = interval.endSemantic === 'unknown' || !interval.end
  if (startUnknown) {
    if (endUnknown) return 'unknown'
    if (beforeWindow(interval.end, window)) return 'outside'
    if (boundaryInsideWindow(interval.end, window)) return 'inside'
    return 'unknown' // end lies after the window: unknown start may precede it
  }
  if (endUnknown) {
    if (boundaryInsideWindow(interval.start, window)) return 'inside'
    if (beforeWindow(interval.start, window)) return 'unknown'
    return 'outside' // start lies after the window entirely
  }
  // Both bounds known: half-open [start, end).
  const startBeforeEnd = beforeOrEqual(interval.start, interval.end)
  if (!startBeforeEnd) return 'unknown' // malformed interval; refuse to guess
  if (beforeOrEqual(interval.end, window.start)) return 'outside'
  if (window.end && beforeOrEqual(window.end, interval.start)) return 'outside'
  return 'inside'
}

function beforeOrEqual(a, b) {
  if (!a) return true
  if (!b) return false
  if (a.eraOrder !== b.eraOrder) return a.eraOrder < b.eraOrder
  if (a.ordinal === null || b.ordinal === null) return false
  return a.ordinal <= b.ordinal
}

function beforeWindow(boundary, window) {
  return beforeOrEqual(boundary, window.start)
}

/** Era-only matching for legacy nodes that only carry eraId. */
export function eraMatchesWindow(eraId, window, timeline) {
  if (!window) return 'unknown'
  const era = eraById(timeline, eraId)
  if (!era) return 'unknown'
  return boundaryInsideWindow({ eraOrder: era.order, ordinal: null }, window) ? 'inside' : 'outside'
}
