import { listMemoryCandidates } from '../memoryCandidates'
import {
  normalizeScopeRef,
  encodeScopeKey,
  scopeRefFromLegacy,
  normalizeClaim,
  claimFingerprint,
  normalizeStoryIntervalInput,
  deriveFactKey,
  payloadHash,
  ledgerId
} from './ledgerContract'
import { LEDGER_TX_TABLES } from './ledgerDb'

// A13 — legacy migration stays a preview + explicit per-record action. This
// night does NOT switch the synchronous candidate owner to the ledger; legacy
// active candidates are labeled "旧版已接受记忆" and only become canonical
// facts through an author decision that keeps legacyCandidateId provenance.
// Migration is idempotent per source candidate (crash → re-enter safely) and
// never deletes or rewrites legacy data.

export function previewLegacyMigration() {
  let list
  try {
    list = listMemoryCandidates()
  } catch (error) {
    return { ok: false, reason: 'legacy-read-failed', detail: error?.message || String(error) }
  }
  const preview = {
    ok: true,
    total: list.length,
    claimable: [],
    missingSource: [],
    unattributable: [],
    duplicateIds: [],
    corrupted: [],
    byStatus: {}
  }
  const seenIds = new Set()
  for (const item of list) {
    if (!item || typeof item.id !== 'string' || !item.id) {
      preview.corrupted.push({ reason: 'missing-id' })
      continue
    }
    if (seenIds.has(item.id)) preview.duplicateIds.push(item.id)
    seenIds.add(item.id)
    preview.byStatus[item.status] = (preview.byStatus[item.status] || 0) + 1
    const scoped = scopeRefFromLegacy(item.scope, item.scopeId)
    if (!scoped.ok) {
      preview.unattributable.push({
        id: item.id,
        scope: item.scope,
        scopeId: item.scopeId || '',
        identityKind: scoped.identityKind || 'legacy-unknown',
        reason: scoped.reason
      })
      continue
    }
    const hasSource = Array.isArray(item.sourceRefs) && item.sourceRefs.length > 0 && String(item.sourceRevision || '').trim()
    if (!hasSource) {
      preview.missingSource.push({ id: item.id, scope: item.scope, scopeId: item.scopeId || '' })
      continue
    }
    // Only explicit author-accepted candidates are offered; the rest stay in
    // the legacy owner where existing recall filters already exclude them.
    if (item.status !== 'active') continue
    preview.claimable.push({
      id: item.id,
      scope: scoped.scope,
      scopeKey: encodeScopeKey(scoped.scope),
      content: item.content,
      kind: item.kind,
      sourceRefs: item.sourceRefs.slice(0, 8),
      sourceRevision: item.sourceRevision,
      storyTime: item.metadata?.storyTime || { precision: 'unknown' }
    })
  }
  return preview
}

function claimFromLegacyContent(previewItem) {
  // Legacy candidates store one free-text sentence, not subject/predicate
  // triples. The migration keeps the sentence as the object of an explicit
  // "记事" claim so nothing is silently re-parsed or guessed into entities;
  // a later structured correction can split it without faking provenance.
  return normalizeClaim({
    subjectKey: `legacy:${previewItem.id}`,
    subjectLabel: previewItem.kind || '旧记忆',
    predicate: '记事',
    object: previewItem.content
  })
}

export async function migrateLegacyCandidate(db, { candidate, commandId, actorRef } = {}) {
  if (!candidate || typeof candidate.id !== 'string' || !candidate.id) {
    return { ok: false, reason: 'candidate-invalid', retryable: false }
  }
  const scoped = scopeRefFromLegacy(candidate.scope, candidate.scopeId)
  if (!scoped.ok) return { ok: false, reason: scoped.reason, retryable: false, identityKind: scoped.identityKind || null }
  const claim = claimFromLegacyContent({
    id: candidate.id,
    content: String(candidate.content || ''),
    kind: candidate.kind
  })
  if (!claim.ok) return { ok: false, reason: claim.reason, retryable: false }
  const interval = normalizeStoryIntervalInput(candidate.metadata?.storyTime || { precision: 'unknown' })
  if (!interval.ok) return { ok: false, reason: interval.reason, retryable: false }
  const fingerprint = claimFingerprint(encodeScopeKey(scoped.scope), claim.claim)
  const payload = { candidateId: candidate.id, sourceRevision: candidate.sourceRevision, fingerprint }

  try {
    return await db.transaction('rw', LEDGER_TX_TABLES, async () => {
      const tables = {
        evidence: db.table('evidenceSnapshots'),
        proposals: db.table('factProposals'),
        versions: db.table('factVersions'),
        decisions: db.table('factDecisions'),
        rejections: db.table('rejectionMarks'),
        meta: db.table('ledgerMeta')
      }
      const prior = await tables.decisions.where('commandId').equals(String(commandId)).first()
      const hash = payloadHash(payload)
      if (prior) {
        if (prior.payloadHash !== hash) return { ok: false, reason: 'command-payload-conflict', retryable: false }
        return { ok: true, replay: true, decision: prior, result: prior.result }
      }
      // Crash-safe re-entry: an earlier migration of this exact candidate is
      // detected by its decision fingerprint, not by a side table.
      const sameSource = await tables.decisions.where('scopeKey').equals(encodeScopeKey(scoped.scope)).toArray()
      const already = sameSource.find(row => row.operation === 'migrate-legacy' && row.result?.candidateId === candidate.id)
      if (already) return { ok: true, replay: true, decision: already, result: already.result }

      const evidence = {
        id: ledgerId('ev'),
        scopeKey: encodeScopeKey(scoped.scope),
        scope: scoped.scope,
        sourceKind: 'legacy-candidate',
        sourceId: candidate.id,
        sourceRevision: String(candidate.sourceRevision || ''),
        quote: '',
        contentHash: payloadHash({ sourceRefs: candidate.sourceRefs, sourceRevision: candidate.sourceRevision }),
        recordedAt: Date.now(),
        tombstoneAt: null
      }
      await tables.evidence.add(evidence)

      const seqRecord = await tables.meta.get(`seq:${encodeScopeKey(scoped.scope)}`)
      const seq = (Number.isFinite(seqRecord?.seq) ? seqRecord.seq : 0) + 1
      await tables.meta.put({ id: `seq:${encodeScopeKey(scoped.scope)}`, seq })
      const now = Date.now()
      const proposal = {
        id: ledgerId('prop'),
        schemaVersion: 2,
        scopeKey: encodeScopeKey(scoped.scope),
        scope: scoped.scope,
        ...claim.claim,
        factKey: deriveFactKey(claim.claim),
        evidenceIds: [evidence.id],
        sourceRevision: String(candidate.sourceRevision || ''),
        storyInterval: interval.interval,
        baseRevision: candidate.id,
        status: 'adopted',
        origin: 'legacy-migration',
        fingerprint,
        createdAt: now
      }
      await tables.proposals.add(proposal)
      const version = {
        id: ledgerId('fv'),
        schemaVersion: 2,
        factKey: proposal.factKey,
        scopeKey: proposal.scopeKey,
        scope: scoped.scope,
        ...claim.claim,
        evidenceIds: [evidence.id],
        validInterval: interval.interval,
        recordedAt: now,
        recordedSeq: seq,
        supersedes: null,
        authority: 'author-confirmed',
        origin: 'legacy-migration',
        legacyRefs: { legacyCandidateId: candidate.id, legacySourceRefs: candidate.sourceRefs, legacyRevisionId: candidate.sourceRevision }
      }
      await tables.versions.add(version)
      const decision = {
        id: ledgerId('dec'),
        commandId: String(commandId),
        scopeKey: proposal.scopeKey,
        scope: scoped.scope,
        operation: 'migrate-legacy',
        actorKind: 'author',
        actorRef: String(actorRef || ''),
        reason: 'legacy-explicit-migration',
        beforeIds: [],
        afterIds: [version.id],
        recordedAt: now,
        recordedSeq: seq,
        payloadHash: hash,
        result: { candidateId: candidate.id, factVersionId: version.id, factKey: version.factKey }
      }
      await tables.decisions.add(decision)
      return { ok: true, replay: false, decision, result: decision.result }
    })
  } catch (error) {
    return { ok: false, reason: 'db-unavailable', retryable: true, detail: error?.message || String(error) }
  }
}

// Read-side dedupe map: legacy candidate ids already migrated into the
// ledger, so recall adapters can skip one side without touching the legacy
// owner (O wires this; A only exposes the mapping).
export async function listLegacyMigrationMap(db, { scope } = {}) {
  const normalized = normalizeScopeRef(scope)
  if (!normalized.ok) return { ok: false, reason: 'scope-invalid', map: {} }
  const decisions = await db.table('factDecisions')
    .where('scopeKey').equals(encodeScopeKey(normalized.scope)).toArray()
  const map = {}
  for (const row of decisions) {
    if (row.operation === 'migrate-legacy' && row.result?.candidateId) map[row.result.candidateId] = row.result.factVersionId
  }
  return { ok: true, map }
}
