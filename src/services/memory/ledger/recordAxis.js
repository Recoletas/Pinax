// Centralized record-axis predicates (A10). Every "is this fact version
// currently valid / valid as of a recorded cutoff" decision goes through here
// — UI, tools and backup must not each re-implement the filter.
//
// The record axis is sequence-based: recordedSeq is a per-scope monotonic
// counter assigned inside the adopting transaction, so two decisions in the
// same millisecond still have a decidable order (G-A08). Wall-clock recordedAt
// is display-only and never decides visibility.
//
// Half-open record interval: visible at cutoff iff
//   recordedSeq <= cutoff && (invalidatedSeq == null || cutoff < invalidatedSeq)

export function isVisibleAt(version, cutoffSeq = null) {
  if (!version || !Number.isFinite(version.recordedSeq)) return false
  if (cutoffSeq !== null && cutoffSeq !== undefined) {
    if (!Number.isFinite(cutoffSeq)) return false
    if (version.recordedSeq > cutoffSeq) return false
    if (version.invalidatedSeq !== null && version.invalidatedSeq !== undefined && cutoffSeq >= version.invalidatedSeq) return false
    return true
  }
  // Current view: never superseded/invalidated.
  return version.invalidatedSeq === null || version.invalidatedSeq === undefined
}

export function sortByRecordedSeq(versions) {
  return [...versions].sort((a, b) => a.recordedSeq - b.recordedSeq || String(a.id).localeCompare(String(b.id)))
}

// The current head: latest recorded version that has not been invalidated.
export function currentHeadOf(versions) {
  const visible = (versions || []).filter(version => isVisibleAt(version))
  if (!visible.length) return null
  return sortByRecordedSeq(visible).at(-1) || null
}

// Head as of a recorded cutoff; keeps later-invalidated history queryable
// ("what did the author believe as of that decision") without faking story
// time from wall clock.
export function headAsOf(versions, cutoffSeq) {
  if (!Number.isFinite(cutoffSeq)) return null
  const visible = (versions || []).filter(version => isVisibleAt(version, cutoffSeq))
  if (!visible.length) return null
  return sortByRecordedSeq(visible).at(-1) || null
}

// Resolve a wall-clock input to the latest decision seq recorded at or before
// it, for the "recorded as of" query axis. Unknown/never-recorded times yield
// null so callers fall back to the current view explicitly.
export function resolveCutoffSeqFromDecisions(decisions, recordedAt) {
  if (!Number.isFinite(Number(recordedAt))) return null
  const cutoffMs = Number(recordedAt)
  let best = null
  for (const decision of decisions || []) {
    if (!Number.isFinite(decision.recordedSeq) || !Number.isFinite(decision.recordedAt)) continue
    if (decision.recordedAt <= cutoffMs && (best === null || decision.recordedSeq > best)) best = decision.recordedSeq
  }
  return best
}
