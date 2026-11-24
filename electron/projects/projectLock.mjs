import process from 'node:process'
import Database from 'better-sqlite3'
import { open, readFile, rename, unlink } from 'node:fs/promises'
import { hostname as systemHostname } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DESKTOP_ERROR_CODES } from '../../shared/desktopProjectContract.js'

// The JSON marker remains readable by the mirror and older clients. A separate
// SQLite lock is owned by the process and released by the OS after a crash.
const leases = new Map()

export async function openProjectLock(root, manifest, options = {}) {
  const mode = options.mode || 'read-write'
  if (mode === 'read-only') return { mode, lock: null, recoveredStaleLock: false }

  const path = join(root, '.pinax/project.lock')
  const lease = new Database(join(root, '.pinax/writer-lease.sqlite'), { timeout: 0 })
  const locked = () => Object.assign(new Error('Project is already open for writing'), {
    code: DESKTOP_ERROR_CODES.PROJECT_LOCKED, details: { path, projectId: manifest.projectId }
  })
  try {
    lease.exec('BEGIN EXCLUSIVE')
    const existing = await readLock(path)
    const hostname = (options.hostname || systemHostname)()
    if (existing && (existing.hostname !== hostname || (options.isPidAlive || defaultPidAlive)(existing.pid))) {
      throw locked()
    }
    const lock = {
      projectId: manifest.projectId, pid: options.pid ?? process.pid, hostname,
      startedAt: (options.now || (() => new Date()))().toISOString(),
      nonce: (options.uuid || randomUUID)()
    }
    const temporaryPath = `${path}.${lock.nonce}.tmp`
    const handle = await open(temporaryPath, 'wx')
    try {
      await handle.writeFile(JSON.stringify(lock) + '\n', 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporaryPath, path)
    leases.set(path, { nonce: lock.nonce, lease })
    return { mode, lock, recoveredStaleLock: Boolean(existing) }
  } catch (error) {
    lease.close()
    if (error.code === 'SQLITE_BUSY') throw locked()
    throw error
  }
}

export async function closeProjectLock(root, nonce) {
  const path = join(root, '.pinax/project.lock')
  const holder = leases.get(path)
  if (!holder || holder.nonce !== nonce) return false
  try {
    const current = await readLock(path)
    if (current?.nonce !== nonce) return false
    await unlink(path)
    return true
  } finally {
    leases.delete(path)
    holder.lease.close()
  }
}

async function readLock(path) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'))
    if (!value?.nonce || !value?.hostname || !Number.isInteger(value?.pid)) throw new Error('Invalid lock')
    return value
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw Object.assign(new Error('Project lock is invalid'), {
      code: DESKTOP_ERROR_CODES.INTEGRITY_FAILED, details: { path }
    })
  }
}

function defaultPidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}
