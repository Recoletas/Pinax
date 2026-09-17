import {
  LEDGER_FAILURE_REASONS,
  EVIDENCE_SOURCE_KINDS,
  PROPOSAL_ORIGINS,
  normalizeScopeRef,
  encodeScopeKey,
  normalizeClaim,
  normalizeStoryIntervalInput,
  deriveFactKey,
  claimFingerprint,
  payloadHash,
  sameInterval,
  ledgerId
} from './ledgerContract'
import { currentHeadOf } from './recordAxis'
import { LEDGER_TX_TABLES as TX_TABLES } from './ledgerDb'

// The single business owner of canonical facts. UI, model tools and backup
// parsers go through this repository; nothing else writes fact tables. Every
// mutation is one Dexie transaction keyed by an explicit commandId: retries
// with the same commandId and payload return the original decision, the same
// commandId with a different payload is refused, and failures leave no
// partial state behind.

const fail = (reason, extra = {}) => ({ ok: false, reason, retryable: reason === LEDGER_FAILURE_REASONS.dbUnavailable, ...extra })

function resolveScope(input) {
  const normalized = normalizeScopeRef(input)
  if (!normalized.ok) return normalized
  return { ok: true, scope: normalized.scope, scopeKey: encodeScopeKey(normalized.scope) }
}

async function allocateSeq(meta, scopeKey) {
  const record = await meta.get(`seq:${scopeKey}`)
  const seq = (Number.isFinite(record?.seq) ? record.seq : 0) + 1
  await meta.put({ id: `seq:${scopeKey}`, seq })
  return seq
}

// Envelope: idempotency probe, sequence allocation, decision write. The
// executor runs inside the transaction and may return {result, ...decision}
// or a plain {ok:false,...} refusal (no decision is written for refusals).
async function runCommand(db, scopeInput, commandId, payloadForHash, executor) {
  const scope = resolveScope(scopeInput)
  if (!scope.ok) return fail(scope.reason)
  const trimmed = typeof commandId === 'string' ? commandId.trim() : ''
  if (!trimmed) return fail('command-id-required')
  try {
    return await db.transaction('rw', TX_TABLES, async () => {
      const tables = {
        evidence: db.table('evidenceSnapshots'),
        proposals: db.table('factProposals'),
        versions: db.table('factVersions'),
        decisions: db.table('factDecisions'),
        rejections: db.table('rejectionMarks'),
        meta: db.table('ledgerMeta')
      }
      const prior = await tables.decisions.where('commandId').equals(trimmed).first()
      const hash = payloadHash(payloadForHash)
      if (prior) {
        if (prior.payloadHash !== hash) return fail(LEDGER_FAILURE_REASONS.commandPayloadConflict, { commandId: trimmed, priorDecisionId: prior.id })
        return { ok: true, replay: true, decision: prior, result: prior.result }
      }
      const decisionId = ledgerId('dec')
      const seq = await allocateSeq(tables.meta, scope.scopeKey)
      const outcome = await executor({ tables, seq, scopeKey: scope.scopeKey, scope: scope.scope, decisionId })
      // Refusals always carry ok:false; executor success returns decision
      // fields without an ok flag.
      if (outcome.ok === false) return outcome
      const decision = {
        id: decisionId,
        commandId: trimmed,
        scopeKey: scope.scopeKey,
        scope: scope.scope,
        operation: outcome.operation,
        actorKind: 'author',
        actorRef: String(outcome.actorRef || ''),
        reason: String(outcome.reason || ''),
        beforeIds: outcome.beforeIds || [],
        afterIds: outcome.afterIds || [],
        recordedAt: Date.now(),
        recordedSeq: seq,
        payloadHash: hash,
        result: outcome.result || {}
      }
      await tables.decisions.add(decision)
      return { ok: true, replay: false, decision, result: decision.result }
    })
  } catch (error) {
    return fail(LEDGER_FAILURE_REASONS.dbUnavailable, { detail: error?.message || String(error) })
  }
}

// Evidence is immutable once written: quote is the frozen review fragment,
// sourceRevision the version it came from. Re-adding the identical fragment
// returns the existing row (import/retry idempotency).
export async function appendEvidence(db, { scope, sourceKind, sourceId, sourceRevision = '', quote = '', recordedAt } = {}) {
  const resolved = resolveScope(scope)
  if (!resolved.ok) return fail(resolved.reason)
  if (!EVIDENCE_SOURCE_KINDS.includes(sourceKind)) return fail('evidence-kind-invalid')
  if (typeof quote !== 'string' || typeof sourceId !== 'string' || !sourceId.trim()) return fail('evidence-invalid')
  if (sourceKind === 'chapter-quote' && !String(sourceRevision || '').trim()) return fail('evidence-revision-required')
  const contentHash = payloadHash({ sourceKind, sourceId: sourceId.trim(), sourceRevision, quote })
  try {
    const table = db.table('evidenceSnapshots')
    const existing = await table.where('[scopeKey+sourceId]').equals([resolved.scopeKey, sourceId.trim()]).toArray()
    const match = existing.find(row => row.contentHash === contentHash && !row.tombstoneAt)
    if (match) return { ok: true, replay: true, evidence: match }
    const evidence = {
      id: ledgerId('ev'),
      scopeKey: resolved.scopeKey,
      scope: resolved.scope,
      sourceKind,
      sourceId: sourceId.trim(),
      sourceRevision: String(sourceRevision || ''),
      quote,
      contentHash,
      recordedAt: Number.isFinite(Number(recordedAt)) ? Number(recordedAt) : Date.now(),
      tombstoneAt: null
    }
    await table.add(evidence)
    return { ok: true, replay: false, evidence }
  } catch (error) {
    return fail(LEDGER_FAILURE_REASONS.dbUnavailable, { detail: error?.message || String(error) })
  }
}

export async function createProposal(db, input) {
  const resolved = resolveScope(input?.scope)
  if (!resolved.ok) return fail(resolved.reason)
  const claim = normalizeClaim(input || {})
  if (!claim.ok) return fail(claim.reason || LEDGER_FAILURE_REASONS.claimInvalid)
  const interval = normalizeStoryIntervalInput(input?.storyInterval)
  if (!interval.ok) return fail(interval.reason)
  const origin = PROPOSAL_ORIGINS.includes(input?.origin) ? input.origin : 'author'
  const evidenceIds = Array.isArray(input?.evidenceIds) ? [...new Set(input.evidenceIds.filter(id => typeof id === 'string' && id))] : []
  const fingerprint = claimFingerprint(resolved.scopeKey, claim.claim)
  try {
    const tables = { proposals: db.table('factProposals'), evidence: db.table('evidenceSnapshots'), rejections: db.table('rejectionMarks') }
    for (const evidenceId of evidenceIds) {
      const evidence = await tables.evidence.get(evidenceId)
      if (!evidence || evidence.scopeKey !== resolved.scopeKey) return fail(LEDGER_FAILURE_REASONS.evidenceMissing, { evidenceId })
    }
    const primary = evidenceIds.length ? await tables.evidence.get(evidenceIds[0]) : null
    const sourceRevision = primary?.sourceRevision || ''
    // Same claim, same source revision, still pending → idempotent re-propose.
    const pending = await tables.proposals.where('[scopeKey+status]').equals([resolved.scopeKey, 'pending']).toArray()
    const duplicate = pending.find(row => row.fingerprint === fingerprint && (row.sourceRevision || '') === sourceRevision)
    if (duplicate) return { ok: true, replay: true, proposal: duplicate }
    // A rejected claim with an unchanged source stays suppressed (A09): it
    // neither re-enters review nor adopts. A changed sourceRevision is a new
    // reviewable proposal; reopening the mark also lifts the suppression.
    const marks = await tables.rejections.where('[scopeKey+fingerprint]').equals([resolved.scopeKey, fingerprint]).toArray()
    const suppressedBy = marks.find(mark => !mark.reopenedAt && (mark.sourceRevision || '') === sourceRevision)
    if (suppressedBy) return { ok: true, suppressed: true, rejectionMarkId: suppressedBy.id }
    const proposal = {
      id: ledgerId('prop'),
      schemaVersion: 2,
      scopeKey: resolved.scopeKey,
      scope: resolved.scope,
      ...claim.claim,
      factKey: deriveFactKey(claim.claim),
      evidenceIds,
      sourceRevision,
      storyInterval: interval.interval,
      baseRevision: typeof input?.baseRevision === 'string' ? input.baseRevision : '',
      status: 'pending',
      origin,
      fingerprint,
      createdAt: Date.now()
    }
    await tables.proposals.add(proposal)
    return { ok: true, replay: false, proposal }
  } catch (error) {
    return fail(LEDGER_FAILURE_REASONS.dbUnavailable, { detail: error?.message || String(error) })
  }
}

function invalidation(now, seq) {
  return { invalidatedAt: now, invalidatedSeq: seq }
}

// Adopt a pending proposal as a canonical fact version. Concurrent adopts of
// the same proposal resolve to one fact: the second transaction reads the
// already-adopted status and refuses (or replays under the same commandId).
export async function adoptProposal(db, input) {
  const payload = {
    scope: input?.scope, proposalId: input?.proposalId,
    object: input?.object ?? null, storyInterval: input?.storyInterval ?? null,
    evidenceIds: input?.evidenceIds ?? [], manualAssertion: Boolean(input?.manualAssertion),
    expectedHead: input?.expectedHead ?? null, actorRef: input?.actorRef ?? '', reason: input?.reason ?? ''
  }
  return runCommand(db, payload.scope, input?.commandId, payload, async ({ tables, seq, scopeKey, scope }) => {
    const proposal = await tables.proposals.get(input?.proposalId)
    if (!proposal || proposal.scopeKey !== scopeKey) return fail(LEDGER_FAILURE_REASONS.proposalNotFound)
    if (proposal.status === 'adopted') return fail(LEDGER_FAILURE_REASONS.proposalAlreadyAdopted, { adoptedVersionId: proposal.adoptedVersionId || null })
    if (proposal.status !== 'pending') return fail(LEDGER_FAILURE_REASONS.proposalNotPending, { status: proposal.status })

    const claim = normalizeClaim({
      subjectKey: proposal.subjectKey,
      subjectLabel: proposal.subjectLabel,
      predicate: proposal.predicate,
      object: payload.object !== null ? payload.object : proposal.object
    })
    if (!claim.ok) return fail(claim.reason)
    const factKey = deriveFactKey(claim.claim)

    const evidenceIds = [...new Set([...proposal.evidenceIds, ...payload.evidenceIds])]
    for (const evidenceId of evidenceIds) {
      const evidence = await tables.evidence.get(evidenceId)
      if (!evidence || evidence.scopeKey !== scopeKey) return fail(LEDGER_FAILURE_REASONS.evidenceMissing, { evidenceId })
    }
    let effectiveEvidenceIds = evidenceIds
    if (!effectiveEvidenceIds.length) {
      // A missing source may never be one-click promoted (G-A11); AI-origin
      // proposals must carry evidence. Only an explicit author manual
      // assertion can ground an otherwise sourceless claim.
      if (proposal.origin !== 'author' || !payload.manualAssertion) return fail(LEDGER_FAILURE_REASONS.evidenceMissing)
      const assertion = {
        id: ledgerId('ev'),
        scopeKey,
        scope,
        sourceKind: 'manual-assertion',
        sourceId: `author:${String(payload.actorRef || 'unknown')}`,
        sourceRevision: '',
        quote: claim.claim.object,
        contentHash: payloadHash({ quote: claim.claim.object }),
        recordedAt: Date.now(),
        tombstoneAt: null
      }
      await tables.evidence.add(assertion)
      effectiveEvidenceIds = [assertion.id]
    }

    const fingerprint = claimFingerprint(scopeKey, claim.claim)
    const marks = await tables.rejections.where('[scopeKey+fingerprint]').equals([scopeKey, fingerprint]).toArray()
    const primaryEvidence = await tables.evidence.get(effectiveEvidenceIds[0])
    const sourceRevision = primaryEvidence?.sourceRevision || ''
    const activeRejection = marks.find(mark => !mark.reopenedAt && (mark.sourceRevision || '') === sourceRevision)
    if (activeRejection) return fail(LEDGER_FAILURE_REASONS.rejectionActive, { rejectionMarkId: activeRejection.id })

    const intervalInput = payload.storyInterval !== null ? payload.storyInterval : proposal.storyInterval
    const interval = normalizeStoryIntervalInput(intervalInput)
    if (!interval.ok) return fail(interval.reason)

    const head = currentHeadOf(await tables.versions.where('[scopeKey+factKey]').equals([scopeKey, factKey]).toArray())
    if (payload.expectedHead !== null && payload.expectedHead !== (head?.id || null)) {
      return fail(LEDGER_FAILURE_REASONS.headConflict, { expectedHead: payload.expectedHead, actualHead: head?.id || null })
    }

    const now = Date.now()
    if (head) await tables.versions.update(head.id, invalidation(now, seq))
    const version = {
      id: ledgerId('fv'),
      schemaVersion: 2,
      factKey,
      scopeKey,
      scope,
      ...claim.claim,
      evidenceIds: effectiveEvidenceIds,
      validInterval: interval.interval,
      recordedAt: now,
      recordedSeq: seq,
      supersedes: head?.id || null,
      authority: 'author-confirmed',
      origin: proposal.origin,
      legacyRefs: proposal.baseRevision ? { legacyCandidateId: proposal.baseRevision } : null
    }
    await tables.versions.add(version)
    await tables.proposals.update(proposal.id, { status: 'adopted', adoptedVersionId: version.id })
    return {
      operation: 'adopt-proposal',
      actorRef: payload.actorRef,
      reason: payload.reason,
      beforeIds: head ? [head.id] : [],
      afterIds: [version.id],
      result: { factVersionId: version.id, factKey, proposalId: proposal.id }
    }
  })
}

export async function correctFact(db, input) {
  const payload = {
    scope: input?.scope, factKey: input?.factKey, object: input?.object,
    storyInterval: input?.storyInterval ?? null, evidenceIds: input?.evidenceIds ?? [],
    expectedHead: input?.expectedHead ?? null, actorRef: input?.actorRef ?? '', reason: input?.reason ?? ''
  }
  return runCommand(db, payload.scope, input?.commandId, payload, async ({ tables, seq, scopeKey }) => {
    const head = currentHeadOf(await tables.versions.where('[scopeKey+factKey]').equals([scopeKey, payload.factKey]).toArray())
    if (!head) return fail(LEDGER_FAILURE_REASONS.factNotFound, { factKey: payload.factKey })
    if (payload.expectedHead !== null && payload.expectedHead !== head.id) {
      return fail(LEDGER_FAILURE_REASONS.headConflict, { expectedHead: payload.expectedHead, actualHead: head.id })
    }
    // Subject and predicate are the fact identity and never change in a
    // correction; only the object, interval and evidence move forward.
    const claim = normalizeClaim({ subjectKey: head.subjectKey, subjectLabel: head.subjectLabel, predicate: head.predicate, object: payload.object })
    if (!claim.ok) return fail(claim.reason)
    const interval = normalizeStoryIntervalInput(payload.storyInterval !== null ? payload.storyInterval : (head.validInterval || { precision: 'unknown' }))
    if (!interval.ok) return fail(interval.reason)
    for (const evidenceId of payload.evidenceIds) {
      const evidence = await tables.evidence.get(evidenceId)
      if (!evidence || evidence.scopeKey !== scopeKey) return fail(LEDGER_FAILURE_REASONS.evidenceMissing, { evidenceId })
    }
    const evidenceIds = [...new Set([...(head.evidenceIds || []), ...payload.evidenceIds])]
    // A correction must change something; identical content is refused
    // instead of manufacturing a meaningless revision.
    if (claim.claim.object === head.object
      && sameInterval(interval.interval, head.validInterval)
      && evidenceIds.length === (head.evidenceIds || []).length) {
      return fail(LEDGER_FAILURE_REASONS.noChange)
    }
    const now = Date.now()
    await tables.versions.update(head.id, invalidation(now, seq))
    const version = {
      id: ledgerId('fv'),
      schemaVersion: 2,
      factKey: head.factKey,
      scopeKey,
      scope: payload.scope,
      subjectKey: head.subjectKey,
      subjectLabel: head.subjectLabel,
      predicate: head.predicate,
      object: claim.claim.object,
      evidenceIds,
      validInterval: interval.interval,
      recordedAt: now,
      recordedSeq: seq,
      supersedes: head.id,
      authority: 'author-confirmed',
      origin: head.origin,
      legacyRefs: null
    }
    await tables.versions.add(version)
    return {
      operation: 'correct-fact',
      actorRef: payload.actorRef,
      reason: payload.reason,
      beforeIds: [head.id],
      afterIds: [version.id],
      result: { factVersionId: version.id, factKey: head.factKey, supersededId: head.id }
    }
  })
}

export async function retractFact(db, input) {
  const payload = { scope: input?.scope, factKey: input?.factKey, expectedHead: input?.expectedHead ?? null, actorRef: input?.actorRef ?? '', reason: input?.reason ?? '' }
  return runCommand(db, payload.scope, input?.commandId, payload, async ({ tables, seq, scopeKey }) => {
    const head = currentHeadOf(await tables.versions.where('[scopeKey+factKey]').equals([scopeKey, payload.factKey]).toArray())
    if (!head) return fail(LEDGER_FAILURE_REASONS.factNotFound, { factKey: payload.factKey })
    if (payload.expectedHead !== null && payload.expectedHead !== head.id) {
      return fail(LEDGER_FAILURE_REASONS.headConflict, { expectedHead: payload.expectedHead, actualHead: head.id })
    }
    await tables.versions.update(head.id, invalidation(Date.now(), seq))
    return {
      operation: 'retract-fact',
      actorRef: payload.actorRef,
      reason: payload.reason,
      beforeIds: [head.id],
      afterIds: [],
      result: { factKey: payload.factKey, retractedId: head.id }
    }
  })
}

// Rejection is scoped by claim fingerprint AND the source revision under
// review: the same claim re-appearing from a changed source is reviewable
// again, while an identical re-proposal stays suppressed until explicitly
// reopened (A09).
export async function rejectProposal(db, input) {
  const payload = { scope: input?.scope, proposalId: input?.proposalId, actorRef: input?.actorRef ?? '', reason: input?.reason ?? '' }
  return runCommand(db, payload.scope, input?.commandId, payload, async ({ tables, scopeKey, decisionId }) => {
    const proposal = await tables.proposals.get(input?.proposalId)
    if (!proposal || proposal.scopeKey !== scopeKey) return fail(LEDGER_FAILURE_REASONS.proposalNotFound)
    if (proposal.status !== 'pending') return fail(LEDGER_FAILURE_REASONS.proposalNotPending, { status: proposal.status })
    await tables.proposals.update(proposal.id, { status: 'dismissed' })
    const mark = {
      id: ledgerId('rej'),
      scopeKey,
      fingerprint: proposal.fingerprint,
      sourceRevision: proposal.sourceRevision || '',
      rejectedAt: Date.now(),
      decisionId,
      reopenedAt: null
    }
    await tables.rejections.add(mark)
    return {
      operation: 'reject-proposal',
      actorRef: payload.actorRef,
      reason: payload.reason,
      beforeIds: [proposal.id],
      afterIds: [mark.id],
      result: { proposalId: proposal.id, rejectionMarkId: mark.id }
    }
  })
}

export async function reopenRejection(db, input) {
  const payload = { scope: input?.scope, rejectionMarkId: input?.rejectionMarkId, actorRef: input?.actorRef ?? '', reason: input?.reason ?? '' }
  return runCommand(db, payload.scope, input?.commandId, payload, async ({ tables, scopeKey }) => {
    const mark = await tables.rejections.get(input?.rejectionMarkId)
    if (!mark || mark.scopeKey !== scopeKey) return fail(LEDGER_FAILURE_REASONS.rejectionNotFound)
    await tables.rejections.update(mark.id, { reopenedAt: Date.now() })
    return {
      operation: 'reopen-rejection',
      actorRef: payload.actorRef,
      reason: payload.reason,
      beforeIds: [mark.id],
      afterIds: [mark.id],
      result: { rejectionMarkId: mark.id }
    }
  })
}

// A19 seam: durable, idempotent storage for committed turn receipts. The
// ledger never drives game state — this is the persistent audit side of the
// seam O wires to the turn coordinator. payloadHash is recomputed here so the
// same receiptId arriving with different content is detectable.
export async function appendCommittedTurnReceipt(db, { scope, receipt } = {}) {
  const resolved = resolveScope(scope)
  if (!resolved.ok) return fail(resolved.reason)
  const r = receipt || {}
  if (typeof r.receiptId !== 'string' || !r.receiptId.trim()
    || typeof r.turnId !== 'string' || !r.turnId
    || typeof r.commandId !== 'string' || !r.commandId
    || !Number.isFinite(Number(r.committedAt))) return fail('receipt-invalid')
  const payload = {
    receiptId: r.receiptId.trim(),
    commandId: r.commandId,
    turnId: r.turnId,
    parentTurnId: r.parentTurnId ?? null,
    branchId: r.branchId ?? null,
    rulesVersion: r.rulesVersion ?? null,
    resolutionRef: r.resolutionRef ?? null,
    stateDeltaRefs: Array.isArray(r.stateDeltaRefs) ? r.stateDeltaRefs : [],
    evidenceRefs: Array.isArray(r.evidenceRefs) ? r.evidenceRefs : [],
    committedAt: Number(r.committedAt),
    scopeKey: resolved.scopeKey
  }
  const hash = payloadHash(payload)
  try {
    return await db.transaction('rw', [...TX_TABLES, 'turnReceipts'], async () => {
      const table = db.table('turnReceipts')
      const existing = await table.get(payload.receiptId)
      if (existing) {
        if (existing.payloadHash !== hash) return fail('receipt-conflict', { receiptId: payload.receiptId })
        return { ok: true, replay: true, receipt: existing }
      }
      const seq = await allocateSeq(db.table('ledgerMeta'), resolved.scopeKey)
      const row = { ...payload, scope: resolved.scope, payloadHash: hash, archivedAt: Date.now(), archivedSeq: seq }
      await table.add(row)
      return { ok: true, replay: false, receipt: row }
    })
  } catch (error) {
    return fail(LEDGER_FAILURE_REASONS.dbUnavailable, { detail: error?.message || String(error) })
  }
}

// ---- read helpers (review UI / projection feed on these) ----

export async function listProposals(db, { scope, status = 'pending' } = {}) {
  const resolved = resolveScope(scope)
  if (!resolved.ok) return []
  return db.table('factProposals').where('[scopeKey+status]').equals([resolved.scopeKey, status]).toArray()
}

export async function listFactVersions(db, { scope, factKey } = {}) {
  const resolved = resolveScope(scope)
  if (!resolved.ok) return []
  if (factKey) return db.table('factVersions').where('[scopeKey+factKey]').equals([resolved.scopeKey, factKey]).toArray()
  return db.table('factVersions').where('scopeKey').equals(resolved.scopeKey).toArray()
}

export async function listDecisions(db, { scope, limit = 100 } = {}) {
  const resolved = resolveScope(scope)
  if (!resolved.ok) return []
  const all = await db.table('factDecisions').where('scopeKey').equals(resolved.scopeKey).toArray()
  return all.sort((a, b) => b.recordedSeq - a.recordedSeq).slice(0, Math.max(1, limit))
}

// AX15: index-ranged paged decisions with a bounded chunk walk and reported
// scan cost — the review UI must not require a whole-log materialization.
export async function listDecisionsPaged(db, { scope, cursor = null, limit = 50 } = {}) {
  const startedAt = Date.now()
  const resolved = resolveScope(scope)
  if (!resolved.ok) return { ok: false, reason: 'scope-invalid', items: [], nextCursor: null, scanned: 0, elapsedMs: 0 }
  const page = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)))
  const scopeKey = resolved.scopeKey
  try {
    let upperSeq = null
    if (cursor) {
      let parsed
      try { parsed = JSON.parse(atob(String(cursor))) } catch { return { ok: false, reason: 'cursor-invalid', items: [], nextCursor: null, scanned: 0, elapsedMs: 0 } }
      if (parsed?.v !== 1 || !Number.isFinite(parsed.lastSeq)) return { ok: false, reason: 'cursor-invalid', items: [], nextCursor: null, scanned: 0, elapsedMs: 0 }
      upperSeq = parsed.lastSeq
    }
    // recordedSeq can never exceed the scope counter; start the walk there.
    const seqRecord = await db.table('ledgerMeta').get(`seq:${scopeKey}`)
    const liveSeq = Number.isFinite(seqRecord?.seq) ? seqRecord.seq : 0
    if (upperSeq === null) upperSeq = liveSeq
    const CHUNK = 500
    const table = db.table('factDecisions')
    const items = []
    let scanned = 0
    let high = upperSeq
    let exhausted = false
    while (items.length <= page && !exhausted && scanned < 5000) {
      const low = Math.max(0, high - CHUNK + 1)
      const chunk = await table
        .where('[scopeKey+recordedSeq]')
        .between([scopeKey, low], [scopeKey, high], true, true)
        .reverse()
        .toArray()
      scanned += chunk.length
      for (const row of chunk) {
        if (items.length > page) break
        items.push(row)
      }
      if (low === 0) exhausted = true
      else high = low - 1
    }
    const hasMore = items.length > page
    const pageItems = items.slice(0, page)
    const nextCursor = hasMore && pageItems.length
      ? btoa(JSON.stringify({ v: 1, lastSeq: pageItems[pageItems.length - 1].recordedSeq }))
      : null
    return { ok: true, items, nextCursor, scanned, elapsedMs: Date.now() - startedAt }
  } catch (error) {
    return { ok: false, reason: 'db-unavailable', retryable: true, detail: error?.message || String(error), items: [], nextCursor: null, scanned: 0, elapsedMs: 0 }
  }
}

export async function getFactHead(db, { scope, factKey }) {
  const resolved = resolveScope(scope)
  if (!resolved.ok) return null
  const versions = await db.table('factVersions').where('[scopeKey+factKey]').equals([resolved.scopeKey, factKey]).toArray()
  return currentHeadOf(versions)
}

export async function listRejectionMarks(db, { scope } = {}) {
  const resolved = resolveScope(scope)
  if (!resolved.ok) return []
  return db.table('rejectionMarks').where('scopeKey').equals(resolved.scopeKey).toArray()
}

export async function listTurnReceipts(db, { scope, limit = 200 } = {}) {
  const resolved = resolveScope(scope)
  if (!resolved.ok) return []
  const all = await db.table('turnReceipts').where('scopeKey').equals(resolved.scopeKey).toArray()
  return all.sort((a, b) => b.archivedSeq - a.archivedSeq).slice(0, Math.max(1, limit))
}
