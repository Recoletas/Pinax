import { createHash } from 'node:crypto'
import { mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises'
import { dirname, join, posix, relative, sep } from 'node:path'
import { DESKTOP_ERROR_CODES } from '../../shared/desktopProjectContract.js'
import { syncDirectory } from './fsDurability.mjs'
import { resolveProjectPath } from './projectPaths.mjs'

export function normalizeText(text) {
  return String(text).replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

export function hashText(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex')
}

export async function readProjectText(root, relativePath) {
  try {
    const path = await resolveProjectPath(root, relativePath)
    const text = normalizeText(await readFile(path, 'utf8'))
    return { text, contentHash: hashText(text), byteLength: Buffer.byteLength(text, 'utf8') }
  } catch (error) {
    throw asDesktopIoError(error, 'Project text cannot be read', { relativePath })
  }
}

export async function listProjectTextPaths(root, kind, containedDirectory = '') {
  if (!['manuscript', 'reference'].includes(kind)) {
    throw desktopError(DESKTOP_ERROR_CODES.INVALID_INPUT, 'Text list kind must be manuscript or reference')
  }
  const directory = normalizeDirectory(containedDirectory)
  const prefix = directory ? `${kind}/${directory}` : kind
  const probePath = `${prefix}/.pinax-list-probe.txt`
  let absoluteDirectory
  try {
    absoluteDirectory = dirname(await resolveProjectPath(root, probePath))
  } catch (error) {
    throw asDesktopIoError(error, 'Project text directory is invalid', { kind })
  }
  const paths = []
  await walkTextDirectory(root, absoluteDirectory, paths)
  return paths.sort((left, right) => left.localeCompare(right, 'zh-CN'))
}

export async function stageProjectText(root, stagedPath, text) {
  try {
    const path = await resolveProjectPath(root, stagedPath, { allowPinax: true })
    await mkdir(dirname(path), { recursive: true })
    const normalized = normalizeText(text)
    const handle = await open(path, 'wx')
    try {
      await handle.writeFile(normalized, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    return {
      text: normalized,
      contentHash: hashText(normalized),
      byteLength: Buffer.byteLength(normalized, 'utf8')
    }
  } catch (error) {
    throw asDesktopIoError(error, 'Project text cannot be staged', { stagedPath })
  }
}

export async function atomicReplaceText(root, input, adapter = {}) {
  const move = adapter.move || rename
  const replace = adapter.replace || rename
  const staged = await resolveProjectPath(root, input.stagedPath, { allowPinax: true })
  const target = await resolveProjectPath(root, input.relativePath)
  const sibling = siblingTemporaryPath(target, input.transactionId)
  try {
    await mkdir(dirname(target), { recursive: true })
    await move(staged, sibling)
    await replace(sibling, target)
    await syncDirectory(dirname(target))
  } catch (error) {
    throw asDesktopIoError(error, 'Project text cannot be atomically replaced', {
      relativePath: input.relativePath,
      transactionId: input.transactionId
    })
  }
}

export async function removeOwnedTransactionTemps(root, transaction) {
  const staged = await resolveProjectPath(root, transaction.stagedPath, { allowPinax: true })
  const target = await resolveProjectPath(root, transaction.relativePath)
  await Promise.all([
    rm(staged, { force: true }),
    rm(siblingTemporaryPath(target, transaction.id), { force: true })
  ])
}

function siblingTemporaryPath(target, transactionId) {
  const safeId = String(transactionId).replaceAll(/[^a-zA-Z0-9_-]/g, '_')
  return join(dirname(target), `.pinax-${safeId}.tmp`)
}

async function walkTextDirectory(root, directory, output) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await walkTextDirectory(root, path, output)
    else if (entry.isFile() && entry.name.endsWith('.txt')) {
      output.push(relative(root, path).split(sep).join('/'))
    }
  }
}

function normalizeDirectory(value) {
  if (!value) return ''
  const normalized = String(value).trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '')
  if (!normalized || posix.isAbsolute(normalized) || normalized.split('/').some((part) => !part || part === '.' || part === '..' || part.startsWith('.'))) {
    throw desktopError(DESKTOP_ERROR_CODES.INVALID_INPUT, 'Contained directory is invalid')
  }
  return normalized
}

function asDesktopIoError(error, message, details) {
  if (String(error?.code || '').startsWith('DESKTOP_')) return error
  return desktopError(DESKTOP_ERROR_CODES.IO_FAILED, message, { ...details, cause: error?.code })
}

function desktopError(code, message, details) {
  return Object.assign(new Error(message), { code, details })
}
