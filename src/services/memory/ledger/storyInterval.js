// Story-time bridge for the fact ledger (A11). All comparison semantics are
// reused from the frozen knowledgeReadModel/time.js — this module only
// converts stored ledger intervals into that model's resolved form and
// reports honest timeMatch outcomes. The record axis (author knowledge) is a
// different clock and never feeds these comparisons.
import { toTimePoint, toQueryWindow, intervalOverlapsWindow, resolveEraOrder } from '../../project/knowledgeReadModel/time'

// storyAt: { timelineId, eraId, ordinal, precision } — validated against the
// caller-declared timeline (eras with explicit orders). Returns:
// - { ok, match: 'inside' | 'outside' }   decisive answer
// - { ok, match: 'unknown', reason }      unknown/undeclared/mismatched time —
//                                         never silently treated as inside
// - { ok: false, reason }                 malformed request
export function storyTimeMatch(interval, storyAt, timeline) {
  if (storyAt === null || storyAt === undefined) return { ok: true, match: null }
  const point = toTimePoint(storyAt, timeline)
  if (!point.ok) return { ok: true, match: 'unknown', reason: point.error }
  if (!interval) {
    // Label-only story time ("庆历三年冬") or unset: the fact may or may not
    // hold at that moment; an unknown range must not read as "always true".
    return { ok: true, match: 'unknown', reason: 'fact-time-unevidenced' }
  }
  if (interval.timelineId !== storyAt.timelineId) {
    return { ok: true, match: 'unknown', reason: 'timeline-mismatch' }
  }
  const resolved = resolveInterval(interval, timeline)
  if (!resolved.ok) return { ok: true, match: 'unknown', reason: resolved.reason }
  const window = toQueryWindow(point.point, timeline)
  if (!window.ok) return { ok: true, match: 'unknown', reason: window.error }
  const overlap = intervalOverlapsWindow(resolved.interval, window.window)
  if (overlap === 'inside' || overlap === 'outside') return { ok: true, match: overlap }
  return { ok: true, match: 'unknown', reason: 'interval-end-unknown' }
}

function resolveInterval(interval, timeline) {
  const boundary = (value) => {
    if (!value) return null
    const eraOrder = resolveEraOrder(timeline, value.eraId)
    if (eraOrder === null) return { invalid: true }
    return { eraOrder, ordinal: value.ordinal ?? null }
  }
  const start = boundary(interval.start)
  const end = boundary(interval.end)
  if (start?.invalid || end?.invalid) return { ok: false, reason: 'timeline-era-invalid' }
  if (!start && !end) return { ok: true, interval: null }
  return {
    ok: true,
    interval: {
      timelineId: interval.timelineId,
      start,
      end,
      endSemantic: interval.endSemantic
    }
  }
}

// UI-facing description; never renders an unknown interval as definite.
// M11 文案合同（先判 unknown）：「未知日期不是开放终点」（0022）——
// endSemantic 'unknown' 且无端点时必须报「终点未知」，不得落进「此后仍成立」。
export function describeInterval(interval) {
  if (!interval) return '故事时间未知'
  const parts = []
  parts.push(interval.start ? `自 ${interval.start.eraId}${interval.start.ordinal !== null ? ` 第 ${interval.start.ordinal} 年` : ''}` : '开始未知')
  if (interval.endSemantic === 'unknown') parts.push('终点未知')
  else if (interval.endSemantic === 'open' || !interval.end) parts.push('此后仍成立（无记录终点）')
  else parts.push(`至 ${interval.end.eraId}${interval.end.ordinal !== null ? ` 第 ${interval.end.ordinal} 年前` : ''}`)
  return parts.join('，')
}
