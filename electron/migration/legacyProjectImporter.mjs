import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { DESKTOP_ERROR_CODES } from '../../shared/desktopProjectContract.js'
import { DESKTOP_DATABASE_SCHEMA_VERSION } from '../../shared/desktopProjectContract.js'
import {
  validateLegacyImportInput,
  validateMigrationBundlePathInput
} from '../../shared/legacyMigrationContract.js'
import { checkpointDatabase, checkDatabaseIntegrity, closeProjectDatabase, openProjectDatabase } from '../projects/projectDatabase.mjs'
import { readProjectText } from '../projects/projectFiles.mjs'
import { createProject, readProjectManifest } from '../projects/projectManifest.mjs'
import { resolveProjectPath } from '../projects/projectPaths.mjs'
import { createLegacyMigrationPlan } from './legacyProjectConverter.mjs'

export async function dryRunLegacyProjectMigration(input, deps = {}) {
  const validation = validateMigrationBundlePathInput(input)
  if (!validation.valid) throw migrationError(DESKTOP_ERROR_CODES.INVALID_INPUT, validation.error.message)
  const source = await readBundle(validation.value.bundlePath, deps)
  const plan = await createLegacyMigrationPlan(source, { now: deps.now })
  return { bundleId: plan.bundle.bundleId, report: plan.report }
}

export async function importLegacyProject(input, deps = {}) {
  const validation = validateLegacyImportInput(input)
  if (!validation.valid) throw migrationError(DESKTOP_ERROR_CODES.INVALID_INPUT, validation.error.message)
  const value = validation.value
  const destinationDirectory = join(value.destinationParentDirectory, value.name)
  const source = await readBundle(value.bundlePath, { ...deps, signal: deps.signal })
  const plan = await createLegacyMigrationPlan(source, { now: deps.now })
  if (value.expectedBundleId && value.expectedBundleId !== plan.bundle.bundleId) {
    throw migrationError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Migration bundle changed after preview')
  }
  throwIfCancelled(deps.signal)

  const existing = await inspectExistingDestination(destinationDirectory, plan.bundle.bundleId)
  if (existing?.completed) {
    await validateCompletedProject(destinationDirectory, plan, value.name)
    return {
      alreadyImported: true,
      directory: destinationDirectory,
      projectId: existing.manifest.projectId,
      name: existing.manifest.name,
      bundleId: plan.bundle.bundleId,
      report: plan.report
    }
  }
  if (existing) {
    throw migrationError(DESKTOP_ERROR_CODES.IO_FAILED, 'Migration destination already exists and is not this completed import')
  }

  const unique = String((deps.uuid || randomUUID)()).replace(/[^a-zA-Z0-9_-]/gu, '-').slice(0, 80)
  const staging = `${destinationDirectory}.pinax-import-${plan.bundle.bundleId.slice(0, 8)}-${unique}`
  let database = null
  let stagingCreated = false
  try {
    await requireExistingParent(value.destinationParentDirectory)
    if (await pathExists(staging)) {
      throw migrationError(DESKTOP_ERROR_CODES.IO_FAILED, 'Owned migration staging path already exists')
    }
    await mkdir(staging)
    stagingCreated = true
    const manifest = await createProject(staging, { name: value.name }, {
      now: deps.now,
      uuid: deps.projectUuid || randomUUID
    })
    database = openProjectDatabase(join(staging, '.pinax/project.sqlite'))
    const createdAt = (deps.now || (() => new Date()))().toISOString()

    database.withTransaction(() => {
      database.beginLegacyImport({
        bundleId: plan.bundle.bundleId,
        sourceSchemaVersion: plan.bundle.sourceSchemaVersion || 3,
        state: 'staging',
        sourceCount: plan.report.total,
        importedCount: 0,
        createdAt,
        completedAt: null
      })
      for (const item of plan.projectItems) database.insertItem(databaseItem(item))
      for (const record of plan.legacyRecords) database.insertLegacyRecord(record)
      for (const record of plan.journalRecords) database.insertLegacyImportRecord(record)
      for (const mapping of plan.targetMappings) database.insertLegacyImportTarget(mapping)
    })

    for (const item of plan.textItems) {
      throwIfCancelled(deps.signal)
      const target = await resolveProjectPath(staging, item.relativePath)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, item.text, { encoding: 'utf8', flag: 'wx', signal: deps.signal })
    }
    await deps.afterTextWrites?.({ staging, plan })
    throwIfCancelled(deps.signal)
    await validateOpenProject(staging, database, plan, { requireComplete: false, expectedName: value.name })
    throwIfCancelled(deps.signal)
    const completedAt = (deps.now || (() => new Date()))().toISOString()
    database.completeLegacyImport(plan.bundle.bundleId, plan.report.total, completedAt)
    checkpointDatabase(database)
    closeProjectDatabase(database)
    database = null
    await validateCompletedProject(staging, plan, value.name)
    await deps.beforeFinalRename?.({ staging, plan })
    throwIfCancelled(deps.signal)
    if (await pathExists(destinationDirectory)) {
      throw migrationError(DESKTOP_ERROR_CODES.IO_FAILED, 'Migration destination appeared before finalization')
    }
    throwIfCancelled(deps.signal)
    await rename(staging, destinationDirectory)
    stagingCreated = false

    return {
      alreadyImported: false,
      directory: destinationDirectory,
      projectId: manifest.projectId,
      name: manifest.name,
      bundleId: plan.bundle.bundleId,
      report: plan.report
    }
  } catch (error) {
    if (database) closeProjectDatabase(database)
    if (stagingCreated) await rm(staging, { recursive: true, force: true })
    if (deps.signal?.aborted && !String(error?.code || '').startsWith('DESKTOP_')) throwCancelled()
    throw error
  }
}

async function validateOpenProject(root, database, plan, { requireComplete, expectedName }) {
  const manifest = await readProjectManifest(root)
  if (!manifest?.projectId || manifest.name !== expectedName || database.schemaVersion !== DESKTOP_DATABASE_SCHEMA_VERSION) {
    throw migrationError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Imported manifest or schema is invalid')
  }
  const sqlite = checkDatabaseIntegrity(database)
  if (sqlite.quickCheck !== 'ok' || sqlite.integrityCheck !== 'ok') {
    throw migrationError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Imported SQLite database failed integrity checks')
  }
  assertExactRows(
    database.listAllItems(),
    plan.projectItems.map(databaseItem),
    'Imported project items do not match migration plan'
  )
  const textRows = database.listTextItems()
  if (textRows.length !== plan.textItems.length) {
    throw migrationError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Imported text item count does not match migration plan')
  }
  assertExactRows(
    database.listLegacyImportRecords(plan.bundle.bundleId),
    plan.journalRecords,
    'Import journal does not match migration plan'
  )
  assertExactRows(
    database.listLegacyImportTargets(plan.bundle.bundleId),
    plan.targetMappings,
    'Import target mappings do not match migration plan'
  )
  const legacyRows = database.listLegacyRecords()
  if (legacyRows.length !== plan.legacyRecords.length) {
    throw migrationError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Imported compatibility record count does not match migration plan')
  }
  for (const expected of plan.legacyRecords) {
    const actual = database.getLegacyRecord(expected.id)
    if (!actual
      || actual.recordType !== expected.recordType
      || actual.sourceRecordId !== expected.sourceRecordId
      || actual.contentHash !== expected.contentHash
      || actual.jsonPayload !== expected.jsonPayload) {
      throw migrationError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Imported compatibility record hash does not match migration plan', { targetId: expected.id })
    }
  }
  for (const expected of plan.textItems) {
    const actual = await readProjectText(root, expected.relativePath)
    if (actual.contentHash !== expected.contentHash || actual.byteLength !== expected.byteLength) {
      throw migrationError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Imported text hash does not match migration plan', {
        itemId: expected.id,
        relativePath: expected.relativePath
      })
    }
  }
  const imported = database.getLegacyImport(plan.bundle.bundleId)
  if (!imported
    || imported.sourceSchemaVersion !== (plan.bundle.sourceSchemaVersion || 3)
    || imported.sourceCount !== plan.report.total
    || imported.importedCount !== (requireComplete ? plan.report.total : 0)
    || imported.state !== (requireComplete ? 'complete' : 'staging')) {
    throw migrationError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Import completion journal is missing')
  }
}

async function validateCompletedProject(root, plan, expectedName) {
  let database
  try {
    database = openProjectDatabase(join(root, '.pinax/project.sqlite'))
    await validateOpenProject(root, database, plan, { requireComplete: true, expectedName })
  } finally {
    if (database) closeProjectDatabase(database)
  }
}

function assertExactRows(actual, expected, message) {
  const canonical = (rows) => [...rows]
    .map(row => JSON.stringify(row))
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) {
    throw migrationError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, message)
  }
}

async function inspectExistingDestination(destination, bundleId) {
  if (!await pathExists(destination)) return null
  let manifest = null
  try {
    manifest = await readProjectManifest(destination)
    const path = join(destination, '.pinax/project.sqlite')
    const raw = new Database(path, { readonly: true, fileMustExist: true })
    try {
      const table = raw.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='legacy_imports'").get()
      const row = table
        ? raw.prepare("SELECT state FROM legacy_imports WHERE bundle_id = ?").get(bundleId)
        : null
      return { manifest, completed: row?.state === 'complete' }
    } finally {
      raw.close()
    }
  } catch {
    return { manifest, completed: false }
  }
}

async function readBundle(path, deps) {
  try {
    throwIfCancelled(deps.signal)
    const metadata = await (deps.stat || stat)(path)
    if (!Number.isFinite(metadata?.size) || metadata.size > 256 * 1024 * 1024) {
      throw migrationError(DESKTOP_ERROR_CODES.INVALID_INPUT, 'Migration bundle exceeds the file size limit')
    }
    throwIfCancelled(deps.signal)
    const raw = deps.readFile
      ? await deps.readFile(path, 'utf8')
      : await readFile(path, { encoding: 'utf8', signal: deps.signal })
    throwIfCancelled(deps.signal)
    return JSON.parse(raw)
  } catch (error) {
    if (String(error?.code || '').startsWith('DESKTOP_')) throw error
    throw migrationError(DESKTOP_ERROR_CODES.INVALID_INPUT, 'Migration bundle is not readable JSON', { cause: error?.code })
  }
}

async function requireExistingParent(parentDirectory) {
  try {
    const parent = await stat(parentDirectory)
    if (!parent.isDirectory()) throw new Error('not-directory')
  } catch (error) {
    throw migrationError(DESKTOP_ERROR_CODES.IO_FAILED, 'Migration destination parent is unavailable', { cause: error?.code })
  }
}

async function pathExists(path) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function databaseItem(item) {
  return {
    id: item.id,
    kind: item.kind,
    relativePath: item.relativePath,
    parentId: item.parentId,
    sortOrder: item.sortOrder,
    revision: item.revision,
    contentHash: item.contentHash,
    byteLength: item.byteLength,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  }
}

function throwIfCancelled(signal) {
  if (!signal?.aborted) return
  throwCancelled()
}

function throwCancelled() {
  throw migrationError(DESKTOP_ERROR_CODES.IO_FAILED, 'Legacy project migration was cancelled', { reason: 'cancelled' })
}

function migrationError(code, message, details) {
  return Object.assign(new Error(message), { code, details })
}
