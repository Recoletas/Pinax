import { normalizeScopeRef, encodeScopeKey } from './ledgerContract'
import { openLedgerDb, closeLedgerDb } from './ledgerDb'

// M06（nightly-20260918）：来源修订/删除的证据影响清单。
//
// 来源被修订或删除后，引用旧版本的证据快照不再静默算作有效证据：审计
// 给出逐条影响清单（含引用该证据的事实版本与待审提案），供事实审核入口
// 强制作者显式确认；adoptProposal 侧以 evidenceCurrentness + allowStaleEvidence
// 落地"不确认就不接受"。
//
// 解耦：本模块不知道"当前修订号"从哪来——由调用方传入 currentRevisions
//（sourceId → 当前修订）与 sourceDeleted（已删除 sourceId 列表），来源状态
// 的所有权留在来源工作区（N-A）手里。走查有界（MAX_SCAN），触顶如实报
// incomplete，不假装扫全。

const SCAN_MAX = 20000
const CHUNK = 500

const fail = (reason, extra = {}) => ({ ok: false, reason, retryable: reason === 'db-unavailable', ...extra })

// 单作用域证据走查（有界降序不需要——证据没有序号轴，按 scopeKey 索引
// 分块取全；规模上限用 MAX_SCAN 诚实截断）。
async function walkEvidence(db, scopeKey) {
  const table = db.table('evidenceSnapshots')
  const rows = []
  let scanned = 0
  let exhausted = false
  const total = await table.where('scopeKey').equals(scopeKey).count()
  if (total <= CHUNK) {
    const chunk = await table.where('scopeKey').equals(scopeKey).toArray()
    return { rows: chunk, scanned: chunk.length, exhausted: true, total }
  }
  // 大表：分页走主键（id 单调前缀 ledgerId），用 skip 翻页会有漂移风险，
  // 改走 count + 主键游标循环，仍受 MAX_SCAN 约束。
  let fetched = 0
  let lastId = ''
  while (fetched < Math.min(total, SCAN_MAX) && !exhausted) {
    const chunk = await table
      .where('scopeKey').equals(scopeKey)
      .and(row => String(row.id) > lastId)
      .limit(CHUNK)
      .toArray()
    if (!chunk.length) { exhausted = true; break }
    rows.push(...chunk)
    scanned += chunk.length
    lastId = String(chunk[chunk.length - 1].id)
    fetched += chunk.length
    if (chunk.length < CHUNK) exhausted = true
  }
  return { rows, scanned, exhausted: fetched >= Math.min(total, SCAN_MAX), total }
}

/**
 * 证据来源审计：给定当前来源修订状态，列出受影响的证据及其事实引用。
 * currentRevisions: { [sourceId]: 当前修订 }；sourceDeleted: [sourceId]。
 * 缺席的 sourceId 视为"状态未知"→ 按现时处理（来源工作区没给就不裁决）。
 */
export async function auditEvidenceCurrentness(db, { scope, currentRevisions = {}, sourceDeleted = [] } = {}) {
  const startedAt = Date.now()
  const normalized = normalizeScopeRef(scope)
  if (!normalized.ok) return fail(normalized.reason)
  const scopeKey = encodeScopeKey(normalized.scope)
  try {
    const deleted = new Set(sourceDeleted.map(id => String(id)))
    const walk = await walkEvidence(db, scopeKey)
    const versions = await db.table('factVersions').where('scopeKey').equals(scopeKey).toArray()
    const proposals = await db.table('factProposals').where('[scopeKey+status]').equals([scopeKey, 'pending']).toArray()
    const byEvidence = new Map()
    const index = (rows, key) => {
      for (const row of rows) {
        for (const evidenceId of row.evidenceIds || []) {
          if (!byEvidence.has(evidenceId)) byEvidence.set(evidenceId, { factVersionIds: [], proposalIds: [] })
          byEvidence.get(evidenceId)[key].push(row.id)
        }
      }
    }
    index(versions, 'factVersionIds')
    index(proposals, 'proposalIds')

    const items = []
    const counts = { total: walk.rows.length, current: 0, revisionChanged: 0, sourceDeleted: 0, unattributed: 0 }
    for (const evidence of walk.rows) {
      if (evidence.tombstoneAt) continue
      const isChapter = evidence.sourceKind === 'chapter-quote'
      let status = 'current'
      if (deleted.has(evidence.sourceId)) status = 'source-deleted'
      else if (isChapter) {
        const currentRevision = currentRevisions[evidence.sourceId]
        if (currentRevision !== undefined && currentRevision !== null && currentRevision !== ''
          && String(currentRevision) !== String(evidence.sourceRevision || '')) status = 'revision-changed'
      }
      if (!isChapter) counts.unattributed += 1
      if (status === 'revision-changed') counts.revisionChanged += 1
      else if (status === 'source-deleted') counts.sourceDeleted += 1
      else counts.current += 1
      if (status === 'current') continue
      const refs = byEvidence.get(evidence.id) || { factVersionIds: [], proposalIds: [] }
      items.push({
        evidenceId: evidence.id,
        sourceId: evidence.sourceId,
        sourceRevision: evidence.sourceRevision,
        status,
        currentRevision: currentRevisions[evidence.sourceId] ?? null,
        factVersionIds: refs.factVersionIds,
        proposalIds: refs.proposalIds
      })
    }
    return {
      ok: true,
      scope: normalized.scope,
      scopeKey,
      items,
      counts,
      scanned: walk.scanned,
      completeness: walk.exhausted ? 'complete' : 'incomplete-scan-limit',
      elapsedMs: Date.now() - startedAt
    }
  } catch (error) {
    return fail('db-unavailable', { detail: error?.message || String(error) })
  }
}

// 便捷封装：请求作用域连接。
export async function readEvidenceAudit(request) {
  const opened = await openLedgerDb({ openTimeoutMs: 1500 })
  if (!opened.ok) return { ok: false, reason: opened.reason }
  try {
    return await auditEvidenceCurrentness(opened.db, request)
  } finally {
    await closeLedgerDb(opened.db)
  }
}
