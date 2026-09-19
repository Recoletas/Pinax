import {
  normalizeScopeRef,
  encodeScopeKey,
  payloadHash,
  ledgerId
} from './ledgerContract'
import { currentHeadOf } from './recordAxis'
import { openLedgerDb, closeLedgerDb, LEDGER_TX_TABLES as TX_TABLES } from './ledgerDb'

// M08/M09（nightly-20260918）：角色获知事件与读模型。
//
// - 身份冻结：每条事件同时冻结 actor + book/session/branch（scopeKey）与
//   获知时刻（故事轴 storyAt + 记录轴 recordedSeq）——回放"他当时知道什么"
//   走双轴，与事实账本同一套语义。
// - 作者知道 / 角色听说 / 客观成立 三者分开：本模块只输出"角色凭获知事件
//   知道的事实"；账本里其余事实一律不出现在角色视界（作者全量事实永不
//   借道本读模型外泄）。
// - append-only：获知（kind 'known'）与信念状态转移（kind 'belief'，M09：
//   confirmed/disputed/disproved/forgotten）都是新事件，绝不原地改。
// - 有界读取：按 [scopeKey+actorKey+recordedSeq] 分带降序走查，扫描上限
//   与 queryFacts 同款，触顶诚实报告 incomplete。
// - 无任何授权获知事件时返回 mode 'public-fallback'：消费方继续走既有
//   场景公共投影，不得把降级伪装成角色视角。

const KNOWLEDGE_SCAN_MAX = 20000
const CHUNK = 500

export const KNOWLEDGE_CHANNELS = Object.freeze(['witnessed', 'heard', 'inferred', 'author-granted'])
export const KNOWLEDGE_BELIEFS = Object.freeze(['active', 'confirmed', 'disputed', 'disproved', 'forgotten'])
export const KNOWLEDGE_EVENT_KINDS = Object.freeze(['known', 'belief'])

const fail = (reason, extra = {}) => ({ ok: false, reason, retryable: reason === 'db-unavailable', ...extra })

function resolveScope(input) {
  const normalized = normalizeScopeRef(input)
  if (!normalized.ok) return normalized
  return { ok: true, scope: normalized.scope, scopeKey: encodeScopeKey(normalized.scope) }
}

// 记录一条获知/信念事件（runCommand 同款命令合同：显式 commandId 幂等，
// 同键不同载荷拒绝，失败无半提交）。
export async function recordKnowledgeEvent(db, input) {
  const payload = {
    scope: input?.scope, actorKey: input?.actorKey, actorLabel: input?.actorLabel ?? '',
    factVersionId: input?.factVersionId, kind: input?.kind || 'known',
    channel: input?.channel || 'witnessed', belief: input?.belief || null,
    sourceRef: input?.sourceRef ?? null, storyAt: input?.storyAt ?? null,
    actorRef: input?.actorRef ?? '', reason: input?.reason ?? ''
  }
  return runKnowledgeCommand(db, payload.scope, input?.commandId, payload, async ({ tables, seq, scopeKey, scope }) => {
    const actorKey = String(payload.actorKey || '').trim()
    if (!actorKey) return fail('actor-key-required')
    const factVersion = await tables.versions.get(payload.factVersionId)
    if (!factVersion || factVersion.scopeKey !== scopeKey) {
      // 跨书/跨分支的"知道"在这里拒绝：知识不能跨作用域注入。
      return fail('fact-version-scope-mismatch', { factVersionId: payload.factVersionId })
    }
    if (!KNOWLEDGE_EVENT_KINDS.includes(payload.kind)) return fail('knowledge-kind-invalid')
    if (!KNOWLEDGE_CHANNELS.includes(payload.channel)) return fail('knowledge-channel-invalid')
    if (payload.kind === 'belief' && !KNOWLEDGE_BELIEFS.includes(payload.belief)) {
      return fail('knowledge-belief-invalid')
    }
    if (payload.kind === 'known' && payload.belief !== null) return fail('knowledge-belief-invalid')
    if (payload.kind === 'belief' && payload.belief === 'active') {
      // 'active' 由 known 事件隐含，不作为独立转移。
      return fail('knowledge-belief-invalid')
    }
    const event = {
      id: ledgerId('kn'),
      schemaVersion: 1,
      scopeKey,
      scope,
      actorKey: actorKey.slice(0, 120),
      actorLabel: String(payload.actorLabel || '').slice(0, 120),
      factVersionId: factVersion.id,
      factKey: factVersion.factKey,
      kind: payload.kind,
      channel: payload.channel,
      belief: payload.kind === 'belief' ? payload.belief : null,
      sourceRef: payload.sourceRef ? String(payload.sourceRef).slice(0, 200) : null,
      storyAt: payload.storyAt && Number.isFinite(Number(payload.storyAt)) ? Number(payload.storyAt) : null,
      recordedAt: Date.now(),
      recordedSeq: seq
    }
    await tables.knowledge.add(event)
    return {
      operation: 'record-knowledge-event',
      actorRef: payload.actorRef,
      reason: payload.reason,
      beforeIds: [],
      afterIds: [event.id],
      result: { knowledgeEventId: event.id, actorKey: event.actorKey, factVersionId: event.factVersionId }
    }
  })
}

async function runKnowledgeCommand(db, scopeInput, commandId, payloadForHash, executor) {
  const scope = resolveScope(scopeInput)
  if (!scope.ok) return fail(scope.reason)
  const trimmed = typeof commandId === 'string' ? commandId.trim() : ''
  if (!trimmed) return fail('command-id-required')
  try {
    return await db.transaction('rw', TX_TABLES, async () => {
      const tables = {
        versions: db.table('factVersions'),
        knowledge: db.table('knowledgeEvents'),
        decisions: db.table('factDecisions'),
        meta: db.table('ledgerMeta')
      }
      const prior = await tables.decisions.where('commandId').equals(trimmed).first()
      const hash = payloadHash(payloadForHash)
      if (prior) {
        if (prior.payloadHash !== hash) return fail('command-payload-conflict', { commandId: trimmed, priorDecisionId: prior.id })
        return { ok: true, replay: true, decision: prior, result: prior.result }
      }
      const decisionId = ledgerId('dec')
      const seq = await allocateSeq(tables.meta, scope.scopeKey)
      const outcome = await executor({ tables, seq, scopeKey: scope.scopeKey, scope: scope.scope, decisionId })
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
    return fail('db-unavailable', { detail: error?.message || String(error) })
  }
}

async function allocateSeq(meta, scopeKey) {
  const record = await meta.get(`seq:${scopeKey}`)
  const seq = (Number.isFinite(record?.seq) ? record.seq : 0) + 1
  await meta.put({ id: `seq:${scopeKey}`, seq })
  return seq
}

// 有界降序走查某角色在作用域内的获知事件（G1 同款带状扫描）。
async function walkKnowledgeEvents(db, scopeKey, actorKey, upperBound) {
  const table = db.table('knowledgeEvents')
  const events = []
  let scanned = 0
  let high = Number.isSafeInteger(upperBound) ? Math.max(0, Math.floor(upperBound)) : 0
  let exhausted = false
  while (!exhausted && scanned < KNOWLEDGE_SCAN_MAX) {
    const low = Math.max(0, high - CHUNK + 1)
    const chunk = await table
      .where('[scopeKey+actorKey+recordedSeq]')
      .between([scopeKey, actorKey, low], [scopeKey, actorKey, high], true, true)
      .toArray()
    scanned += chunk.length
    events.push(...chunk)
    if (low <= 1) exhausted = true
    else high = low - 1
  }
  events.sort((a, b) => b.recordedSeq - a.recordedSeq)
  return { events, scanned, exhausted: exhausted || scanned >= KNOWLEDGE_SCAN_MAX }
}

/**
 * 角色知识读模型（M08/M09 主入口）。
 *
 * 入参：scope（book/session/branch）、actorKeys（1-8 个角色）、可选
 * storyAt/recordedAsOf（{seq}|{recordedAt}？v1 只收 {seq}——recordedAt 解析
 * 属事实账本查询职责，这里直接收序号）。
 * 出参：每个角色的 facts（版本、主张、获知来源/时刻、信念状态）与
 * excluded（作者知道但角色不知道 / 已被新版本取代 / 遗忘 / 反证）计数，
 * 以及 mode：'character'（有授权获知事件）| 'public-fallback'（无授权事件，
 * 消费方应降级到既有公共投影）。
 */
export async function readCharacterKnowledge(db, input = {}) {
  const startedAt = Date.now()
  const scope = resolveScope(input.scope)
  if (!scope.ok) return fail(scope.reason)
  const actorKeys = [...new Set((Array.isArray(input.actorKeys) ? input.actorKeys : [input.actorKeys])
    .map(key => String(key || '').trim()).filter(Boolean))].slice(0, 8)
  if (!actorKeys.length) return fail('actor-key-required')
  const axisCutoff = Number.isFinite(Number(input.recordedAsOf?.seq)) ? Number(input.recordedAsOf.seq) : null
  const storyAt = input.storyAt ?? null

  try {
    const tables = {
      knowledge: db.table('knowledgeEvents'),
      versions: db.table('factVersions'),
      meta: db.table('ledgerMeta')
    }
    const seqRecord = await tables.meta.get(`seq:${scope.scopeKey}`)
    const liveSeq = Number.isFinite(seqRecord?.seq) ? seqRecord.seq : 0
    const snapshotSeq = axisCutoff !== null ? Math.min(axisCutoff, liveSeq) : liveSeq

    const actors = {}
    let scanned = 0
    for (const actorKey of actorKeys) {
      const walk = await walkKnowledgeEvents(db, scope.scopeKey, actorKey, snapshotSeq)
      scanned += walk.scanned
      // 每个事实版本：known 事件给获知来源/时刻，其后最新 belief 事件给状态。
      // 按时间升序归位（walk 返回新→旧，reversed 后旧→新，最新信念最后落地）。
      const byFact = new Map()
      for (const event of [...walk.events].reverse()) {
        if (event.recordedSeq > snapshotSeq) continue
        const current = byFact.get(event.factVersionId)
        if (event.kind === 'known') {
          if (current) continue
          byFact.set(event.factVersionId, {
            factVersionId: event.factVersionId,
            factKey: event.factKey,
            knownVia: event.channel,
            knownAtStory: event.storyAt,
            knownAtSeq: event.recordedSeq,
            belief: 'active',
            beliefAtSeq: event.recordedSeq
          })
        } else if (current) {
          // 信念转移只作用于已知事实；belief 事件的语义 = 从该时刻起的态度
          current.belief = event.belief
          current.beliefAtSeq = event.recordedSeq
        } else {
          // 转移先于获知事件到达（乱序导入）——按 recordedSeq 归位：
          // 仅当转移发生在已知时刻之后才有意义；这里没有 known，丢弃并计数。
          byFact.set(`__orphan_${event.id}`, { orphan: true, belief: event.belief })
        }
      }
      const facts = []
      const excluded = {}
      const tally = reason => { excluded[reason] = (excluded[reason] || 0) + 1 }
      const factIds = [...byFact.values()].filter(entry => !entry.orphan).map(entry => entry.factVersionId)
      const versionRows = factIds.length ? (await tables.versions.bulkGet(factIds)).filter(Boolean) : []
      const versionById = new Map(versionRows.map(row => [row.id, row]))
      // 该事实键的当前 head（客观成立）——注意按账本全链计算，不是只看
      // 角色知道的子集，否则更正链上的新旧关系会被漏判
      const headsByFactKey = new Map()
      for (const factKey of [...new Set(versionRows.map(row => row.factKey))]) {
        const chain = await tables.versions.where('[scopeKey+factKey]').equals([scope.scopeKey, factKey]).toArray()
        const head = currentHeadOf(chain)
        if (head) headsByFactKey.set(factKey, head.id)
      }
      for (const entry of byFact.values()) {
        if (entry.orphan) { tally('belief-without-known'); continue }
        // 故事时刻过滤：获知晚于该时刻的事实不在视界；获知时刻未知时
        // 不冒充"当时已知"（未知日期不是开放终点），typed 排除。
        if (storyAt !== null) {
          if (entry.knownAtStory === null) { tally('known-at-unknown-story-time'); continue }
          if (entry.knownAtStory > storyAt) { tally('known-later'); continue }
        }
        const version = versionById.get(entry.factVersionId)
        if (!version) { tally('fact-version-missing'); continue }
        if (entry.belief === 'forgotten') { tally('forgotten'); continue }
        if (entry.belief === 'disproved') { tally('disproved'); continue }
        // 角色视界由获知事件驱动：作者侧更正/取代只标记 stale（作者知道 ≠
        // 角色听说 ≠ 客观成立——角色当时抱着的就是这个旧版本）。
        const headId = headsByFactKey.get(version.factKey)
        entry.supersededForCharacter = Boolean(headId && headId !== version.id)
        facts.push({
          factVersionId: version.id,
          factKey: version.factKey,
          claim: {
            subjectKey: version.subjectKey,
            subjectLabel: version.subjectLabel,
            predicate: version.predicate,
            object: version.object
          },
          knownVia: entry.knownVia,
          knownAtStory: entry.knownAtStory,
          knownAtSeq: entry.knownAtSeq,
          belief: entry.belief,
          beliefAtSeq: entry.beliefAtSeq,
          supersededForCharacter: Boolean(entry.supersededForCharacter),
          sourceRefs: [`fact:${version.id}`]
        })
      }
      actors[actorKey] = {
        mode: facts.length || Object.keys(excluded).length ? 'character' : 'public-fallback',
        facts,
        excluded
      }
    }
    return {
      ok: true,
      scope: scope.scope,
      scopeKey: scope.scopeKey,
      snapshotVersion: snapshotSeq,
      mode: Object.values(actors).some(actor => actor.mode === 'character') ? 'character' : 'public-fallback',
      actors,
      scanned,
      elapsedMs: Date.now() - startedAt
    }
  } catch (error) {
    return fail('db-unavailable', { detail: error?.message || String(error) })
  }
}

// M10：同伴上下文的知识 provider 工厂。每次调用独立打开/关闭账本连接
// （请求作用域，不泄漏句柄）；账本不可用返回 typed 失败，由消费方降级。
// scope 与 actorKeys 在这里闭包定死——调用方无法在请求中途改写视界。
export async function createCharacterKnowledgeProvider({ scope, actorKeys } = {}) {
  const resolved = resolveScope(scope)
  if (!resolved.ok) throw Object.assign(new Error('knowledge provider scope invalid'), { code: resolved.reason })
  const actors = [...new Set((Array.isArray(actorKeys) ? actorKeys : [actorKeys])
    .map(key => String(key || '').trim()).filter(Boolean))].slice(0, 8)
  if (!actors.length) throw Object.assign(new Error('knowledge provider needs actorKeys'), { code: 'actor-key-required' })
  return async function readForCharacter() {
    const opened = await openLedgerDb({ openTimeoutMs: 1500 })
    if (!opened.ok) return { ok: false, reason: opened.reason }
    try {
      return await readCharacterKnowledge(opened.db, { scope: resolved.scope, actorKeys: actors })
    } finally {
      await closeLedgerDb(opened.db)
    }
  }
}
