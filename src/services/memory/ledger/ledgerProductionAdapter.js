import { createLedgerFactProjection } from './ledgerProjection'
import { listLegacyMigrationMap } from './legacyMigration'
import { openLedgerDb, closeLedgerDb } from './ledgerDb'

// AX07/AX08 — production adapter that lets the EXISTING project memory
// reader serve author-confirmed facts without a second global recall path.
//
// Integrated through the existing authoring reader: the
// reader's repository may expose an optional `ledgerFacts(request)`; the
// reader appends the returned blocks to its candidate blocks and drops the
// returned legacy candidate ids from candidate ranking (no double recall for
// migrated memories). This module IS that method — everything stays inside
// the memory domain; the reader change is a few lines.
//
// The projection is the ONLY thing that turns facts into model context:
// pending proposals, rejections, other scopes and unverified legacy
// migrations never pass through here.

export function createLedgerFactsMethod({ db } = {}) {
  if (!db) throw new Error('createLedgerFactsMethod requires an open ledger db')
  const project = createLedgerFactProjection(db)

  return async function ledgerFacts({ context = {}, query = '', limit, maxItemChars } = {}) {
    const projectId = typeof context.projectId === 'string' ? context.projectId.trim() : ''
    // Facts attach to their book scope. No book identity → no fact context
    // (author-domain facts are a later ADR; guessing a scope is worse than
    // an honest empty block).
    if (!projectId) return { blocks: [], suppressLegacyCandidateIds: new Set() }
    const terms = String(query || '')
      .toLowerCase()
      .split(/[\s,，。！？、；：,.!?;:"'“”‘’（）()[\]{}<>《》\n\r\t/]+/u)
      .map(term => term.trim())
      .filter(term => term.length >= 2)
      .slice(0, 32)

    const projection = await project({
      scope: { domain: 'book', bookId: projectId },
      limit: Math.min(12, Math.max(1, Math.floor(Number(limit) || 6))),
      maxItemChars: Math.min(240, Math.max(60, Math.floor(Number(maxItemChars) || 180)))
    })
    if (!projection.ok) return { blocks: projection.blocks, suppressLegacyCandidateIds: new Set() }

    // Query-term prefilter over the frozen manifest only; no hit ever
    // widens what the manifest froze.
    const blocks = terms.length
      ? projection.blocks.filter(block => !block.included || terms.some(term => block.text.toLowerCase().includes(term)))
      : projection.blocks

    const map = await listLegacyMigrationMap(db, { scope: { domain: 'book', bookId: projectId } })
    return {
      blocks,
      suppressLegacyCandidateIds: new Set(Object.entries(map.ok ? map.map : {})
        .filter(([, versionId]) => blocks.some(block => block.included && block.factVersionId === versionId))
        .map(([candidateId]) => candidateId)),
      snapshotVersion: projection.snapshotVersion,
      completeness: projection.completeness
    }
  }
}

// Request-scoped connection: no leaked handles or stale book-scoped cache.
export async function readProductionLedgerFacts(request) {
  const opened = await openLedgerDb({ openTimeoutMs: 1500 })
  if (!opened.ok) return { blocks: [{ id: 'fact-ledger-unavailable', text: '', included: false, reason: opened.reason }], suppressLegacyCandidateIds: new Set() }
  try {
    return await createLedgerFactsMethod({ db: opened.db })(request)
  } catch {
    return { blocks: [{ id: 'fact-ledger-unavailable', text: '', included: false, reason: 'ledger-read-failed' }], suppressLegacyCandidateIds: new Set() }
  } finally {
    await closeLedgerDb(opened.db)
  }
}

// Convenience wrapper for the authoring-side repository enhancer: opens the
// ledger, attaches ledgerFacts to the repository, and returns a close fn.
// The reader keeps working unchanged when the ledger is unavailable —
// repository simply has no ledgerFacts method then.
export async function attachLedgerFactsToRepository(repository) {
  const opened = await openLedgerDb()
  if (!opened.ok) return { ok: false, reason: opened.reason, close: () => {} }
  const db = opened.db
  repository.ledgerFacts = createLedgerFactsMethod({ db })
  return { ok: true, db, close: () => closeLedgerDb(db) }
}
