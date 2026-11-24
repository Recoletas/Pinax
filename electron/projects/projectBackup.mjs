import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { chmod, mkdir, open, readdir, realpath, rename, rm, stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { DESKTOP_ERROR_CODES, validateRelativeProjectPath } from '../../shared/desktopProjectContract.js'
import { checkDatabaseIntegrity, closeProjectDatabase, openProjectDatabase, snapshotProjectDatabase } from './projectDatabase.mjs'
import { readProjectText } from './projectFiles.mjs'
import { readProjectManifest } from './projectManifest.mjs'
import { syncDirectory } from './fsDurability.mjs'

const ACCEPTED_ASSET_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.mp3', '.wav', '.ogg', '.m4a', '.mp4', '.webm', '.mov',
  '.pdf', '.doc', '.docx', '.md', '.txt'
])

export async function createManagedBackup(project, deps = {}) {
  const source = resolve(project?.root || '')
  const destination = resolve(project?.destination || '')
  if (!project?.root || !project?.destination || !project?.database) {
    throw desktopError(DESKTOP_ERROR_CODES.INVALID_INPUT, 'Backup source, destination, and database are required')
  }
  if (isContained(source, destination)) {
    throw desktopError(DESKTOP_ERROR_CODES.PATH_OUTSIDE_PROJECT, 'Backup destination must be outside the source project')
  }

  const now = deps.now || (() => new Date())
  const timestamp = now().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const projectName = safeName(project.name || 'project')
  const baseName = `${projectName}-${timestamp}.pinax-backup`
  const staging = join(destination, `${baseName}.staging`)
  const finalPath = join(destination, baseName)
  let ownsStaging = false

  try {
    await mkdir(destination, { recursive: true })
    if (isContained(await realpath(source), await realpath(destination))) {
      throw desktopError(DESKTOP_ERROR_CODES.PATH_OUTSIDE_PROJECT, 'Backup destination resolves inside the project')
    }
    await mkdir(staging)
    ownsStaging = true
    const sourceFiles = await collectBackupFiles(source)
    const files = []
    for (const relativePath of sourceFiles) {
      const from = join(source, ...relativePath.split('/'))
      const to = join(staging, ...relativePath.split('/'))
      await mkdir(dirname(to), { recursive: true })
      let digest
      if (relativePath === '.pinax/project.sqlite') {
        await snapshotProjectDatabase(project.database, to)
        digest = await fileDigest(to)
      } else if (deps.copyFile) {
        digest = await fileDigest(from)
        await deps.copyFile(from, to)
      } else {
        digest = await fileDigest(from, to)
      }
      await syncBackupFile(to)
      files.push({ relativePath, ...digest })
    }

    const backupManifest = {
      version: 1,
      projectName: String(project.name || 'project'),
      createdAt: now().toISOString(),
      files
    }
    await writeAndSync(join(staging, 'backup-manifest.json'), `${JSON.stringify(backupManifest, null, 2)}\n`)
    await verifyBackup(staging, files)
    await verifyProjectSnapshot(staging, project.projectId, files)
    const directories = new Set([staging])
    for (const file of files) {
      let parent = dirname(join(staging, file.relativePath))
      while (parent !== staging && !directories.has(parent)) {
        directories.add(parent)
        parent = dirname(parent)
      }
    }
    for (const directory of [...directories].sort((a, b) => b.length - a.length)) await syncDirectory(directory)
    await rename(staging, finalPath)
    ownsStaging = false
    await syncDirectory(destination)
    return { path: finalPath, manifest: backupManifest }
  } catch (error) {
    if (ownsStaging) await rm(staging, { recursive: true, force: true })
    if (String(error?.code || '').startsWith('DESKTOP_')) throw error
    throw desktopError(DESKTOP_ERROR_CODES.IO_FAILED, 'Managed backup failed', { cause: error?.code })
  }
}

async function collectBackupFiles(root) {
  const required = ['.pinax/project.json', '.pinax/project.sqlite']
  const files = []
  for (const relativePath of required) {
    if (!(await stat(join(root, ...relativePath.split('/')))).isFile()) {
      throw desktopError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Backup is missing a required project file', { relativePath })
    }
    files.push(relativePath)
  }
  await collectTree(root, 'manuscript', files, (path) => extname(path).toLowerCase() === '.txt')
  await collectTree(root, 'reference', files, (path) => extname(path).toLowerCase() === '.txt')
  await collectTree(root, 'assets', files, (path) => ACCEPTED_ASSET_EXTENSIONS.has(extname(path).toLowerCase()))
  return [...new Set(files)].sort()
}

async function collectTree(root, relativeDirectory, output, accepts) {
  const directory = join(root, ...relativeDirectory.split('/'))
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const path = `${relativeDirectory}/${entry.name}`
    if (entry.isDirectory()) await collectTree(root, path, output, accepts)
    else if (entry.isFile() && accepts(path)) output.push(path)
  }
}

async function verifyBackup(root, files) {
  for (const entry of files) {
    const content = await fileDigest(join(root, ...entry.relativePath.split('/')))
    if (content.byteLength !== entry.byteLength || content.sha256 !== entry.sha256) {
      throw desktopError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Backup verification failed', { relativePath: entry.relativePath })
    }
  }
}

async function verifyProjectSnapshot(root, expectedProjectId, files) {
  const manifest = await readProjectManifest(root)
  if (expectedProjectId && manifest.projectId !== expectedProjectId) {
    throw desktopError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Backup project identity changed')
  }
  const database = openProjectDatabase(join(root, '.pinax/project.sqlite'), { readOnly: true })
  try {
    const checks = checkDatabaseIntegrity(database)
    if (checks.integrityCheck !== 'ok' || checks.foreignKeyViolation) {
      throw desktopError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Backup database failed integrity checks', checks)
    }
    if (database.listRecoverableFileTransactions().length) {
      throw desktopError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Backup has an incomplete database transaction')
    }
    const verified = new Map(files.map(file => [file.relativePath, file]))
    for (const item of database.listTextItems()) {
      const path = validateRelativeProjectPath(item.relativePath)
      const bytes = path.valid && verified.get(path.value)
      if (!bytes) throw desktopError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Backup is missing an indexed text', { relativePath: item.relativePath })
      // Normal LF files already matched the verified backup bytes. Older
      // files with CRLF/CR need the same normalization as a desktop text read.
      if (bytes.sha256 === item.contentHash && bytes.byteLength === item.byteLength) continue
      const file = await readProjectText(root, item.relativePath)
      if (file.contentHash !== item.contentHash || file.byteLength !== item.byteLength) {
        throw desktopError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Backup text and database revision disagree', { relativePath: item.relativePath })
      }
    }
  } finally {
    closeProjectDatabase(database)
  }
}

async function writeAndSync(path, content) {
  const handle = await open(path, 'wx')
  try {
    await handle.writeFile(content, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function syncBackupFile(path) {
  // copyFile preserves a source file's read-only permissions. Flush that
  // private copy and restore its mode without changing the author's source.
  const mode = (await stat(path)).mode & 0o777
  const readOnly = !(mode & 0o200)
  if (readOnly) await chmod(path, mode | 0o200)
  try {
    const handle = await open(path, 'r+')
    try { await handle.sync() } finally { await handle.close() }
  } finally {
    if (readOnly) await chmod(path, mode)
  }
}

async function fileDigest(path, copyTo) {
  const digest = createHash('sha256')
  const mode = copyTo ? (await stat(path)).mode & 0o777 : null
  const input = createReadStream(path)
  if (copyTo) {
    input.on('data', chunk => digest.update(chunk))
    await pipeline(input, createWriteStream(copyTo, { flags: 'wx', mode: 0o600 }))
    await chmod(copyTo, mode)
  } else {
    for await (const chunk of input) digest.update(chunk)
  }
  return { byteLength: input.bytesRead, sha256: digest.digest('hex') }
}

function safeName(value) {
  return String(value).trim().replaceAll(/[^\p{Letter}\p{Number}._-]+/gu, '-').replaceAll(/^-+|-+$/g, '') || 'project'
}

function isContained(root, target) {
  const child = relative(root, target)
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child))
}

function desktopError(code, message, details) {
  return Object.assign(new Error(message), { code, details })
}
