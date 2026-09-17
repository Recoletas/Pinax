import { queryFacts } from './queryFacts'

// A15/AX06 — frozen read-only projection for the production reader chain.
// This module never writes, never touches legacy candidate recall, and
// reports low-sensitivity reason codes only.
//
// AX06 semantics: a fact block keeps its FULL claim shape — subject ·
// predicate · object — plus the frozen evidence revision and the story-time
// result. An object that exceeds the character budget is EXCLUDED, never
// character-truncated: `城门不对外` truncated to `城门不…` would invert
// meaning. Exclusions land in the zero-content audit block (XA-G09).

export const FACT_PROJECTION_SCHEMA_VERSION = 2

// Hard caps mirrors of the knowledge contract limits; callers may lower but
// not raise them.
const PROJECTION_LIMITS = Object.freeze({
  maxItems: 24,
  maxItemChars: 240
})

// G-A25: the model may only reference fact versions that were in the frozen
// manifest it actually received. Anything else — even a well-formed id — is
// refused at this boundary.
export function createFactReferenceValidator(manifestFactVersionIds) {
  const known = new Set((Array.isArray(manifestFactVersionIds) ? manifestFactVersionIds : []).map(id => String(id)))
  return function validateFactReference(factVersionId) {
    const id = String(factVersionId ?? '')
    if (!id || !known.has(id)) return { ok: false, reason: 'fact-ref-not-in-manifest' }
    return { ok: true, factVersionId: id }
  }
}

function classifyEvidence(rows) {
  if (!rows.length) return { verification: 'no-evidence', sourceRevision: null }
  const kinds = new Set(rows.map(row => row.sourceKind))
  const revision = rows.find(row => row.sourceRevision)?.sourceRevision || null
  if (kinds.has('chapter-quote')) return { verification: 'chapter-quote', sourceRevision: revision }
  if (kinds.has('legacy-candidate')) return { verification: 'unverifiable-legacy-source', sourceRevision: revision }
  return { verification: 'manual-assertion', sourceRevision: revision }
}

export function createLedgerFactProjection(db) {
  if (!db) throw new Error('createLedgerFactProjection requires an open ledger db')

  return async function projectFacts(request = {}) {
    const limit = Math.min(PROJECTION_LIMITS.maxItems, Math.max(1, Math.floor(Number(request.limit) || PROJECTION_LIMITS.maxItems)))
    const maxChars = Math.min(PROJECTION_LIMITS.maxItemChars, Math.max(40, Math.floor(Number(request.maxItemChars) || PROJECTION_LIMITS.maxItemChars)))
    const query = await queryFacts(db, {
      scope: request.scope,
      subjectKeys: Array.isArray(request.subjectKeys) ? request.subjectKeys.slice(0, 8) : undefined,
      storyAt: request.storyAt ?? null,
      timeline: request.timeline ?? null,
      recordedAsOf: request.recordedAsOf ?? null
    })
    if (!query.ok) {
      return {
        schemaVersion: FACT_PROJECTION_SCHEMA_VERSION,
        ok: false,
        reason: query.reason,
        blocks: [{
          id: 'fact-ledger-unavailable',
          title: '事实账本不可用',
          text: '',
          authority: 'author-confirmed',
          included: false,
          reason: query.reason
        }]
      }
    }

    // Evidence lookups are frozen at the same walk; they only ever annotate
    // (revision + verification class) and never widen content.
    const evidenceIds = [...new Set(query.items.flatMap(item => item.evidenceIds || []))]
    const evidenceRows = evidenceIds.length ? (await db.table('evidenceSnapshots').bulkGet(evidenceIds)).filter(Boolean) : []
    const evidenceById = new Map(evidenceRows.map(row => [row.id, row]))

    const blocks = []
    let omittedByCap = 0
    let omittedOverBudget = 0
    for (const item of query.items) {
      if (blocks.length >= limit) {
        omittedByCap += 1
        continue
      }
      // AX06: over-budget objects are excluded whole — a clipped object can
      // flip a negation or drop a unit and poison the model context.
      if (item.object.length > maxChars) {
        omittedOverBudget += 1
        continue
      }
      const evidence = classifyEvidence((item.evidenceIds || []).map(id => evidenceById.get(id)).filter(Boolean))
      blocks.push({
        id: `fact:${item.factVersionId}`,
        title: item.subjectLabel || item.subjectKey,
        text: `${item.subjectLabel || item.subjectKey} · ${item.predicate} · ${item.object}`,
        claim: { subjectKey: item.subjectKey, subjectLabel: item.subjectLabel, predicate: item.predicate, object: item.object },
        authority: 'author-confirmed',
        factVersionId: item.factVersionId,
        sourceRefs: [`fact:${item.factVersionId}`],
        factKey: item.factKey,
        evidenceVerification: evidence.verification,
        sourceRevision: evidence.sourceRevision,
        evidenceIds: (item.evidenceIds || []).slice(0, 8),
        recordedSeq: item.recordedSeq,
        timeMatch: request.storyAt ? 'inside' : null,
        validInterval: item.validInterval,
        included: true,
        reason: 'author-confirmed-fact'
      })
    }

    const excluded = query.excludedReasonCounts || {}
    if (Object.keys(excluded).length || omittedByCap || omittedOverBudget) {
      blocks.push({
        id: 'fact-ledger-audit',
        title: '事实投影审计',
        // Privacy boundary: audit block carries reason codes only — no
        // excluded fact bodies, no hidden titles, no sensitive counts of
        // hidden content beyond the zero-content reason tallies.
        text: '',
        authority: 'author-confirmed',
        included: false,
        reason: Object.keys(excluded).sort().join('+') || (omittedOverBudget ? 'object-over-budget' : 'projection-cap'),
        recallAudit: {
          excludedByReason: excluded,
          omittedByCap,
          omittedOverBudget
        }
      })
    }

    return {
      schemaVersion: FACT_PROJECTION_SCHEMA_VERSION,
      ok: true,
      blocks,
      manifestFactVersionIds: blocks.filter(block => block.included).map(block => block.factVersionId),
      snapshotVersion: query.snapshotVersion,
      completeness: query.completeness,
      ledgerAdvanced: query.ledgerAdvanced,
      scanned: query.scanned,
      elapsedMs: query.elapsedMs
    }
  }
}
