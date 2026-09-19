import { encodeScopeKey, normalizeScopeRef, LEDGER_SCHEMA_VERSION } from './ledgerContract'

// A16 — export/validate/import/compensate interface for the ledger domain,
// integrated into workspaceBackupBundle next to the existing
// memory-history domain (same patterns: count manifests, idempotent import,
// same-ID-different-content domain rejection, compensation restricted to IDs
// inserted by this restore). This module is the
// complete domain behavior.

export const LEDGER_DOMAIN_FILES = {
  evidenceSnapshots: 'ledger/evidence-snapshots.json',
  factProposals: 'ledger/fact-proposals.json',
  factVersions: 'ledger/fact-versions.json',
  factDecisions: 'ledger/fact-decisions.json',
  rejectionMarks: 'ledger/rejection-marks.json',
  ledgerMeta: 'ledger/meta.json',
  turnReceipts: 'ledger/turn-receipts.json',
  knowledgeEvents: 'ledger/knowledge-events.json'
}

const LEDGER_TABLE_KEYS = Object.keys(LEDGER_DOMAIN_FILES)

export async function collectLedgerDomain(db) {
  const tables = {}
  const counts = {}
  await db.transaction('r', LEDGER_TABLE_KEYS, async () => {
    for (const key of LEDGER_TABLE_KEYS) {
      const rows = await db.table(key).toArray()
      tables[key] = rows
      counts[key] = rows.length
    }
  })
  return { schemaVersion: LEDGER_SCHEMA_VERSION, counts, tables }
}

// turnReceipts is keyed by receiptId (the receipt's own identity); every
// other ledger table uses id.
const LEDGER_TABLE_PK = Object.fromEntries(LEDGER_TABLE_KEYS.map(key => [key, key === 'turnReceipts' ? 'receiptId' : 'id']))

function validateRows(key, rows) {
  if (!Array.isArray(rows)) throw new Error(`事实账本 ${key} 必须是数组`)
  const pk = LEDGER_TABLE_PK[key]
  const ids = new Set()
  for (const row of rows) {
    if (!row || typeof row !== 'object' || typeof row[pk] !== 'string' || !row[pk]) {
      throw new Error(`事实账本 ${key} 存在缺少 ${pk} 的记录`)
    }
    if (ids.has(row[pk])) throw new Error(`事实账本 ${key} 存在重复 ${pk}：${row[pk]}`)
    ids.add(row[pk])
    if (key !== 'ledgerMeta') {
      const [domain, bookId, worldbookId, sessionId, branchId] = String(row.scopeKey || '').split('\u001f')
      // v2 rejection marks store the canonical key only, not a duplicate scope.
      const normalized = normalizeScopeRef(row.scope || { domain, bookId, worldbookId, sessionId, branchId })
      if (!normalized.ok || encodeScopeKey(normalized.scope) !== row.scopeKey) throw new Error(`事实账本 ${key} 作用域不一致`)
    }
    if (key === 'factVersions' && row.schemaVersion !== 2) throw new Error('事实版本 schema 不受支持')
    if (['factDecisions', 'factVersions', 'knowledgeEvents'].includes(key) && (!Number.isSafeInteger(row.recordedSeq) || row.recordedSeq < 1)) throw new Error('事实或决定缺少有效记录序号')
    if (key === 'factVersions' && (typeof row.object !== 'string' || typeof row.subjectKey !== 'string' || typeof row.predicate !== 'string')) throw new Error('事实主张字段无效')
  }
}

// Validates the exported value against the manifest counts; used by
// inspectWorkspaceBackup before any restore attempt. Throws typed Errors —
// the caller turns them into a failed domain inspection, never a partial import.
export function validateLedgerDomain(value, manifest) {
  if (!value || typeof value !== 'object') throw new Error('事实账本域缺失或格式损坏')
  if (value.schemaVersion !== LEDGER_SCHEMA_VERSION) throw new Error(`事实账本 schema 版本不受支持：${value.schemaVersion}`)
  if (!value.tables || typeof value.tables !== 'object') throw new Error('事实账本域缺少表数据')
  let total = 0
  for (const key of LEDGER_TABLE_KEYS) {
    // knowledgeEvents 后于既有包加入：旧包没有该表时按空表处理（只增不改的
    // 兼容策略）；其余表缺失仍然是损坏。
    if (key === 'knowledgeEvents' && value.tables[key] === undefined) continue
    validateRows(key, value.tables[key])
    const expected = manifest?.counts?.[key]
    if (key === 'knowledgeEvents' && !Number.isSafeInteger(expected)) {
      total += value.tables[key].length
      continue
    }
    if (!Number.isSafeInteger(expected) || expected !== value.tables[key].length || value.counts?.[key] !== expected) {
      throw new Error(`事实账本 ${key} 数量校验失败：包清单 ${expected}，文件 ${value.tables[key].length}`)
    }
    total += value.tables[key].length
  }
  const evidence = new Map(value.tables.evidenceSnapshots.map(row => [row.id, row]))
  const versions = new Map(value.tables.factVersions.map(row => [row.id, row]))
  const meta = new Map(value.tables.ledgerMeta.map(row => [row.id, row]))
  for (const row of [...value.tables.factProposals, ...value.tables.factVersions]) {
    if (!Array.isArray(row.evidenceIds) || row.evidenceIds.some(id => evidence.get(id)?.scopeKey !== row.scopeKey)) throw new Error('事实账本证据引用缺失或跨域')
    if (row.supersedes) {
      const prior = versions.get(row.supersedes)
      if (!prior || prior.scopeKey !== row.scopeKey || prior.factKey !== row.factKey || prior.recordedSeq >= row.recordedSeq) throw new Error('事实账本更正链无效')
    }
  }
  for (const row of [...value.tables.factVersions, ...value.tables.factDecisions, ...value.tables.turnReceipts, ...(value.tables.knowledgeEvents || [])]) {
    const seq = row.recordedSeq ?? row.archivedSeq
    const counter = meta.get(`seq:${row.scopeKey}`)?.seq
    if (!Number.isSafeInteger(seq) || seq < 1 || !Number.isSafeInteger(counter) || counter < seq) throw new Error('事实账本序号超出作用域计数器')
  }
  return { total, counts: Object.fromEntries(LEDGER_TABLE_KEYS.map(key => [key, value.tables[key]?.length || 0])) }
}

// Idempotent restore. Same id + same content → skipped; same id + different
// content → the whole domain refuses (like v1 history) so a restore can never
// silently overwrite ledger facts. Returns per-table inserted/skipped ids for
// compensation.
export async function importLedgerDomain(db, value) {
  const written = {}
  const skipped = {}
  try {
    validateLedgerDomain(value, { counts: value?.counts })
    await db.transaction('rw', LEDGER_TABLE_KEYS, async () => {
      for (const key of LEDGER_TABLE_KEYS) {
        const table = db.table(key)
        const pk = LEDGER_TABLE_PK[key]
        written[key] = []
        skipped[key] = []
        for (const row of (value.tables[key] || [])) {
          const rowKey = row[pk]
          // The 'schema' meta row is environment metadata regenerated at open;
          // the seq:* rows are DATA (record-axis ordering depends on them) and
          // must restore like any other row.
          if (key === 'ledgerMeta' && rowKey === 'schema') {
            const localSchema = await table.get(rowKey)
            if (!localSchema) { await table.add(structuredClone(row)); written[key].push(rowKey) }
            else skipped[key].push(rowKey)
            continue
          }
          const existing = await table.get(rowKey)
          if (existing) {
            if (JSON.stringify(existing) !== JSON.stringify(row)) {
              throw new Error(`事实账本 ${key} 同一 id 内容不一致：${rowKey}`)
            }
            skipped[key].push(rowKey)
            continue
          }
          await table.add(structuredClone(row))
          written[key].push(rowKey)
        }
      }
    })
  } catch (error) {
    // Nothing partial survives a refused domain import.
    return { ok: false, reason: error?.message || String(error), written: null, skipped: null }
  }
  return { ok: true, written, skipped }
}

// Compensation deletes ONLY ids inserted by this restore; existing author
// data is never cleared.
export async function rollbackImportedLedgerDomain(db, written) {
  if (!written) return
  await db.transaction('rw', LEDGER_TABLE_KEYS, async () => {
    for (const key of LEDGER_TABLE_KEYS) {
      const ids = written[key] || []
      if (ids.length) await db.table(key).bulkDelete(ids)
    }
  })
}
