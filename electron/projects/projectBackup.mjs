import { createHash } from 'node:crypto'
import { copyFile as nodeCopyFile, mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { DESKTOP_ERROR_CODES } from '../../shared/desktopProjectContract.js'
import { checkpointDatabase } from './projectDatabase.mjs'
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
  const checkpoint = deps.checkpoint || checkpointDatabase
  const copyFile = deps.copyFile || nodeCopyFile
  const timestamp = now().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const projectName = safeName(project.name || 'project')
  const baseName = `${projectName}-${timestamp}.pinax-backup`
  const staging = join(destination, `${baseName}.staging`)
  const finalPath = join(destination, baseName)
  let ownsStaging = false

  try {
    await mkdir(destination, { recursive: true })
    await mkdir(staging)
    ownsStaging = true
    const checkpointResult = checkpoint(project.database)
    if (checkpointResult?.busy) {
      throw desktopError(DESKTOP_ERROR_CODES.IO_FAILED, 'SQLite checkpoint is busy')
    }

    const sourceFiles = await collectBackupFiles(source)
    const files = []
    for (const relativePath of sourceFiles) {
      const from = join(source, ...relativePath.split('/'))
      const to = join(staging, ...relativePath.split('/'))
      await mkdir(dirname(to), { recursive: true })
      await copyFile(from, to)
      const content = await readFile(to)
      files.push({
        relativePath,
        byteLength: content.byteLength,
        sha256: hashBuffer(content)
      })
    }

    const backupManifest = {
      version: 1,
      projectName: String(project.name || 'project'),
      createdAt: now().toISOString(),
      files
    }
    await writeAndSync(join(staging, 'backup-manifest.json'), `${JSON.stringify(backupManifest, null, 2)}\n`)
    await verifyBackup(staging, files)
    await syncDirectory(staging)
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
    try {
      if ((await stat(join(root, ...relativePath.split('/')))).isFile()) files.push(relativePath)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
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
    const content = await readFile(join(root, ...entry.relativePath.split('/')))
    if (content.byteLength !== entry.byteLength || hashBuffer(content) !== entry.sha256) {
      throw desktopError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Backup verification failed', { relativePath: entry.relativePath })
    }
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

function hashBuffer(content) {
  return createHash('sha256').update(content).digest('hex')
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
