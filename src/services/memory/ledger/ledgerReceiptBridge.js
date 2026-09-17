import {
  normalizeScopeRef,
  encodeScopeKey
} from './ledgerContract'
import { appendCommittedTurnReceipt } from './factLedger'

// AX09/AX10/AX13/AX16 — bridge participant between the roleplay line's
// history port and the fact ledger. A only ARCHIVES committed receipts and
// serves them read-only; it never re-executes actions, never rolls dice,
// never calls a provider, and never writes game state (gameStore/session
// owner stays with C).
//
// Port contract matches C's `installRoleplayHistoryPort({ read, record })`:
//   record({ scope, sessionId, branchId, turnId, actionId, receipt })
//     -> { ok, reason?, retryable?, eventId? }
//   read({ scope, sessionId, branchId, throughTurnId, viewerRef, limit })
//     -> { ok, reason?, retryable?, records? }
// "No records yet" ({ok, records: []}) and "archive unavailable"
// ({ok: false, retryable: true}) are never conflated.

export const RECEIPT_BRIDGE_REASONS = Object.freeze({
  unavailable: 'roleplay-history-unavailable',
  scopeRejected: 'roleplay-history-scope-rejected',
  receiptConflict: 'roleplay-history-receipt-conflict',
  receiptInvalid: 'roleplay-history-receipt-invalid',
  actionMismatch: 'roleplay-history-action-mismatch',
  danglingReference: 'roleplay-history-dangling-reference'
})

const READ_LIMIT_MAX = 200
const TRACE_MAX_HOPS = 32

function resolveSessionScope(input) {
  const normalized = normalizeScopeRef(input)
  if (!normalized.ok) return null
  if (normalized.scope.domain !== 'session') return null
  return { scope: normalized.scope, scopeKey: encodeScopeKey(normalized.scope) }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function validRefList(value) {
  return Array.isArray(value) && value.every(entry => nonEmptyString(entry))
}

// Bridge record: full validation BEFORE the ledger append; idempotent under
// retry; same receiptId with different content is refused, never overwritten.
export function createRoleplayArchiveParticipant(db) {
  if (!db) throw new Error('createRoleplayArchiveParticipant requires an open ledger db')

  async function record(request = {}) {
    const resolved = resolveSessionScope(request.scope)
    // Null/missing branch never reaches the ledger (AX09); the session owner
    // is expected to repair, not the archive to guess one.
    if (!resolved) return { ok: false, reason: RECEIPT_BRIDGE_REASONS.scopeRejected, retryable: false, eventId: null }
    const receipt = request.receipt
    if (!receipt || typeof receipt !== 'object'
      || !nonEmptyString(receipt.receiptId) || !nonEmptyString(receipt.turnId)
      || !nonEmptyString(receipt.commandId) || !nonEmptyString(receipt.rulesVersion)
      || !Number.isFinite(Number(receipt.committedAt))
      // A committed turn cites at least one evidence reference; a receipt
      // that references nothing carries no auditable payload (AX09).
      || !Array.isArray(receipt.evidenceRefs) || receipt.evidenceRefs.length === 0
      || !validRefList(receipt.evidenceRefs)
      || !validRefList(receipt.stateDeltaRefs)) {
      return { ok: false, reason: RECEIPT_BRIDGE_REASONS.receiptInvalid, retryable: false, eventId: null }
    }
    if (nonEmptyString(request.actionId) && receipt.receiptId !== request.actionId) {
      return { ok: false, reason: RECEIPT_BRIDGE_REASONS.actionMismatch, retryable: false, eventId: null }
    }
    if (request.turnId !== undefined && request.turnId !== null && String(request.turnId) !== receipt.turnId) {
      return { ok: false, reason: RECEIPT_BRIDGE_REASONS.actionMismatch, retryable: false, eventId: null }
    }
    const receiptScope = receipt.scope
    if (!receiptScope || receiptScope.domain !== 'session'
      || receiptScope.sessionId !== resolved.scope.sessionId
      || receiptScope.branchId !== resolved.scope.branchId) {
      return { ok: false, reason: RECEIPT_BRIDGE_REASONS.scopeRejected, retryable: false, eventId: null }
    }
    const appended = await appendCommittedTurnReceipt(db, { scope: resolved.scope, receipt })
    if (!appended.ok) {
      if (appended.reason === 'receipt-conflict') {
        return { ok: false, reason: RECEIPT_BRIDGE_REASONS.receiptConflict, retryable: false, eventId: null }
      }
      return { ok: false, reason: RECEIPT_BRIDGE_REASONS.unavailable, retryable: true, eventId: null }
    }
    return { ok: true, eventId: receipt.receiptId, replay: Boolean(appended.replay) }
  }

  async function read(request = {}) {
    const resolved = resolveSessionScope(request.scope)
    if (!resolved) return { ok: false, reason: RECEIPT_BRIDGE_REASONS.scopeRejected, retryable: false, records: null }
    try {
      const result = await queryTurnReceipts(db, {
        scope: resolved.scope,
        branchId: request.branchId,
        throughTurnId: request.throughTurnId,
        limit: request.limit
      })
      if (!result.ok) {
        return { ok: false, reason: RECEIPT_BRIDGE_REASONS.unavailable, retryable: true, records: null }
      }
      return { ok: true, records: result.items, scanned: result.scanned }
    } catch {
      return { ok: false, reason: RECEIPT_BRIDGE_REASONS.unavailable, retryable: true, records: null }
    }
  }

  return { record, read }
}

// AX10: archive-only drain for an offline outbox. Every entry goes through
// the idempotent append; failures stay in the caller's outbox (this function
// never mutates the session outbox — that is C's write set).
export async function drainReceiptArchive(db, { scope, receipts = [] } = {}) {
  const participant = createRoleplayArchiveParticipant(db)
  const summary = { ok: true, archived: 0, duplicates: 0, rejected: [], unavailable: false }
  for (const receipt of receipts) {
    const result = await participant.record({ scope, receipt })
    if (result.ok) {
      if (result.replay) summary.duplicates += 1
      else summary.archived += 1
      continue
    }
    if (result.reason === RECEIPT_BRIDGE_REASONS.unavailable) summary.unavailable = true
    summary.rejected.push({ receiptId: receipt?.receiptId || null, reason: result.reason })
  }
  return summary
}

// AX13: committed receipts by session/branch, index-ranged and paged — the
// 200-entry hot window never bounds history here. Only structural fields are
// served; narrative text stays in the session owner.
export async function queryTurnReceipts(db, { scope, branchId = null, throughTurnId = null, cursor = null, limit = 50 } = {}) {
  const startedAt = Date.now()
  const normalized = normalizeScopeRef(scope)
  if (!normalized.ok) return { ok: false, reason: 'scope-invalid', items: [], nextCursor: null, scanned: 0, elapsedMs: 0 }
  const scopeKey = encodeScopeKey(normalized.scope)
  const page = Math.min(READ_LIMIT_MAX, Math.max(1, Math.floor(Number(limit) || 50)))
  try {
    let upperSeq = Number.MAX_SAFE_INTEGER
    if (throughTurnId) {
      // Receipts are keyed by receiptId; the anchor is a TURN id, resolved
      // through the turnId index and checked against the scope.
      const anchor = await db.table('turnReceipts').where('turnId').equals(String(throughTurnId)).first()
      // Unknown through-anchor: honest empty view of that branch, not the
      // whole log.
      if (!anchor || anchor.scopeKey !== scopeKey) {
        return { ok: true, items: [], nextCursor: null, scanned: 1, elapsedMs: Date.now() - startedAt }
      }
      upperSeq = anchor.archivedSeq
    }
    let lastSeq = null
    if (cursor) {
      let parsed
      try { parsed = JSON.parse(atob(String(cursor))) } catch { return { ok: false, reason: 'cursor-invalid', items: [], nextCursor: null, scanned: 0, elapsedMs: 0 } }
      if (parsed?.v !== 1 || !Number.isFinite(parsed.lastSeq)) return { ok: false, reason: 'cursor-invalid', items: [], nextCursor: null, scanned: 0, elapsedMs: 0 }
      lastSeq = parsed.lastSeq
      if (lastSeq < upperSeq) upperSeq = lastSeq
    }
    // AX15: bounded chunked index walk — never a whole-log toArray. The walk
    // starts from the scope's live sequence (archivedSeq can never exceed
    // it; both share the per-scope counter), not from +infinity, and collects
    // page+1 items so "is there a next page" survives a chunk that holds the
    // remainder of the log.
    const CHUNK = 500
    const MAX_SCAN = 5000
    const seqRecord = await db.table('ledgerMeta').get(`seq:${scopeKey}`)
    const liveSeq = Number.isFinite(seqRecord?.seq) ? seqRecord.seq : upperSeq
    const table = db.table('turnReceipts')
    const items = []
    let scanned = 0
    let high = Math.min(upperSeq, liveSeq)
    let exhausted = false
    while (items.length <= page && !exhausted && scanned < MAX_SCAN) {
      const low = Math.max(0, high - CHUNK + 1)
      const chunk = await table
        .where('[scopeKey+archivedSeq]')
        .between([scopeKey, low], [scopeKey, high], true, true)
        .reverse()
        .toArray()
      scanned += chunk.length
      for (const row of chunk) {
        if (branchId && row.branchId !== branchId) continue
        if (items.length > page) break
        items.push({
          receiptId: row.receiptId,
          turnId: row.turnId,
          parentTurnId: row.parentTurnId,
          branchId: row.branchId,
          rulesVersion: row.rulesVersion,
          resolutionRef: row.resolutionRef,
          stateDeltaRefs: row.stateDeltaRefs,
          evidenceRefs: row.evidenceRefs,
          committedAt: row.committedAt,
          archivedSeq: row.archivedSeq
        })
      }
      if (low === 0) exhausted = true
      else high = low - 1
    }
    const hasMore = items.length > page
    const pageItems = items.slice(0, page)
    const nextCursor = hasMore && pageItems.length
      ? btoa(JSON.stringify({ v: 1, lastSeq: pageItems[pageItems.length - 1].archivedSeq }))
      : null
    return { ok: true, items: pageItems, nextCursor, scanned, elapsedMs: Date.now() - startedAt, scanBudgetExhausted: scanned >= MAX_SCAN }
  } catch (error) {
    return { ok: false, reason: 'db-unavailable', retryable: true, detail: error?.message || String(error), items: [], nextCursor: null, scanned: 0, elapsedMs: 0 }
  }
}

// AX16: bounded parent-chain walk for locating where a moment came from.
// Unknown parents stop the walk (reported), never guessed.
export async function traceTurnChain(db, { scope, turnId, maxHops = 8 } = {}) {
  const normalized = normalizeScopeRef(scope)
  if (!normalized.ok) return { ok: false, reason: 'scope-invalid', chain: [] }
  const scopeKey = encodeScopeKey(normalized.scope)
  const hops = Math.min(TRACE_MAX_HOPS, Math.max(1, Math.floor(Number(maxHops) || 8)))
  const chain = []
  const seen = new Set()
  let cursorTurnId = String(turnId || '')
  try {
    while (cursorTurnId && !seen.has(cursorTurnId) && chain.length <= hops) {
      seen.add(cursorTurnId)
      const row = await db.table('turnReceipts').where('turnId').equals(cursorTurnId).first()
      if (!row || row.scopeKey !== scopeKey) break
      chain.push({
        receiptId: row.receiptId,
        turnId: row.turnId,
        parentTurnId: row.parentTurnId,
        branchId: row.branchId,
        committedAt: row.committedAt,
        archivedSeq: row.archivedSeq
      })
      cursorTurnId = row.parentTurnId ? String(row.parentTurnId) : ''
    }
    return { ok: true, chain, truncated: Boolean(cursorTurnId && chain.length > hops), unknownParent: chain.length ? chain[chain.length - 1].parentTurnId && !seen.has(String(chain[chain.length - 1].parentTurnId)) : false }
  } catch (error) {
    return { ok: false, reason: 'db-unavailable', retryable: true, detail: error?.message || String(error), chain: [] }
  }
}
