import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { chmod, copyFile, access, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeProjectDatabase, openProjectDatabase } from '../electron/projects/projectDatabase.mjs'
import { createManagedBackup } from '../electron/projects/projectBackup.mjs'
import { createProject, readProjectManifest } from '../electron/projects/projectManifest.mjs'
import { createProjectRepository } from '../electron/projects/projectRepository.mjs'
import { hashText } from '../electron/projects/projectFiles.mjs'
import { createProjectService } from '../electron/projects/projectService.mjs'

const base = await mkdtemp(join(tmpdir(), 'pinax-desktop-smoke-'))
const projectRoot = join(base, '雾港计划')
const backupRoot = join(base, '托管备份')
const packagedArtifact = join(process.cwd(), 'out/pinax-linux-x64/pinax')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
let writer = null
let reader = null
let metadataDatabase = null

try {
  await Promise.all([mkdir(projectRoot), mkdir(backupRoot)])
  const storageOnly = process.argv.includes('--storage-only')
  if (!storageOnly) await access(packagedArtifact)
  writer = createProjectService()
  reader = createProjectService()

  const created = await writer.create({ directory: projectRoot, name: '雾港计划' })
  await writer.close()
  await expectMissing(join(projectRoot, '.pinax/project.lock'))

  await writer.open({ directory: projectRoot, mode: 'read-write' })
  let secondWriterBlocked = false
  try {
    await reader.open({ directory: projectRoot, mode: 'read-write' })
  } catch (error) {
    secondWriterBlocked = error?.code === 'DESKTOP_PROJECT_LOCKED'
  }
  if (!secondWriterBlocked) throw new Error('second read-write open was not blocked')
  const readOnly = await reader.open({ directory: projectRoot, mode: 'read-only' })

  const relativePath = 'manuscript/第一章.txt'
  await writeFile(join(projectRoot, relativePath), '', 'utf8')
  metadataDatabase = openProjectDatabase(join(projectRoot, '.pinax/project.sqlite'))
  const timestamp = new Date().toISOString()
  metadataDatabase.insertItem({
    id: 'chapter-1', kind: 'chapter', relativePath, parentId: null, sortOrder: 0,
    revision: 0, contentHash: hashText(''), byteLength: 0, createdAt: timestamp, updatedAt: timestamp
  })
  closeProjectDatabase(metadataDatabase)
  metadataDatabase = null

  const written = await writer.writeText({
    itemId: 'chapter-1', relativePath, expectedRevision: 0, text: '潮声抵达旧灯塔。\r\n第二行。'
  })
  await writer.close()
  await writer.open({ directory: projectRoot, mode: 'read-write' })
  const reopened = await writer.readText({ itemId: 'chapter-1' })
  if (reopened.text !== '潮声抵达旧灯塔。\n第二行。' || reopened.revision !== written.revision) {
    throw new Error('reopened text does not match committed revision')
  }
  await writeFile(join(projectRoot, 'manuscript/未登记.txt'), '外部资料')
  assert.deepEqual(await reader.listText({ kind: 'manuscript', view: 'summary' }), [{
    itemId: 'chapter-1', relativePath, revision: reopened.revision, recordedByteLength: reopened.byteLength
  }])
  assert.deepEqual(await writer.listText({ kind: 'manuscript' }), [reopened])
  await assert.rejects(reader.listText({ kind: 'manuscript', view: 'unknown' }), { code: 'DESKTOP_INVALID_INPUT' })

  const asset = join(projectRoot, 'assets/documents/read-only.pdf')
  await writeFile(asset, 'read-only test asset')
  await chmod(asset, 0o444)
  // Desktop metadata hashes LF text; backup files and their manifest preserve the raw bytes.
  const crlf = reopened.text.replaceAll('\n', '\r\n')
  await writeFile(join(projectRoot, relativePath), crlf)
  const backup = await writer.createBackup({ destinationDirectory: backupRoot })
  assert.equal(await readFile(join(backup.path, relativePath), 'utf8'), crlf)
  const backupManifest = JSON.parse(await readFile(join(backup.path, 'backup-manifest.json'), 'utf8'))
  if (!backupManifest.files.some((entry) => entry.relativePath === relativePath)) {
    throw new Error('managed backup does not contain manuscript text')
  }

  assert.deepEqual((await readdir(join(backup.path, '.pinax'))).sort(), ['project.json', 'project.sqlite'])
  const backupDb = openProjectDatabase(join(backup.path, '.pinax/project.sqlite'), { readOnly: true })
  try {
    const snapshotText = await createProjectRepository({ root: backup.path, database: backupDb, mode: 'read-only' }).readText('chapter-1')
    assert.equal(snapshotText.text, reopened.text)
    assert.equal(snapshotText.revision, reopened.revision)
  } finally { closeProjectDatabase(backupDb) }

  // Two IPC saves can be submitted before either promise settles.
  const inputs = ['作者稿 A', '作者稿 B'].map(text => ({
    itemId: 'chapter-1', relativePath, expectedRevision: reopened.revision, text
  }))
  const [first, second] = await Promise.allSettled(inputs.map(input => writer.writeText(input)))
  assert.equal(first.status, 'fulfilled')
  assert.equal(second.reason.code, 'DESKTOP_STALE_REVISION')
  assert.equal((await writer.readText({ itemId: 'chapter-1' })).text, inputs[0].text)
  assert.deepEqual((await writer.checkIntegrity()).hashMismatches, [])

  // Force an independent writer between the SQLite snapshot and text copy.
  // The backup must fail before publication.
  metadataDatabase = openProjectDatabase(join(projectRoot, '.pinax/project.sqlite'), { readOnly: true })
  const beforeDamagedCopy = await readdir(backupRoot)
  await assert.rejects(createManagedBackup({
    root: projectRoot, database: metadataDatabase, name: '损坏的附件', destination: backupRoot
  }, { copyFile: async (from, to) => {
    if (from === asset) await writeFile(to, 'READ-ONLY TEST ASSET')
    else await copyFile(from, to)
  } }), { code: 'DESKTOP_INTEGRITY_FAILED' })
  assert.deepEqual(await readdir(backupRoot), beforeDamagedCopy)
  await assert.rejects(createManagedBackup({
    root: projectRoot, database: metadataDatabase, name: '交叉保存', destination: backupRoot
  }, { copyFile: async (from, to) => {
    if (from.endsWith(relativePath.split('/').at(-1))) {
      await writer.writeText({ ...inputs[0], expectedRevision: first.value.revision, text: '并发稿件' })
    }
    await copyFile(from, to)
  } }), { code: 'DESKTOP_INTEGRITY_FAILED' })
  closeProjectDatabase(metadataDatabase)
  metadataDatabase = null

  // A read-only session may inspect v1 without opening any migration writer.
  const oldRoot = join(base, '旧版只读')
  await mkdir(oldRoot)
  await createProject(oldRoot, { name: '旧版只读' })
  const oldPath = join(oldRoot, '.pinax/project.sqlite')
  const view = createProjectService()
  await assert.rejects(view.open({ directory: oldRoot, mode: 'read-only' }))
  await expectMissing(oldPath)
  const v1 = new Database(oldPath)
  v1.exec(await readFile(new URL('../electron/projects/migrations/001-foundation.sql', import.meta.url), 'utf8'))
  v1.prepare('INSERT INTO schema_migrations VALUES (1, ?)').run(timestamp)
  v1.close()
  const oldBytes = await readFile(oldPath)
  await view.open({ directory: oldRoot, mode: 'read-only' })
  assert.deepEqual((await view.checkIntegrity()).schema, { valid: true, needsMigration: true, version: 1 })
  await view.close()
  assert.deepEqual(await readFile(oldPath), oldBytes)

  await reader.close()
  await writer.close()
  await expectMissing(join(projectRoot, '.pinax/project.lock'))
  const contenders = [writer, reader]
  const claims = await Promise.allSettled(contenders.map(service => service.open({ directory: projectRoot, mode: 'read-write' })))
  assert.equal(claims.filter(claim => claim.status === 'fulfilled').length, 1)
  assert.equal(claims.find(claim => claim.status === 'rejected').reason.code, 'DESKTOP_PROJECT_LOCKED')
  await Promise.all(contenders.map(service => service.close()))
  const lockedRoot = join(base, '另一部已打开的作品')
  await mkdir(lockedRoot)
  await reader.create({ directory: lockedRoot, name: '另一部作品' })
  await writer.open({ directory: projectRoot, mode: 'read-write' })
  await assert.rejects(writer.open({ directory: lockedRoot, mode: 'read-write' }), { code: 'DESKTOP_PROJECT_LOCKED' })
  assert.equal((await writer.getActive()).projectId, created.projectId)
  assert.equal((await writer.readText({ itemId: 'chapter-1' })).text, '并发稿件')
  await Promise.all(contenders.map(service => service.close()))

  // Concurrent creators must return exactly the identity they installed.
  const createRoot = join(base, '同时新建')
  await mkdir(createRoot)
  const creates = await Promise.allSettled(contenders.map((service, i) => service.create({ directory: createRoot, name: '新项目' + i })))
  const successful = creates.filter(claim => claim.status === 'fulfilled')
  assert.equal(successful.length, 1)
  assert.equal((await readProjectManifest(createRoot)).projectId, successful[0].value.projectId)
  await Promise.all(contenders.map(service => service.close()))

  metadataDatabase = openProjectDatabase(join(projectRoot, '.pinax/project.sqlite'))
  const target = join(projectRoot, relativePath)
  const original = await readFile(target, 'utf8')
  const project = { root: projectRoot, mode: 'read-write', database: metadataDatabase }
  const revision = metadataDatabase.getItemById('chapter-1').revision
  const pending = { itemId: 'chapter-1', relativePath, expectedRevision: revision, text: '暂存中的稿件' }
  const externallyEdited = createProjectRepository(project, { fileAdapter: { move: async (from, to) => {
    await rename(from, to)
    await writeFile(target, '暂存时由外部编辑器保存')
  } } })
  await assert.rejects(externallyEdited.writeText(pending), { code: 'DESKTOP_STALE_REVISION' })
  assert.equal(await readFile(target, 'utf8'), '暂存时由外部编辑器保存')
  assert.equal(metadataDatabase.listRecoverableFileTransactions().length, 0)
  await writeFile(target, original)
  const interrupted = createProjectRepository(project, { fileAdapter: { replace: async (from, to) => {
    await rename(from, to)
    throw new Error('simulate interruption after rename')
  } } })
  await assert.rejects(interrupted.writeText(pending), { code: 'DESKTOP_IO_FAILED' })
  assert.equal(metadataDatabase.listRecoverableFileTransactions()[0].state, 'staged')
  closeProjectDatabase(metadataDatabase)
  metadataDatabase = null
  const recovery = await writer.open({ directory: projectRoot, mode: 'read-write' })
  assert.equal(recovery.recovery.recovered.length, 1)
  const recovered = await writer.readText({ itemId: 'chapter-1' })
  assert.equal(recovered.text, pending.text)
  assert.equal(recovered.revision, revision + 1)
  const manifestPath = join(projectRoot, '.pinax/project.json')
  const beforeBroken = await readFile(manifestPath)
  const previousBackups = await readdir(backupRoot)
  await writeFile(manifestPath, '{')
  await assert.rejects(writer.createBackup({ destinationDirectory: backupRoot }), { code: 'DESKTOP_INTEGRITY_FAILED' })
  assert.deepEqual(await readdir(backupRoot), previousBackups)
  await writeFile(manifestPath, beforeBroken)
  // SQLite page integrity alone accepts a chapter whose parent volume is missing.
  const damaged = new Database(join(projectRoot, '.pinax/project.sqlite'))
  try {
    damaged.pragma('foreign_keys = OFF')
    damaged.prepare('UPDATE project_items SET parent_id = ? WHERE id = ?').run('missing-volume', 'chapter-1')
  } finally { damaged.close() }
  const { sqlite } = await writer.checkIntegrity()
  assert.equal(sqlite.integrityCheck, 'ok')
  assert.equal(sqlite.foreignKeyViolation.tableName, 'project_items')
  await assert.rejects(writer.createBackup({ destinationDirectory: backupRoot }), { code: 'DESKTOP_INTEGRITY_FAILED' })
  assert.deepEqual(await readdir(backupRoot), previousBackups)
  await writer.close()
  process.stdout.write(`${JSON.stringify({
    ok: true,
    os: process.platform,
    node: process.version,
    electron: packageJson.devDependencies.electron,
    packagedArtifact: storageOnly ? null : packagedArtifact,
    projectPathClass: 'temporary-non-ascii',
    projectName: created.name,
    readOnlyMode: readOnly.mode,
    revision: reopened.revision,
    backupFiles: backupManifest.files.length,
    windowsCleanMachine: 'not-run'
  })}\n`)
} finally {
  if (metadataDatabase) closeProjectDatabase(metadataDatabase)
  await reader?.close().catch(() => {})
  await writer?.close().catch(() => {})
  await rm(base, { recursive: true, force: true })
}

async function expectMissing(path) {
  try {
    await access(path)
    throw new Error(`expected path to be absent: ${path}`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}
