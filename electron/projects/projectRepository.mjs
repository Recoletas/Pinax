import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import {
  DESKTOP_DATABASE_SCHEMA_VERSION,
  DESKTOP_ERROR_CODES,
  validateWriteTextInput
} from '../../shared/desktopProjectContract.js'
import {
  atomicReplaceText,
  hashText,
  listProjectTextPaths,
  readProjectText,
  removeOwnedTransactionTemps,
  stageProjectText
} from './projectFiles.mjs'
import { checkDatabaseIntegrity } from './projectDatabase.mjs'
import { readProjectManifest } from './projectManifest.mjs'

export function createProjectRepository(project, deps = {}) {
  assertActiveProject(project)
  const now = deps.now || (() => new Date())
  const uuid = deps.uuid || randomUUID
  const fileAdapter = deps.fileAdapter || {}

  return Object.freeze({
    async readText(itemId) {
      const item = requireItem(project.database, itemId)
      const file = await readProjectText(project.root, item.relativePath)
      return textDto(item, file)
    },

    async listText(kind, containedDirectory = '', view = 'full') {
      if (!['full', 'summary'].includes(view)) throw desktopError(DESKTOP_ERROR_CODES.INVALID_INPUT, 'Unknown desktop text list view')
      const paths = await listProjectTextPaths(project.root, kind, containedDirectory)
      if (!paths.length) return []
      const items = new Map(project.database.getItemsByPaths(paths).map(item => [item.relativePath, item]))
      const results = []
      for (const relativePath of paths) {
        const item = items.get(relativePath)
        if (!item) continue
        if (view === 'summary') {
          results.push({ itemId: item.id, relativePath, revision: item.revision, recordedByteLength: item.byteLength })
        } else {
          results.push(textDto(item, await readProjectText(project.root, relativePath)))
        }
      }
      return results
    },

    async writeText(input, expectedContentHash) {
      requireWritable(project)
      const validation = validateWriteTextInput(input)
      if (!validation.valid) throw desktopError(validation.error.code, validation.error.message)
      const value = validation.value
      let item = requireItem(project.database, value.itemId)
      if (item.relativePath !== value.relativePath) {
        throw desktopError(DESKTOP_ERROR_CODES.INVALID_INPUT, 'Item and relative path do not match')
      }
      if (item.revision !== value.expectedRevision) {
        throw desktopError(DESKTOP_ERROR_CODES.STALE_REVISION, 'Project item revision changed', { itemId: item.id })
      }

      const existing = await readProjectText(project.root, item.relativePath)
      if (expectedContentHash !== undefined) {
        if (typeof expectedContentHash !== 'string' || existing.contentHash !== expectedContentHash) {
          throw desktopError(DESKTOP_ERROR_CODES.STALE_REVISION, '章节文件在打开后被其他程序修改', { itemId: item.id })
        }
        if (existing.contentHash !== item.contentHash) {
          const pending = project.database.listRecoverableFileTransactions().some(row => row.itemId === item.id)
          if (pending) throw desktopError(DESKTOP_ERROR_CODES.STALE_REVISION, '请先恢复未完成的文件事务', { itemId: item.id })
          item = project.database.updateItemRevision({
            id: item.id, expectedRevision: item.revision, contentHash: existing.contentHash,
            byteLength: existing.byteLength, updatedAt: now().toISOString()
          })
        }
        if (existing.text === value.text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')) return textDto(item, existing)
      }
      const transactionId = uuid()
      const stagedPath = `.pinax/tmp/${transactionId}.txt`
      const normalized = value.text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
      const timestamp = now().toISOString()
      const transaction = {
        id: transactionId,
        itemId: item.id,
        relativePath: item.relativePath,
        stagedPath,
        expectedRevision: item.revision,
        resultingHash: hashText(normalized),
        resultingBytes: Buffer.byteLength(normalized, 'utf8'),
        state: 'staged',
        createdAt: timestamp,
        committedAt: null
      }
      if (existing.contentHash !== item.contentHash || existing.byteLength !== item.byteLength) {
        throw desktopError(DESKTOP_ERROR_CODES.STALE_REVISION, 'Project text was edited outside Pinax', { itemId: item.id })
      }
      project.database.reserveFileTransaction(transaction)
      try {
        await stageProjectText(project.root, stagedPath, normalized)
        await atomicReplaceText(project.root, {
          stagedPath, relativePath: item.relativePath, transactionId, expectedHash: item.contentHash, expectedBytes: item.byteLength
        }, fileAdapter)
      } catch (error) {
        // A failed stage/rename can be retried immediately if the old file is
        // intact. Otherwise leave the journal for explicit recovery on open.
        const current = await readProjectText(project.root, item.relativePath).catch(() => null)
        if (error.code === DESKTOP_ERROR_CODES.STALE_REVISION || current?.contentHash === item.contentHash) {
          await removeOwnedTransactionTemps(project.root, transaction)
          project.database.updateFileTransactionState(transactionId, 'aborted', now().toISOString())
        }
        throw error
      }
      // A crash after rename and before the SQLite commit is already handled
      // by staged recovery using the target hash. Old file_committed rows
      // continue to recover through the same code path.
      const updated = project.database.completeFileTransaction({
        id: item.id,
        expectedRevision: item.revision,
        contentHash: transaction.resultingHash,
        byteLength: transaction.resultingBytes,
        updatedAt: timestamp,
        transactionId,
        committedAt: timestamp
      })
      return {
        itemId: updated.id,
        relativePath: updated.relativePath,
        revision: updated.revision,
        contentHash: updated.contentHash,
        byteLength: updated.byteLength
      }
    },

    async recoverInterruptedWrites() {
      requireWritable(project)
      const recovered = []
      const repairCases = []
      for (const transaction of project.database.listRecoverableFileTransactions()) {
        const item = project.database.getItemById(transaction.itemId)
        if (!item || item.relativePath !== transaction.relativePath || item.revision !== transaction.expectedRevision) {
          repairCases.push({ transactionId: transaction.id, reason: 'metadata-mismatch' })
          continue
        }
        let target
        try {
          target = await readProjectText(project.root, transaction.relativePath)
        } catch {
          repairCases.push({ transactionId: transaction.id, reason: 'target-unreadable' })
          continue
        }
        if (transaction.state === 'staged' && target.contentHash !== transaction.resultingHash) {
          if (target.contentHash !== item.contentHash) {
            repairCases.push({ transactionId: transaction.id, reason: 'target-hash-mismatch' })
            continue
          }
          await removeOwnedTransactionTemps(project.root, transaction)
          project.database.updateFileTransactionState(transaction.id, 'aborted', now().toISOString())
          recovered.push(transaction.id)
          continue
        }
        if (target.contentHash !== transaction.resultingHash || target.byteLength !== transaction.resultingBytes) {
          repairCases.push({ transactionId: transaction.id, reason: 'target-hash-mismatch' })
          continue
        }
        project.database.completeFileTransaction({
          id: item.id,
          expectedRevision: item.revision,
          contentHash: transaction.resultingHash,
          byteLength: transaction.resultingBytes,
          updatedAt: now().toISOString(),
          transactionId: transaction.id,
          committedAt: now().toISOString()
        })
        await removeOwnedTransactionTemps(project.root, transaction)
        recovered.push(transaction.id)
      }
      return { recovered, repairCases }
    },

    async checkIntegrity() {
      let manifest
      try {
        const value = await readProjectManifest(project.root)
        manifest = { valid: true, value }
      } catch (error) {
        manifest = { valid: false, code: error.code || DESKTOP_ERROR_CODES.INTEGRITY_FAILED }
      }
      const sqlite = checkDatabaseIntegrity(project.database)
      const missingItemFiles = []
      const hashMismatches = []
      for (const item of project.database.listTextItems()) {
        try {
          const file = await readProjectText(project.root, item.relativePath)
          if (file.contentHash !== item.contentHash || file.byteLength !== item.byteLength) {
            hashMismatches.push({ itemId: item.id, relativePath: item.relativePath })
          }
        } catch {
          missingItemFiles.push({ itemId: item.id, relativePath: item.relativePath })
        }
      }
      return {
        manifest,
        schema: {
          valid: project.database.schemaVersion >= 1 && project.database.schemaVersion <= DESKTOP_DATABASE_SCHEMA_VERSION,
          needsMigration: project.database.schemaVersion < DESKTOP_DATABASE_SCHEMA_VERSION,
          version: project.database.schemaVersion
        },
        sqlite,
        recoverableTransactions: project.database.listRecoverableFileTransactions(),
        missingItemFiles,
        hashMismatches
      }
    }
  })
}

function textDto(item, file) {
  return {
    itemId: item.id,
    relativePath: item.relativePath,
    revision: item.revision,
    text: file.text,
    contentHash: file.contentHash,
    byteLength: file.byteLength
  }
}

function assertActiveProject(project) {
  if (!project?.root || !project?.database || !['read-write', 'read-only'].includes(project.mode)) {
    throw desktopError(DESKTOP_ERROR_CODES.PROJECT_NOT_OPEN, 'Desktop project is not open')
  }
}

function requireWritable(project) {
  if (project.mode !== 'read-write') {
    throw desktopError(DESKTOP_ERROR_CODES.PROJECT_LOCKED, 'Desktop project is read-only')
  }
}

function requireItem(database, itemId) {
  const item = database.getItemById(String(itemId || ''))
  if (!item?.relativePath) throw desktopError(DESKTOP_ERROR_CODES.INVALID_INPUT, 'Project text item does not exist')
  return item
}

function desktopError(code, message, details) {
  return Object.assign(new Error(message), { code, details })
}
