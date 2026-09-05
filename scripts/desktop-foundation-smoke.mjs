import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeProjectDatabase, openProjectDatabase } from '../electron/projects/projectDatabase.mjs'
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
  await access(packagedArtifact)
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

  const backup = await writer.createBackup({ destinationDirectory: backupRoot })
  const backupManifest = JSON.parse(await readFile(join(backup.path, 'backup-manifest.json'), 'utf8'))
  if (!backupManifest.files.some((entry) => entry.relativePath === relativePath)) {
    throw new Error('managed backup does not contain manuscript text')
  }

  await reader.close()
  await writer.close()
  await expectMissing(join(projectRoot, '.pinax/project.lock'))
  process.stdout.write(`${JSON.stringify({
    ok: true,
    os: process.platform,
    node: process.version,
    electron: packageJson.devDependencies.electron,
    packagedArtifact,
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
