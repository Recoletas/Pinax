import { normalizeScopeRef, encodeScopeKey, payloadHash } from './ledgerContract'
import { isVisibleAt, resolveCutoffSeqFromDecisions } from './recordAxis'
import { storyTimeMatch } from './storyInterval'

// Dual-time read query (K3 / A12 / AX02-AX03 / AX15). The two axes are
// independent parameters:
// - storyAt: a moment in the story world (declared timeline semantics).
// - recordedAsOf: the author's ledger view at a recorded point ({seq}) or a
//   wall-clock input ({recordedAt}, resolved to the max decision seq at or
//   before it). Omitting it means the current view.
//
// Cursor protocol (AX03, XA-G02/G03): the opaque cursor is a v2 envelope
// binding scopeKey, a hash of the query filter, the frozen snapshotSeq and
// the last returned sort key. A cursor from another scope, another filter, a
// tampered body, or an older protocol is REFUSED, never silently honored.
// Pagination runs against the frozen snapshot: versions recorded after the
// first page never leak in mid-walk, and `ledgerAdvanced` reports that the
// live ledger moved (caller may show "数据已变化请刷新").
//
// Reads are bounded chunked index walks (AX15/17): one page never requires
// materializing the whole scope. `scanned` and `elapsedMs` report real cost.

const PAGE_DEFAULT = 50
const PAGE_MAX = 200
const MAX_SUBJECT_FILTERS = 8
const CHUNK = 500
const MAX_SCAN = 20000

const fail = (reason, extra = {}) => ({
  ok: false, reason, retryable: reason === 'db-unavailable',
  items: [], excludedReasonCounts: {}, nextCursor: null,
  snapshotVersion: null, completeness: 'error', scanned: 0, elapsedMs: 0, ...extra
})

// base64 of UTF-8 bytes — btoa alone throws on non-Latin1 (e.g. Chinese
// subject keys), which would silently drop every cursor for CJK scopes.
function encodeCursor(envelope) {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(envelope))
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  } catch { return null }
}

function decodeCursorJson(cursor) {
  const binary = atob(String(cursor))
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function decodeCursor(cursor) {
  if (!cursor) return { ok: true, envelope: null }
  let parsed
  try {
    parsed = JSON.parse(decodeCursorJson(cursor))
  } catch {
    return { ok: false, reason: 'cursor-invalid' }
  }
  if (parsed?.v !== 2
    || typeof parsed.scopeKey !== 'string'
    || typeof parsed.filterHash !== 'string'
    || !Number.isFinite(parsed.snapshotSeq)
    || (parsed.lastSeq !== null && !Number.isFinite(parsed.lastSeq))) {
    return { ok: false, reason: 'cursor-invalid' }
  }
  // Tamper binding (AX03): the hash covers every envelope field, so editing
  // the snapshot or sort key in a re-encoded cursor fails verification and
  // the walk refuses instead of honoring a forged view.
  const expectedHash = payloadHash({
    subjects: parsed.subjects ?? null,
    storyAt: parsed.storyAt ?? null,
    timelineId: parsed.timelineId ?? null,
    cutoffInput: parsed.cutoffInput ?? null,
    scopeKey: parsed.scopeKey,
    snapshotSeq: parsed.snapshotSeq,
    lastSeq: parsed.lastSeq
  })
  if (parsed.filterHash !== expectedHash) return { ok: false, reason: 'cursor-invalid' }
  return { ok: true, envelope: parsed }
}

function normalizeFilter({ subjectKeys, storyAt, recordedAsOf, timeline }) {
  const subjects = Array.isArray(subjectKeys)
    ? [...new Set(subjectKeys.map(key => String(key)))].sort().slice(0, MAX_SUBJECT_FILTERS)
    : null
  const cutoffInput = recordedAsOf && Number.isFinite(Number(recordedAsOf.seq))
    ? { seq: Number(recordedAsOf.seq) }
    : recordedAsOf && recordedAsOf.recordedAt !== undefined ? { recordedAt: Number(recordedAsOf.recordedAt) } : null
  return {
    subjects,
    storyAt: storyAt ?? null,
    timelineId: timeline?.id ?? null,
    cutoffInput
  }
}

export async function queryFacts(db, input = {}) {
  const startedAt = Date.now()
  const normalized = normalizeScopeRef(input.scope)
  if (!normalized.ok) return fail('scope-invalid')
  const scopeKey = encodeScopeKey(normalized.scope)
  const page = Math.min(PAGE_MAX, Math.max(1, Math.floor(Number(input.limit) || PAGE_DEFAULT)))

  const cursor = decodeCursor(input.cursor)
  if (!cursor.ok) return fail(cursor.reason)
  const filter = normalizeFilter(input)

  // Filter binding: a cursor only continues the exact same query shape.
  const envelopeHash = filterState => payloadHash({
    subjects: filter.subjects,
    storyAt: filter.storyAt,
    timelineId: filter.timelineId,
    cutoffInput: filter.cutoffInput,
    scopeKey,
    snapshotSeq: filterState.snapshotSeq,
    lastSeq: filterState.lastSeq
  })
  if (cursor.envelope) {
    if (cursor.envelope.scopeKey !== scopeKey) return fail('cursor-scope-conflict')
    if (cursor.envelope.filterHash !== envelopeHash({ snapshotSeq: cursor.envelope.snapshotSeq, lastSeq: cursor.envelope.lastSeq })) {
      return fail('cursor-filter-conflict')
    }
  }

  try {
    const meta = db.table('ledgerMeta')
    const seqRecord = await meta.get(`seq:${scopeKey}`)
    const liveSeq = Number.isFinite(seqRecord?.seq) ? seqRecord.seq : 0
    // Frozen snapshot: taken on the first page, honored on every page.
    const snapshotSeq = cursor.envelope ? cursor.envelope.snapshotSeq : liveSeq
    const ledgerAdvanced = liveSeq > snapshotSeq

    // Resolve the recorded-axis cutoff. Wall-clock input resolves once and is
    // frozen into the cursor so every page sees the same view.
    let cutoffSeq = null
    if (filter.cutoffInput !== null && filter.cutoffInput.seq !== undefined) {
      cutoffSeq = filter.cutoffInput.seq
    } else if (filter.cutoffInput !== null && filter.cutoffInput.recordedAt !== undefined) {
      const decisions = await db.table('factDecisions').where('scopeKey').equals(scopeKey).toArray()
      cutoffSeq = resolveCutoffSeqFromDecisions(decisions, filter.cutoffInput.recordedAt)
      if (cutoffSeq === null) {
        // Nothing was recorded at or before that wall-clock input: the honest
        // answer is an empty ledger view, not the current one.
        return { ok: true, items: [], excludedReasonCounts: {}, nextCursor: null, snapshotVersion: snapshotSeq, completeness: 'complete', ledgerAdvanced, scanned: 0, elapsedMs: Date.now() - startedAt }
      }
    }
    // The record axis cutoff never exceeds the frozen snapshot, and a null
    // (current-view) cutoff is pinned to the snapshot: an invalidation
    // recorded after the walk started must not rewrite already-frozen pages.
    const axisCutoff = cutoffSeq === null ? snapshotSeq : Math.min(cutoffSeq, snapshotSeq)

    const versionsTable = db.table('factVersions')
    // Exclusive upper bound when continuing from a cursor: strictly older
    // than the last returned item. recordedSeq is unique per version in a
    // scope (each mutation allocates exactly one sequence number), so a seq
    // boundary is a total order here.
    const continuing = Boolean(cursor.envelope && cursor.envelope.lastSeq !== null)
    const upperBound = [scopeKey, continuing ? cursor.envelope.lastSeq : snapshotSeq]

    const items = []
    const excludedReasonCounts = {}
    let scanned = 0
    let exhausted = false
    let high = continuing ? upperBound[1] - 1 : upperBound[1]
    if (filter.subjects) {
      // Bounded subject filter (callers cap at 8): index reads per subject,
      // frozen to the snapshot, merged, then filtered newest-first.
      const merged = []
      for (const subjectKey of filter.subjects) {
        const rows = await versionsTable
          .where('[scopeKey+subjectKey]')
          .between([scopeKey, subjectKey], [scopeKey, subjectKey], true, true)
          .and(row => row.recordedSeq <= snapshotSeq)
          .toArray()
        scanned += rows.length
        merged.push(...rows)
      }
      merged.sort((a, b) => b.recordedSeq - a.recordedSeq || String(a.id).localeCompare(String(b.id)))
      // Continuing pages must resume strictly BELOW the cursor's sort key —
      // otherwise the same newest rows re-fill every page forever (AX02).
      const floorSeq = continuing ? cursor.envelope.lastSeq : null
      for (const version of merged) {
        if (floorSeq !== null && version.recordedSeq >= floorSeq) continue
        if (collect(version, items, excludedReasonCounts, { axisCutoff, storyAt: filter.storyAt, timeline: input.timeline }, page + 1)) break
      }
      exhausted = true
    } else {
      while (items.length <= page && !exhausted && scanned < MAX_SCAN) {
        const low = Math.max(0, high - CHUNK + 1)
        const chunk = await versionsTable
          .where('[scopeKey+recordedSeq]')
          .between([scopeKey, low], [scopeKey, high], true, true)
          .toArray()
        scanned += chunk.length
        chunk.sort((a, b) => b.recordedSeq - a.recordedSeq)
        for (const version of chunk) {
          if (collect(version, items, excludedReasonCounts, { axisCutoff, storyAt: filter.storyAt, timeline: input.timeline }, page + 1)) break
        }
        // Sequence space is SPARSE (decisions and retractions consume seqs
        // without adding versions), so an empty/short chunk is not the end —
        // only walking past seq 0 is.
        if (low === 0) exhausted = true
        else high = low - 1
      }
    }

    const hasMore = items.length > page
    const pageItems = items.slice(0, page)
    const nextCursor = hasMore && pageItems.length
      ? encodeCursor({
        v: 2,
        scopeKey,
        subjects: filter.subjects,
        storyAt: filter.storyAt,
        timelineId: filter.timelineId,
        cutoffInput: filter.cutoffInput,
        snapshotSeq,
        lastSeq: pageItems[pageItems.length - 1].recordedSeq,
        filterHash: envelopeHash({ snapshotSeq, lastSeq: pageItems[pageItems.length - 1].recordedSeq })
      })
      : null

    return {
      ok: true,
      items: pageItems,
      excludedReasonCounts,
      nextCursor,
      snapshotVersion: snapshotSeq,
      completeness: nextCursor ? 'partial-cursor' : 'complete',
      ledgerAdvanced,
      scanned,
      elapsedMs: Date.now() - startedAt,
      scanBudgetExhausted: scanned >= MAX_SCAN
    }
  } catch (error) {
    return fail('db-unavailable', { detail: error?.message || String(error) })
  }
}

// Returns true when the page-plus-one marker is reached (walk can stop).
// Filtering order: record axis → story time; exclusions tally reasons only.
function collect(version, items, excludedReasonCounts, filters, capacity) {
  if (!isVisibleAt(version, filters.axisCutoff)) return false
  if (filters.storyAt !== null) {
    const match = storyTimeMatch(version.validInterval, filters.storyAt, filters.timeline)
    if (match.match === 'outside') {
      excludedReasonCounts.storyTimeOutside = (excludedReasonCounts.storyTimeOutside || 0) + 1
      return false
    }
    if (match.match === 'unknown') {
      excludedReasonCounts.storyTimeUnknown = (excludedReasonCounts.storyTimeUnknown || 0) + 1
      return false
    }
  }
  items.push({
    factVersionId: version.id,
    factKey: version.factKey,
    scopeKey: version.scopeKey,
    subjectKey: version.subjectKey,
    subjectLabel: version.subjectLabel,
    predicate: version.predicate,
    object: version.object,
    evidenceIds: version.evidenceIds,
    validInterval: version.validInterval,
    recordedAt: version.recordedAt,
    recordedSeq: version.recordedSeq,
    supersedes: version.supersedes,
    authority: version.authority
  })
  return items.length >= capacity
}
