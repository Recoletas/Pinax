import { listDecisionsPaged, listProposals, listRejectionMarks } from './factLedger'
import { queryFacts } from './queryFacts'

async function readEvidence(db, items) {
  const ids = [...new Set(items.flatMap(item => item.evidenceIds || []))]
  if (!ids.length) return new Map()
  const rows = await db.table('evidenceSnapshots').bulkGet(ids)
  return new Map(rows.filter(Boolean).map(row => [row.id, row]))
}

// Each tab consumes a different read model. Keep the evidence and rows from
// one page in the same readonly snapshot, including on a subsequent page.
export function readLedgerWorkspacePage(db, { view, scope, filters, cursor = null }) {
  if (view === 'decisions') {
    return listDecisionsPaged(db, { scope, cursor, limit: 50 })
  }
  if (view === 'proposals') {
    return db.transaction('r', ['factProposals', 'rejectionMarks', 'evidenceSnapshots'], async () => {
      const [items, rejections] = await Promise.all([
        listProposals(db, { scope, status: 'pending' }), listRejectionMarks(db, { scope })
      ])
      return { ok: true, items, rejections, evidence: await readEvidence(db, items) }
    })
  }
  return db.transaction('r', ['ledgerMeta', 'factDecisions', 'factVersions', 'evidenceSnapshots'], async () => {
    const page = await queryFacts(db, { scope, ...filters, cursor })
    return page.ok ? { ...page, evidence: await readEvidence(db, page.items) } : page
  })
}
