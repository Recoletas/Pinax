import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { DESKTOP_DATABASE_SCHEMA_VERSION, DESKTOP_ERROR_CODES } from '../../shared/desktopProjectContract.js'

const defaultMigrations = [{
  version: 1,
  sql: readMigrationSql(new URL('./migrations/001-foundation.sql', import.meta.url))
}, {
  version: 2,
  sql: readMigrationSql(new URL('./migrations/002-legacy-import.sql', import.meta.url))
}]

export function readMigrationSql(url) {
  if (url.protocol !== 'data:') return readFileSync(url, 'utf8')
  const separator = url.href.indexOf(',')
  const metadata = url.href.slice(0, separator)
  const payload = url.href.slice(separator + 1)
  return metadata.endsWith(';base64')
    ? Buffer.from(payload, 'base64').toString('utf8')
    : decodeURIComponent(payload)
}

export function openProjectDatabase(path, options = {}) {
  const raw = new Database(path)
  try {
    raw.pragma('journal_mode = WAL')
    raw.pragma('foreign_keys = ON')
    raw.pragma('synchronous = FULL')
    raw.pragma('busy_timeout = 5000')
    const migrations = options.migrations || defaultMigrations
    runMigrations(raw, migrations, options.now)
    const schemaVersion = currentSchemaVersion(raw)
    if (schemaVersion > DESKTOP_DATABASE_SCHEMA_VERSION) {
      throw desktopError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Project database is newer than this application', { schemaVersion })
    }
    return createDatabaseOwner(raw, schemaVersion)
  } catch (error) {
    raw.close()
    throw error
  }
}

export function runMigrations(raw, migrations, now = () => new Date()) {
  const current = currentSchemaVersion(raw)
  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (migration.version <= current) continue
    raw.transaction(() => {
      raw.exec(migration.sql)
      raw.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(migration.version, now().toISOString())
    })()
  }
}

export function checkDatabaseIntegrity(owner) {
  const raw = getRaw(owner)
  return {
    quickCheck: raw.pragma('quick_check', { simple: true }),
    integrityCheck: raw.pragma('integrity_check', { simple: true })
  }
}

export function checkpointDatabase(owner) {
  const result = getRaw(owner).pragma('wal_checkpoint(TRUNCATE)')[0]
  return { busy: result.busy, log: result.log, checkpointed: result.checkpointed }
}

export function closeProjectDatabase(owner) {
  const raw = getRaw(owner)
  if (raw.open) raw.close()
}

function createDatabaseOwner(raw, schemaVersion) {
  const statements = {
    getItemById: raw.prepare('SELECT * FROM project_items WHERE id = ?'),
    getItemByPath: raw.prepare('SELECT * FROM project_items WHERE relative_path = ?'),
    listAllItems: raw.prepare('SELECT * FROM project_items ORDER BY id'),
    listTextItems: raw.prepare("SELECT * FROM project_items WHERE relative_path IS NOT NULL ORDER BY relative_path"),
    insertItem: raw.prepare(`INSERT INTO project_items
      (id, kind, relative_path, parent_id, sort_order, revision, content_hash, byte_length, created_at, updated_at)
      VALUES (@id, @kind, @relativePath, @parentId, @sortOrder, @revision, @contentHash, @byteLength, @createdAt, @updatedAt)`),
    updateItem: raw.prepare(`UPDATE project_items SET
      revision = revision + 1, content_hash = @contentHash, byte_length = @byteLength, updated_at = @updatedAt
      WHERE id = @id AND revision = @expectedRevision`),
    insertTransaction: raw.prepare(`INSERT INTO file_transactions
      (id, item_id, relative_path, staged_path, expected_revision, resulting_hash, resulting_bytes, state, created_at, committed_at)
      VALUES (@id, @itemId, @relativePath, @stagedPath, @expectedRevision, @resultingHash, @resultingBytes, @state, @createdAt, @committedAt)`),
    updateTransaction: raw.prepare('UPDATE file_transactions SET state = ?, committed_at = ? WHERE id = ?'),
    recoverable: raw.prepare("SELECT * FROM file_transactions WHERE state IN ('staged', 'file_committed') ORDER BY created_at, id"),
    getLegacyImport: raw.prepare('SELECT * FROM legacy_imports WHERE bundle_id = ?'),
    beginLegacyImport: raw.prepare(`INSERT INTO legacy_imports
      (bundle_id, source_schema_version, state, source_count, imported_count, created_at, completed_at)
      VALUES (@bundleId, @sourceSchemaVersion, @state, @sourceCount, @importedCount, @createdAt, @completedAt)`),
    insertLegacyImportRecord: raw.prepare(`INSERT INTO legacy_import_records
      (bundle_id, source_record_id, source_type, source_sha256, status, target_kind, target_id)
      VALUES (@bundleId, @sourceRecordId, @sourceType, @sourceSha256, @status, @targetKind, @targetId)`),
    listLegacyImportRecords: raw.prepare(`SELECT * FROM legacy_import_records
      WHERE bundle_id = ? ORDER BY source_record_id`),
    insertLegacyImportTarget: raw.prepare(`INSERT INTO legacy_import_targets
      (bundle_id, source_record_id, source_nested_id, target_kind, target_id)
      VALUES (@bundleId, @sourceRecordId, @sourceNestedId, @targetKind, @targetId)`),
    listLegacyImportTargets: raw.prepare(`SELECT * FROM legacy_import_targets
      WHERE bundle_id = ? ORDER BY source_record_id, source_nested_id, target_kind, target_id`),
    insertLegacyRecord: raw.prepare(`INSERT INTO legacy_records
      (id, record_type, source_record_id, json_payload, content_hash, created_at)
      VALUES (@id, @recordType, @sourceRecordId, @jsonPayload, @contentHash, @createdAt)`),
    getLegacyRecord: raw.prepare('SELECT * FROM legacy_records WHERE id = ?'),
    listLegacyRecords: raw.prepare('SELECT * FROM legacy_records ORDER BY id'),
    completeLegacyImport: raw.prepare(`UPDATE legacy_imports SET
      state = 'complete', imported_count = ?, completed_at = ? WHERE bundle_id = ? AND state = 'staging'`)
  }
  const owner = {
    schemaVersion,
    getPragmas: () => ({
      journalMode: raw.pragma('journal_mode', { simple: true }),
      foreignKeys: raw.pragma('foreign_keys', { simple: true }),
      synchronous: raw.pragma('synchronous', { simple: true }),
      busyTimeout: raw.pragma('busy_timeout', { simple: true })
    }),
    getItemById: (id) => mapItem(statements.getItemById.get(id)),
    getItemByPath: (path) => mapItem(statements.getItemByPath.get(path)),
    listAllItems: () => statements.listAllItems.all().map(mapItem),
    listTextItems: () => statements.listTextItems.all().map(mapItem),
    insertItem: (item) => statements.insertItem.run(item),
    updateItemRevision(input) {
      const result = statements.updateItem.run(input)
      if (result.changes !== 1) throw desktopError(DESKTOP_ERROR_CODES.STALE_REVISION, 'Project item revision changed', { itemId: input.id })
      return owner.getItemById(input.id)
    },
    insertFileTransaction: (transaction) => statements.insertTransaction.run(transaction),
    updateFileTransactionState: (id, state, committedAt = null) => statements.updateTransaction.run(state, committedAt, id),
    listRecoverableFileTransactions: () => statements.recoverable.all().map(mapTransaction),
    getLegacyImport: (bundleId) => mapLegacyImport(statements.getLegacyImport.get(bundleId)),
    beginLegacyImport: (input) => statements.beginLegacyImport.run(input),
    insertLegacyImportRecord: (input) => statements.insertLegacyImportRecord.run(input),
    listLegacyImportRecords: (bundleId) => statements.listLegacyImportRecords.all(bundleId).map(mapLegacyImportRecord),
    insertLegacyImportTarget: (input) => statements.insertLegacyImportTarget.run(input),
    listLegacyImportTargets: (bundleId) => statements.listLegacyImportTargets.all(bundleId).map(mapLegacyImportTarget),
    insertLegacyRecord: (input) => statements.insertLegacyRecord.run(input),
    getLegacyRecord: (id) => mapLegacyRecord(statements.getLegacyRecord.get(id)),
    listLegacyRecords: () => statements.listLegacyRecords.all().map(mapLegacyRecord),
    completeLegacyImport(bundleId, importedCount, completedAt) {
      const result = statements.completeLegacyImport.run(importedCount, completedAt, bundleId)
      if (result.changes !== 1) throw desktopError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Legacy import journal could not be completed', { bundleId })
      return owner.getLegacyImport(bundleId)
    },
    withTransaction: (callback) => raw.transaction(callback)(),
    completeFileTransaction(input) {
      return raw.transaction(() => {
        const item = owner.updateItemRevision(input)
        statements.updateTransaction.run('complete', input.committedAt, input.transactionId)
        return item
      })()
    }
  }
  Object.defineProperty(owner, '__raw', { value: raw })
  return Object.freeze(owner)
}

function currentSchemaVersion(raw) {
  const exists = raw.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get()
  if (!exists) return 0
  return raw.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get().version
}

function mapItem(row) {
  if (!row) return null
  return {
    id: row.id,
    kind: row.kind,
    relativePath: row.relative_path,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    revision: row.revision,
    contentHash: row.content_hash,
    byteLength: row.byte_length,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapTransaction(row) {
  return {
    id: row.id,
    itemId: row.item_id,
    relativePath: row.relative_path,
    stagedPath: row.staged_path,
    expectedRevision: row.expected_revision,
    resultingHash: row.resulting_hash,
    resultingBytes: row.resulting_bytes,
    state: row.state,
    createdAt: row.created_at,
    committedAt: row.committed_at
  }
}

function mapLegacyImport(row) {
  if (!row) return null
  return {
    bundleId: row.bundle_id,
    sourceSchemaVersion: row.source_schema_version,
    state: row.state,
    sourceCount: row.source_count,
    importedCount: row.imported_count,
    createdAt: row.created_at,
    completedAt: row.completed_at
  }
}

function mapLegacyImportRecord(row) {
  return {
    bundleId: row.bundle_id,
    sourceRecordId: row.source_record_id,
    sourceType: row.source_type,
    sourceSha256: row.source_sha256,
    status: row.status,
    targetKind: row.target_kind,
    targetId: row.target_id
  }
}

function mapLegacyRecord(row) {
  if (!row) return null
  return {
    id: row.id,
    recordType: row.record_type,
    sourceRecordId: row.source_record_id,
    jsonPayload: row.json_payload,
    contentHash: row.content_hash,
    createdAt: row.created_at
  }
}

function mapLegacyImportTarget(row) {
  return {
    bundleId: row.bundle_id,
    sourceRecordId: row.source_record_id,
    sourceNestedId: row.source_nested_id,
    targetKind: row.target_kind,
    targetId: row.target_id
  }
}

function getRaw(owner) {
  if (!owner?.__raw) throw desktopError(DESKTOP_ERROR_CODES.PROJECT_NOT_OPEN, 'Project database is not open')
  return owner.__raw
}

function desktopError(code, message, details) {
  return Object.assign(new Error(message), { code, details })
}
