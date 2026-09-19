import Dexie from 'dexie'
import { MEMORY_HISTORY_DB } from '../memoryHistoryStore'
import { LEDGER_SCHEMA_VERSION } from './ledgerContract'

// The fact ledger lives in the SAME controlled Dexie database as the v1
// revision history: one browser database, cross-table transactions stay real.
// v1 `revisions` keeps its exact original declaration; upgrade only adds
// tables and never rewrites or deletes v1 rows.
export const LEDGER_V1_TABLES = { revisions: 'id, candidateId' }

export const LEDGER_V2_TABLES = {
  revisions: 'id, candidateId',
  evidenceSnapshots: 'id, scopeKey, sourceId, [scopeKey+sourceId]',
  factProposals: 'id, scopeKey, status, fingerprint, [scopeKey+status]',
  factVersions: 'id, scopeKey, factKey, [scopeKey+factKey], [scopeKey+subjectKey], [scopeKey+recordedSeq]',
  factDecisions: 'id, scopeKey, commandId, [scopeKey+recordedSeq]',
  rejectionMarks: 'id, scopeKey, fingerprint, [scopeKey+fingerprint]',
  ledgerMeta: 'id',
  turnReceipts: 'receiptId, scopeKey, commandId, turnId, [scopeKey+archivedSeq]'
}

// G1: index-only upgrade. The extra compound index powers bounded newest-
// first per-subject walks; row shapes, LEDGER_SCHEMA_VERSION and backup
// packages are unchanged, so old exports import unchanged and no data is
// rewritten (Dexie only reindexes). An OLDER app build opening this database
// fails open typed (VersionError) instead of mis-reading it.
export const LEDGER_V3_TABLES = {
  ...LEDGER_V2_TABLES,
  factVersions: 'id, scopeKey, factKey, [scopeKey+factKey], [scopeKey+subjectKey], [scopeKey+recordedSeq], [scopeKey+subjectKey+recordedSeq]'
}

// M08: knowledge events (角色获知) as an APPEND-ONLY table — 获知与信念状态
// 转移（M09）都是事件，绝不原地改。加表不加列：旧备份包不受影响（账本域
// 导出表清单在 ledgerBackup 的 LEDGER_TABLE_KEYS 中另行登记）。
export const LEDGER_V4_TABLES = {
  ...LEDGER_V3_TABLES,
  knowledgeEvents: 'id, scopeKey, actorKey, factVersionId, recordedSeq, [scopeKey+actorKey], [scopeKey+actorKey+recordedSeq], [scopeKey+factVersionId]'
}

export const LEDGER_TX_TABLES = [
  'evidenceSnapshots',
  'factProposals',
  'factVersions',
  'factDecisions',
  'rejectionMarks',
  'ledgerMeta',
  'knowledgeEvents'
]

const SCHEMA_META_ID = 'schema'

export function createLedgerDb(name = MEMORY_HISTORY_DB) {
  if (!globalThis.indexedDB) return { ok: false, reason: 'indexeddb-unavailable', retryable: false }
  const db = new Dexie(name)
  db.version(1).stores(LEDGER_V1_TABLES)
  db.version(2).stores(LEDGER_V2_TABLES)
  db.version(3).stores(LEDGER_V3_TABLES)
  db.version(4).stores(LEDGER_V4_TABLES)
  return { ok: true, db }
}

function classifyOpenError(error, blocked) {
  if (blocked) return { reason: 'upgrade-blocked', retryable: true, detail: '另一标签页正在使用旧版数据库；关闭旧标签后重试，数据未被改动' }
  const name = error?.name || ''
  if (name === 'VersionError') return { reason: 'schema-unsupported', retryable: false, detail: '数据库版本高于当前应用支持范围' }
  if (name === 'QuotaExceededError') return { reason: 'quota-exceeded', retryable: true, detail: '存储空间不足' }
  return { reason: 'db-unavailable', retryable: true, detail: error?.message || String(error) }
}

// Typed open: business callers receive {ok, reason, retryable}, and a failed
// open never deletes or recreates the author's database.
export async function openLedgerDb(options = {}) {
  return openLedgerDbNamed(MEMORY_HISTORY_DB, options)
}

// Named variant used by isolated-restore paths (and the restore smoke) to
// open a SEPARATE database; the author's live database is untouched.
//
// Lifecycle contract (AX04):
// - `onBlocked` fires IMMEDIATELY when this open is blocked by another tab
//   holding an older schema version — the caller must not wait for the open
//   promise to learn about it.
// - `openTimeoutMs` bounds a blocked wait; expiry closes this connection and
//   returns typed `upgrade-blocked` (retryable). The database is never
//   deleted or recreated here.
// - `onVersionChange` fires when ANOTHER connection upgrades the schema and
//   this connection must yield; the connection closes so the upgrade can
//   proceed (IndexedDB versionchange semantics).
export async function openLedgerDbNamed(name, { onBlocked, onVersionChange, openTimeoutMs } = {}) {
  const created = createLedgerDb(name)
  if (!created.ok) return created
  const { db } = created
  let blocked = false
  let blockedNotified = false
  let blockedTimer = null
  const notifyBlocked = () => {
    blocked = true
    if (!blockedNotified) {
      blockedNotified = true
      try { onBlocked?.() } catch { /* caller callback errors never break the open */ }
    }
    if (Number.isFinite(openTimeoutMs) && openTimeoutMs > 0 && !blockedTimer) {
      blockedTimer = setTimeout(() => {
        try { db.close() } catch { /* close during blocked wait is best-effort */ }
      }, openTimeoutMs)
    }
  }
  db.on('blocked', notifyBlocked)
  if (onVersionChange) db.on('versionchange', () => { try { onVersionChange() } catch { /* notify only */ } return true })
  try {
    await db.open()
  } catch (error) {
    if (blockedTimer) clearTimeout(blockedTimer)
    const classified = classifyOpenError(error, blocked)
    try { db.close() } catch { /* close of a failed open is best-effort */ }
    return { ok: false, ...classified }
  }
  if (blockedTimer) clearTimeout(blockedTimer)
  const seeded = await ensureSchemaMeta(db)
  if (!seeded.ok) {
    // A ledger whose own metadata cannot be initialized must not run with a
    // half-known schema: close and report typed, data untouched.
    try { db.close() } catch { /* best-effort close */ }
    return { ok: false, reason: seeded.reason, retryable: seeded.retryable, detail: seeded.detail }
  }
  return { ok: true, db }
}

// Idempotent schema metadata seed. Typed failure (AX04): quota/unavailable
// surfaces to the opener instead of silently running without a schema row.
export async function ensureSchemaMeta(db) {
  try {
    const meta = db.table('ledgerMeta')
    const existing = await meta.get(SCHEMA_META_ID)
    if (existing?.schemaVersion === LEDGER_SCHEMA_VERSION) return { ok: true, meta: existing }
    const seeded = {
      id: SCHEMA_META_ID,
      schemaVersion: LEDGER_SCHEMA_VERSION,
      // The v1 history table predates the ledger; the ledger starts empty and
      // never claims to have reconstructed pre-ledger facts.
      createdAt: existing?.createdAt || Date.now(),
      v1HistoryBaselinePreserved: true
    }
    await meta.put(seeded)
    return { ok: true, meta: seeded }
  } catch (error) {
    const name = error?.name || ''
    if (name === 'QuotaExceededError') {
      return { ok: false, reason: 'quota-exceeded', retryable: true, detail: '存储空间不足，无法初始化账本元数据' }
    }
    return { ok: false, reason: 'ledger-meta-unavailable', retryable: true, detail: error?.message || String(error) }
  }
}

export async function readLedgerHealth(db) {
  const meta = db.table('ledgerMeta')
  const schema = await meta.get(SCHEMA_META_ID)
  const [revisions, versions, proposals, decisions, receipts] = await Promise.all([
    db.table('revisions').count(),
    db.table('factVersions').count(),
    db.table('factProposals').count(),
    db.table('factDecisions').count(),
    db.table('turnReceipts').count()
  ])
  return {
    schemaVersion: schema?.schemaVersion || null,
    v1RevisionCount: revisions,
    factVersionCount: versions,
    proposalCount: proposals,
    decisionCount: decisions,
    turnReceiptCount: receipts
  }
}

export async function closeLedgerDb(db) {
  try { db.close() } catch { /* idempotent close */ }
}
