import Dexie from 'dexie'
import { materializeLegacyWorldClaims } from '@pinax/core/memory/ledger/worldClaims'
import { MEMORY_HISTORY_DB } from '@pinax/core/memory/ledgerSchema'
import { LEDGER_SCHEMA_VERSION } from './ledgerContract'

// The fact ledger lives in the SAME controlled Dexie database as the v1
// revision history: one browser database, cross-table transactions stay real.
// v1 `revisions` keeps its exact original declaration; upgrade only adds
// tables and never rewrites or deletes v1 rows.
import { LEDGER_V1_TABLES, LEDGER_V2_TABLES, LEDGER_V3_TABLES, LEDGER_V4_TABLES, LEDGER_TX_TABLES, WORLD_MODEL_TABLES, KNOWLEDGE_CORRECTION_TABLES, EVENT_CONTEXT_TABLES, MANUSCRIPT_EDITION_TABLES, KNOWLEDGE_SOURCE_TABLES, STORY_CALENDAR_TABLES, WORLD_FORK_TABLES } from '@pinax/core/memory/ledgerSchema'
export { LEDGER_V1_TABLES, LEDGER_V2_TABLES, LEDGER_V3_TABLES, LEDGER_V4_TABLES, LEDGER_TX_TABLES }
const SCHEMA_META_ID = 'schema'
export const HISTORY_ACTIVITY_INDEX = '[after.scope+after.scopeId+recordedAt]'

export function createLedgerDb(name = MEMORY_HISTORY_DB) {
  if (!globalThis.indexedDB) return { ok: false, reason: 'indexeddb-unavailable', retryable: false }
  const db = new Dexie(name)
  db.version(1).stores(LEDGER_V1_TABLES)
  db.version(2).stores(LEDGER_V2_TABLES)
  db.version(3).stores(LEDGER_V3_TABLES)
  db.version(4).stores(LEDGER_V4_TABLES)
  db.version(5).stores({ revisions: `id, candidateId, ${HISTORY_ACTIVITY_INDEX}` })
  db.version(6).stores(WORLD_MODEL_TABLES).upgrade(tx => materializeLegacyWorldClaims(tx))
  db.version(7).stores(KNOWLEDGE_CORRECTION_TABLES)
  db.version(8).stores(EVENT_CONTEXT_TABLES)
  db.version(9).stores(MANUSCRIPT_EDITION_TABLES)
  db.version(10).stores(KNOWLEDGE_SOURCE_TABLES)
  db.version(11).stores(STORY_CALENDAR_TABLES)
  db.version(12).stores(WORLD_FORK_TABLES)
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

export async function withLedgerDb(action, options) {
  const opened = await openLedgerDb(options)
  if (!opened.ok) throw new Error(opened.detail || opened.reason)
  try { return await action(opened.db) }
  finally { await closeLedgerDb(opened.db) }
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
    // Several pages may open an old or empty store together. Only seed (or
    // upgrade) the version that is still present when our transaction starts.
    return await db.transaction('rw', meta, async () => {
      const current = await meta.get(SCHEMA_META_ID)
      if (current?.schemaVersion === LEDGER_SCHEMA_VERSION) return { ok: true, meta: current }
      const version = current?.schemaVersion
      if (version != null && ![1, '1', String(LEDGER_SCHEMA_VERSION)].includes(version)) {
        return { ok: false, reason: 'schema-unsupported', retryable: false, detail: '账本数据版本不受当前应用支持' }
      }
      const seeded = {
        ...current, id: SCHEMA_META_ID, schemaVersion: LEDGER_SCHEMA_VERSION,
        createdAt: current?.createdAt ?? Date.now(), v1HistoryBaselinePreserved: true
      }
      await meta.put(seeded)
      return { ok: true, meta: seeded }
    })
  } catch (error) {
    const name = error?.name || ''
    if (name === 'QuotaExceededError') {
      return { ok: false, reason: 'quota-exceeded', retryable: true, detail: '存储空间不足，无法初始化账本元数据' }
    }
    return { ok: false, reason: 'ledger-meta-unavailable', retryable: true, detail: error?.message || String(error) }
  }
}

export async function readLedgerHealth(db) {
  const names = ['ledgerMeta', 'revisions', 'factVersions', 'factProposals', 'factDecisions', 'turnReceipts']
  return db.transaction('r', names, async () => {
    const [schema, revisions, versions, proposals, decisions, receipts] = await Promise.all([
      db.ledgerMeta.get(SCHEMA_META_ID), db.revisions.count(), db.factVersions.count(),
      db.factProposals.count(), db.factDecisions.count(), db.turnReceipts.count()
    ])
    return {
      schemaVersion: schema?.schemaVersion || null, v1RevisionCount: revisions,
      factVersionCount: versions, proposalCount: proposals, decisionCount: decisions, turnReceiptCount: receipts
    }
  })
}

export async function closeLedgerDb(db) {
  try { db.close() } catch { /* idempotent close */ }
}
