import { randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  DESKTOP_DEFAULT_CACHE_LIMIT,
  DESKTOP_ERROR_CODES,
  DESKTOP_MAX_CACHE_LIMIT,
  DESKTOP_MIN_CACHE_LIMIT,
  validateCacheLimitInput
} from '../../shared/desktopProjectContract.js'
import { syncDirectory } from '../projects/fsDurability.mjs'

export const DEFAULT_CACHE_LIMIT = DESKTOP_DEFAULT_CACHE_LIMIT
export const MIN_CACHE_LIMIT = DESKTOP_MIN_CACHE_LIMIT
export const MAX_CACHE_LIMIT = DESKTOP_MAX_CACHE_LIMIT

export async function createCacheManager(options, deps = {}) {
  const root = resolve(options?.root || '')
  if (!options?.root) throw desktopError(DESKTOP_ERROR_CODES.INVALID_INPUT, 'Cache root is required')
  let limitBytes = options.limitBytes ?? DEFAULT_CACHE_LIMIT
  const limit = validateCacheLimitInput({ bytes: limitBytes })
  if (!limit.valid) throw desktopError(limit.error.code, limit.error.message)
  for (const configuredRoot of options.projectRoots || []) {
    const projectRoot = resolve(configuredRoot)
    if (isContained(projectRoot, root) || isContained(root, projectRoot)) {
      throw desktopError(DESKTOP_ERROR_CODES.PATH_OUTSIDE_PROJECT, 'Cache and project roots must not overlap')
    }
  }

  await mkdir(root, { recursive: true })
  const canonicalRoot = await realpath(root)
  const indexPath = join(root, 'index.json')
  const now = deps.now || (() => new Date())
  let records = await readIndex(indexPath)

  async function persist() {
    const temporaryPath = join(root, `.index-${randomUUID()}.tmp`)
    const handle = await open(temporaryPath, 'wx')
    try {
      await handle.writeFile(`${JSON.stringify({ version: 1, entries: records }, null, 2)}\n`, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporaryPath, indexPath)
    await syncDirectory(root)
  }

  return Object.freeze({
    get limitBytes() { return limitBytes },
    async setLimit(bytes) {
      const validation = validateCacheLimitInput({ bytes })
      if (!validation.valid) throw desktopError(validation.error.code, validation.error.message)
      limitBytes = validation.value.bytes
      return this.prune()
    },
    async register(input) {
      const relativePath = validateRelativePath(input?.relativePath)
      const path = await containedEntryPath(canonicalRoot, relativePath)
      const info = await stat(path)
      if (!info.isFile()) throw desktopError(DESKTOP_ERROR_CODES.INVALID_INPUT, 'Cache entry must be a file')
      const record = {
        relativePath,
        bytes: info.size,
        lastAccess: now().toISOString(),
        contentHash: String(input?.contentHash || ''),
        kind: String(input?.kind || 'unknown'),
        pinned: Boolean(input?.pinned)
      }
      const index = records.findIndex((entry) => entry.relativePath === relativePath)
      if (index >= 0) records[index] = record
      else records.push(record)
      await persist()
      return { ...record }
    },
    async touch(relativePath) {
      const normalized = validateRelativePath(relativePath)
      await containedEntryPath(canonicalRoot, normalized)
      const record = records.find((entry) => entry.relativePath === normalized)
      if (!record) return false
      record.lastAccess = now().toISOString()
      await persist()
      return true
    },
    async entries() {
      return records.map((record) => ({ ...record }))
    },
    async usage() {
      return { bytes: records.reduce((total, entry) => total + entry.bytes, 0), entries: records.length }
    },
    async prune() {
      let bytes = records.reduce((total, entry) => total + entry.bytes, 0)
      const deleted = []
      const candidates = records
        .filter((entry) => !entry.pinned)
        .sort((left, right) => left.lastAccess.localeCompare(right.lastAccess))
      for (const entry of candidates) {
        if (bytes <= limitBytes) break
        const path = await containedEntryPath(canonicalRoot, entry.relativePath)
        await rm(path, { force: true })
        records = records.filter((candidate) => candidate.relativePath !== entry.relativePath)
        bytes -= entry.bytes
        deleted.push(entry.relativePath)
      }
      await persist()
      return { deleted, bytes }
    }
  })
}

async function readIndex(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) throw new Error('invalid cache index')
    return parsed.entries.map((entry) => ({ ...entry }))
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw desktopError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Cache index is invalid')
  }
}

function validateRelativePath(value) {
  const normalized = String(value || '').trim().replaceAll('\\', '/')
  if (!normalized
    || normalized === 'index.json'
    || normalized.startsWith('.')
    || normalized.startsWith('/')
    || /^[a-zA-Z]:\//.test(normalized)
    || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw desktopError(DESKTOP_ERROR_CODES.PATH_OUTSIDE_PROJECT, 'Cache entry path escapes cache root')
  }
  return normalized
}

async function containedEntryPath(canonicalRoot, relativePath) {
  const target = resolve(canonicalRoot, ...relativePath.split('/'))
  if (!isContained(canonicalRoot, target)) throw desktopError(DESKTOP_ERROR_CODES.PATH_OUTSIDE_PROJECT, 'Cache entry path escapes cache root')
  const ancestor = await nearestExistingAncestor(target)
  const canonicalAncestor = await realpath(ancestor)
  if (!isContained(canonicalRoot, canonicalAncestor)) {
    throw desktopError(DESKTOP_ERROR_CODES.PATH_OUTSIDE_PROJECT, 'Cache entry path follows a symlink outside cache root')
  }
  return target
}

async function nearestExistingAncestor(target) {
  let current = target
  while (true) {
    try {
      await lstat(current)
      return current
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      const parent = dirname(current)
      if (parent === current) throw error
      current = parent
    }
  }
}

function isContained(root, target) {
  const child = relative(root, target)
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child))
}

function desktopError(code, message, details) {
  return Object.assign(new Error(message), { code, details })
}
