import { normalizeScopeRef, encodeScopeKey } from './ledgerContract'
import { queryFacts } from './queryFacts'
import { traceTurnChain } from './ledgerReceiptBridge'

// AX14 — read-only ledger lookup shaped for the existing history tool chain
// (search/get/trace, mirroring executeHistoryLookup's surface). The trusted
// application boundary supplies the scope; the model can never widen it, name
// another book's data, or exceed the output budget. Results carry stable ids
// so O can freeze a manifest and later validate every reference against it
// (createFactReferenceValidator).

const HISTORY_LIMITS = Object.freeze({
  maxResults: 20,
  maxCharsPerItem: 200,
  maxOutputChars: 6000,
  maxTraceHops: 16
})

const fail = (reason, retryable = false) => ({ ok: false, reason, retryable, results: [], truncated: false, outputChars: 0 })

export function createLedgerHistoryTool(db) {
  if (!db) throw new Error('createLedgerHistoryTool requires an open ledger db')

  async function search(request) {
    const limit = Math.min(HISTORY_LIMITS.maxResults, Math.max(1, Math.floor(Number(request.limit) || 10)))
    const scope = request.scope
    const normalized = normalizeScopeRef(scope)
    if (!normalized.ok) return fail('scope-invalid')
    const factQuery = await queryFacts(db, {
      scope,
      subjectKeys: Array.isArray(request.subjectKeys) ? request.subjectKeys.slice(0, 8) : undefined,
      storyAt: request.storyAt ?? null,
      timeline: request.timeline ?? null,
      recordedAsOf: request.recordedAsOf ?? null,
      limit
    })
    if (!factQuery.ok) return fail(factQuery.reason, true)
    const terms = String(request.query || '').toLowerCase().split(/\s+/).filter(term => term.length >= 2)
    const results = factQuery.items
      .filter(item => !terms.length || terms.some(term => `${item.subjectLabel}${item.predicate}${item.object}`.toLowerCase().includes(term)))
      .slice(0, limit)
      .map(item => ({
        kind: 'fact-version',
        id: item.factVersionId,
        scopeKey: item.scopeKey,
        title: item.subjectLabel || item.subjectKey,
        summary: `${item.subjectLabel || item.subjectKey} · ${item.predicate} · ${item.object}`.slice(0, HISTORY_LIMITS.maxCharsPerItem),
        recordedAt: item.recordedAt,
        recordedSeq: item.recordedSeq,
        evidenceIds: item.evidenceIds
      }))
    return { ok: true, results: results.slice(0, limit), truncated: factQuery.items.length > results.length, scanned: factQuery.scanned }
  }

  async function get(request) {
    const scope = request.scope
    const normalized = normalizeScopeRef(scope)
    if (!normalized.ok) return fail('scope-invalid')
    const scopeKey = encodeScopeKey(normalized.scope)
    const ids = (Array.isArray(request.ids) ? request.ids : []).slice(0, HISTORY_LIMITS.maxResults)
    const results = []
    for (const id of ids) {
      // A well-formed id from ANOTHER scope must be indistinguishable from a
      // missing one: same low-sensitivity 'not-found', no existence hint.
      const row = await db.table('factVersions').get(String(id))
      if (!row || row.scopeKey !== scopeKey) continue
      results.push({
        kind: 'fact-version',
        id: row.id,
        scopeKey: row.scopeKey,
        title: row.subjectLabel || row.subjectKey,
        summary: `${row.subjectLabel || row.subjectKey} · ${row.predicate} · ${row.object}`.slice(0, HISTORY_LIMITS.maxCharsPerItem),
        recordedAt: row.recordedAt,
        recordedSeq: row.recordedSeq,
        evidenceIds: row.evidenceIds
      })
    }
    return { ok: true, results, truncated: false, notFoundCount: ids.length - results.length }
  }

  async function trace(request) {
    const scope = request.scope
    const result = await traceTurnChain(db, { scope, turnId: request.turnId, maxHops: Math.min(HISTORY_LIMITS.maxTraceHops, Number(request.maxHops) || 8) })
    if (!result.ok) return fail(result.reason, result.retryable)
    return { ok: true, results: result.chain.map(link => ({ kind: 'turn-receipt', ...link })), truncated: result.truncated }
  }

  return async function executeLedgerHistoryLookup(input = {}) {
    const started = Date.now()
    const result = input.action === 'get' ? await get(input)
      : input.action === 'trace' ? await trace(input)
      : await search(input)
    if (result.ok) {
      const outputChars = result.results.reduce((n, item) => n + (item.summary?.length || 0), 0)
      result.outputChars = outputChars
      result.truncated = result.truncated || outputChars > HISTORY_LIMITS.maxOutputChars
      result.elapsedMs = Date.now() - started
    }
    return result
  }
}
