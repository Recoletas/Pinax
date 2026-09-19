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
  resolvePredicateTemporalKind,
  ledgerId
} from './ledgerContract'
import { currentHeadOf } from './recordAxis'
import { planSingleValueTimeline } from './temporalCoordinator'
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
    const tables = { proposals: db.table('factProposals'), evidence: db.table('evidenceSnapshots'), rejections: db.table('rejectionMarks'), versions: db.table('factVersions') }
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
    // M03：单值状态谓词在提案阶段计算时序协调计划，随提案进入真实确认
    // 入口——作者看到将收口哪些旧版本、有哪些需要人工裁决的对子，然后才
    // 决定是否接受。
    proposal.temporalPlanV1 = await buildTemporalPlan(tables, {
      scopeKey: resolved.scopeKey,
      factKey: proposal.factKey,
      claim: claim.claim,
      interval: interval.interval,
      timeline: normalizeTimelineConfig(input?.timeline)
    })
    await tables.proposals.add(proposal)
    return { ok: true, replay: false, proposal }
  } catch (error) {
    return fail(LEDGER_FAILURE_REASONS.dbUnavailable, { detail: error?.message || String(error) })
  }
}

function invalidation(now, seq) {
  return { invalidatedAt: now, invalidatedSeq: seq }
}

// 收口后继不是 succession：head 查找必须跳过它们，否则旧值的收口行会被
// 误认为当前事实。
function successionHead(versions) {
  return currentHeadOf(versions.filter(row => !row.supersedesKind))
}

// ── M03（nightly-20260918）：时序协调接线 ─────────────────────────────
// 提案创建时对单值状态谓词计算协调计划（纯算法见 temporalCoordinator），
// 计划随提案走真实确认入口；采纳在同一 Dexie 事务里原子写入故事轴收口
// （失败无半提交）。作者不点接受，任何收口都不发生。

const TEMPORAL_PLAN_LIMITS = Object.freeze({ maxCloses: 8, maxConflicts: 8 })

// era 序 + ordinal → 同 timeline 下可整体比较的瞬间；era 未配置视为未知时间。
function temporalInstant(point, timeline) {
  if (!point || typeof point.eraId !== 'string' || !point.eraId) return null
  const ordinal = Number.isFinite(Number(point.ordinal)) ? Math.floor(Number(point.ordinal)) : null
  if (ordinal === null) return null
  const order = timeline?.eras?.get(point.eraId)
  if (!Number.isFinite(order)) return null
  return order * 1e9 + ordinal
}

// 可选 timeline 配置：{ id, eras: [{ id, order }] }。
function normalizeTimelineConfig(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.eras)) return null
  const eras = new Map()
  for (const era of input.eras) {
    if (!era || typeof era.id !== 'string' || !era.id.trim()) continue
    eras.set(era.id.trim(), Number.isFinite(Number(era.order)) ? Math.floor(Number(era.order)) : 0)
  }
  return { id: typeof input.id === 'string' ? input.id.trim() : null, eras }
}

// 版本 → 协调行。open = 无终点记录（endSemantic 'open' 或无 interval）；
// exclusive end 是作者写明的终点（引擎不得改写）；unknown 是"结束了，不知
// 哪天"（0022：未知日期不是开放终点）；引擎收口过的行带 endDerived 标记，
// 之后仍可被更好的后任重算。
function temporalRowFromVersion(version, timeline) {
  const interval = version.validInterval
  const hasExplicitEnd = interval?.endSemantic === 'exclusive' && interval?.end
  return {
    id: version.id,
    objectKey: String(version.object ?? ''),
    from: temporalInstant(interval?.start, timeline),
    to: hasExplicitEnd ? temporalInstant(interval.end, timeline) : null,
    endUnknown: interval?.endSemantic === 'unknown',
    anchorAt: null,
    endDerived: interval?.endDerived === true,
    authority: version.authority === 'author-confirmed' ? 'author' : 'derived'
  }
}

function temporalRowFromClaim(claim, interval, timeline) {
  return {
    id: 'incoming',
    objectKey: String(claim.object ?? ''),
    from: temporalInstant(interval?.start, timeline),
    to: interval?.endSemantic === 'exclusive' && interval?.end ? temporalInstant(interval.end, timeline) : null,
    endUnknown: interval?.endSemantic === 'unknown',
    anchorAt: null,
    endDerived: false,
    authority: 'author'
  }
}

// 提案落库前计算协调计划：只对单值状态谓词；多值/事件由分类合同排除。
async function buildTemporalPlan(tables, { scopeKey, factKey, claim, interval, timeline }) {
  if (resolvePredicateTemporalKind(claim.predicate) !== 'single-value-state') return null
  const versions = (await tables.versions.where('[scopeKey+factKey]').equals([scopeKey, factKey]).toArray())
    .filter(row => !row.invalidatedAt)
  // M04：与 head 完全一致的主张（同宾语、同故事区间）采纳时必被 no-change
  // 拒绝——不为它生成永远不会被执行的收口计划。
  const head = successionHead(versions)
  if (head && head.object === claim.object && sameInterval(head.validInterval, interval)) return null
  const plan = planSingleValueTimeline({
    rows: versions.map(row => temporalRowFromVersion(row, timeline)),
    incoming: temporalRowFromClaim(claim, interval, timeline)
  })
  // 有界存储：超出上限的收口/冲突不静默丢弃语义——标记 truncated。
  const closes = plan.closes.slice(0, TEMPORAL_PLAN_LIMITS.maxCloses).map(close => ({
    id: close.id,
    from: close.from,
    currentEnd: close.currentEnd,
    proposedEnd: close.proposedEnd,
    reason: close.reason,
    // 采纳前防并发：计划时的区间指纹；采纳时不一致则该收口按过期跳过
    snapshotHash: (() => {
      const target = versions.find(row => row.id === close.id)
      return target ? payloadHash({ interval: target.validInterval }) : null
    })()
  }))
  const conflicts = plan.conflicts.slice(0, TEMPORAL_PLAN_LIMITS.maxConflicts)
  if (!closes.length && !conflicts.length) return null
  return {
    version: 1,
    kind: plan.kind,
    closes,
    conflicts,
    truncated: plan.closes.length > closes.length || plan.conflicts.length > conflicts.length
  }
}

// 采纳事务内应用收口：故事轴终点写到新版本的起点（exclusive），并保留
// endDerived 标记；计划时指纹不符（来源已被并发更正/作废）的收口按过期
// 跳过并如实回报，绝不猜。
// M05 写形状（对齐上游"作废+改写"而非原地改）：每个收口目标保留原行
// （原样开着，被作废——as-of 收口之前回放看到的是开放形状），另铸一行
// "收口后继"（闭区间 + endDerived 标记，supersedes 指回目标）。撤销收口
// = 作废后继、复活目标，两个方向的双轴回放都成立。
async function applyTemporalCloses(tables, { plan, newVersion, scopeKey, currentHeadId, allocateCloseSeq, now }) {
  const applied = []
  const skipped = []
  for (const close of plan?.closes || []) {
    const target = await tables.versions.get(close.id)
    if (!target || target.scopeKey !== scopeKey) {
      skipped.push({ id: close.id, reason: 'target-missing' })
      continue
    }
    // 本次采纳对 head 的 succession 作废（同事务）不阻断其收口；只有更早
    // 命令里已作废的目标才按过期跳过。
    if (target.invalidatedAt && target.id !== currentHeadId) {
      skipped.push({ id: close.id, reason: 'target-invalidated' })
      continue
    }
    if (close.snapshotHash && payloadHash({ interval: target.validInterval }) !== close.snapshotHash) {
      skipped.push({ id: close.id, reason: 'target-changed-since-plan' })
      continue
    }
    const proposed = close.proposedEnd || {}
    const endSemantic = proposed.kind === 'unknown-end' ? 'unknown' : 'exclusive'
    const end = proposed.kind === 'unknown-end'
      ? (target.validInterval?.end || null)
      : (newVersion.validInterval?.start || null)
    const closedInterval = {
      ...(target.validInterval || { timelineId: newVersion.validInterval?.timelineId || 'default' }),
      end,
      endSemantic: end ? endSemantic : 'unknown',
      endDerived: true
    }
    const closeSeq = await allocateCloseSeq()
    // 目标作废（收口 caused）；原区间不动地留在行上供 as-of 回放。
    await tables.versions.update(target.id, { invalidatedAt: now, invalidatedSeq: closeSeq })
    const closureRow = {
      id: ledgerId('fv'),
      schemaVersion: 2,
      factKey: target.factKey,
      scopeKey: target.scopeKey,
      scope: target.scope,
      subjectKey: target.subjectKey,
      subjectLabel: target.subjectLabel,
      predicate: target.predicate,
      object: target.object,
      evidenceIds: [...(target.evidenceIds || [])],
      validInterval: closedInterval,
      recordedAt: now,
      recordedSeq: closeSeq,
      supersedes: target.id,
      // head 目标的收口与 head 交接纠缠（目标作废来自 succession），撤销
      // 须经既有更正/撤回流程；只有纯时序收口（'temporal-closure'）可撤销。
      supersedesKind: target.id === currentHeadId ? 'temporal-closure-head' : 'temporal-closure',
      authority: target.authority,
      origin: target.origin,
      legacyRefs: null
    }
    await tables.versions.add(closureRow)
    applied.push({ id: closureRow.id, ofVersion: target.id, endSemantic: closedInterval.endSemantic })
  }
  return { applied, skipped }
}

// M05：撤销一次引擎收口（作者显式命令）。收口行是引擎**派生**的区间
// 断言——撤销只作废这一行，不动作者的采纳（succession）与目标行：任何
// 时点的回放都不会出现双重取值。作者若想改的是收口**点**，走对收口行的
// 既有更正流程（人工更正会去掉 endDerived 标记）。
export async function revertTemporalClosure(db, input) {
  const payload = {
    scope: input?.scope, closureVersionId: input?.closureVersionId,
    actorRef: input?.actorRef ?? '', reason: input?.reason ?? ''
  }
  return runCommand(db, payload.scope, input?.commandId, payload, async ({ tables, seq, scopeKey }) => {
    const closure = await tables.versions.get(payload.closureVersionId)
    if (!closure || closure.scopeKey !== scopeKey) return fail(LEDGER_FAILURE_REASONS.factNotFound, { closureVersionId: payload.closureVersionId })
    if (!closure.supersedesKind || !closure.supersedesKind.startsWith('temporal-closure')) {
      return fail('not-temporal-closure', { closureVersionId: closure.id })
    }
    if (closure.invalidatedAt) return fail('closure-already-reverted', { closureVersionId: closure.id })
    const now = Date.now()
    await tables.versions.update(closure.id, { invalidatedAt: now, invalidatedSeq: seq })
    return {
      operation: 'revert-temporal-closure',
      actorRef: payload.actorRef,
      reason: payload.reason,
      beforeIds: [closure.id],
      afterIds: [],
      result: { revertedClosureId: closure.id, ofVersion: closure.supersedes, factKey: closure.factKey }
    }
  })
}

// Adopt a pending proposal as a canonical fact version. Concurrent adopts of
// the same proposal resolve to one fact: the second transaction reads the
// already-adopted status and refuses (or replays under the same commandId).
export async function adoptProposal(db, input) {
  const payload = {
    scope: input?.scope, proposalId: input?.proposalId,
    object: input?.object ?? null, storyInterval: input?.storyInterval ?? null,
    evidenceIds: input?.evidenceIds ?? [], manualAssertion: Boolean(input?.manualAssertion),
    expectedHead: input?.expectedHead ?? null, actorRef: input?.actorRef ?? '', reason: input?.reason ?? '',
    // M06：调用方（事实审核入口）提供的来源现时性（evidenceId → 'current' |
    // 'revision-changed' | 'source-deleted'）。给出且存在非 current 时，必须
    // 显式 allowStaleEvidence 才能接受——旧引用不再静默当有效证据。
    evidenceCurrentness: (input?.evidenceCurrentness && typeof input.evidenceCurrentness === 'object')
      ? input.evidenceCurrentness
      : null,
    allowStaleEvidence: input?.allowStaleEvidence === true
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

    // M06：来源现时性防线——审核入口给了现时性且证据已过期/删除时，
    // 未经作者显式确认（allowStaleEvidence）拒绝接受。
    if (payload.evidenceCurrentness) {
      const stale = effectiveEvidenceIds
        .filter(id => ['revision-changed', 'source-deleted'].includes(payload.evidenceCurrentness[id]))
      if (stale.length && !payload.allowStaleEvidence) {
        return fail('evidence-source-stale', { evidenceIds: stale, statuses: stale.map(id => payload.evidenceCurrentness[id]) })
      }
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

    const head = successionHead(await tables.versions.where('[scopeKey+factKey]').equals([scopeKey, factKey]).toArray())
    if (payload.expectedHead !== null && payload.expectedHead !== (head?.id || null)) {
      return fail(LEDGER_FAILURE_REASONS.headConflict, { expectedHead: payload.expectedHead, actualHead: head?.id || null })
    }

    // M04：重复结束证据不重复生成版本。同一主张（同主语/谓词/宾语）且
    // 故事区间形状一致时，接受只会再铸一个内容相同的版本——拒绝而不是
    // 制造冗余修订；来源修订变化后提案本就会重新进入审阅（A09）。
    if (head
      && head.object === claim.claim.object
      && sameInterval(head.validInterval, interval.interval)) {
      return fail(LEDGER_FAILURE_REASONS.noChange, { headVersionId: head.id })
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
    // M03：同一事务内应用协调收口——旧版本作废（head 已在上面按记录轴
    // 处理）与故事轴区间收口、新版本写入、提案状态翻转要么全成要么全滚，
    // 失败无半提交。
    let temporalApplied = []
    let temporalSkipped = []
    if (proposal.temporalPlanV1?.version === 1) {
      const outcome = await applyTemporalCloses(tables, {
        plan: proposal.temporalPlanV1,
        newVersion: version,
        scopeKey,
        currentHeadId: head?.id || null,
        allocateCloseSeq: () => allocateSeq(tables.meta, scopeKey),
        now
      })
      temporalApplied = outcome.applied
      temporalSkipped = outcome.skipped
    }
    await tables.proposals.update(proposal.id, { status: 'adopted', adoptedVersionId: version.id })
    return {
      operation: 'adopt-proposal',
      actorRef: payload.actorRef,
      reason: payload.reason,
      beforeIds: head ? [head.id] : [],
      afterIds: [version.id, ...temporalApplied.map(entry => entry.id)],
      result: {
        factVersionId: version.id,
        factKey,
        proposalId: proposal.id,
        temporalCloses: { applied: temporalApplied, skipped: temporalSkipped },
        temporalConflicts: proposal.temporalPlanV1?.conflicts || []
      }
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
    const head = successionHead(await tables.versions.where('[scopeKey+factKey]').equals([scopeKey, payload.factKey]).toArray())
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
    const head = successionHead(await tables.versions.where('[scopeKey+factKey]').equals([scopeKey, payload.factKey]).toArray())
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
  return successionHead(versions)
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
