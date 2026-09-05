import { open, readFile, rename, unlink } from 'node:fs/promises'
import { hostname as systemHostname } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DESKTOP_ERROR_CODES } from '../../shared/desktopProjectContract.js'

export async function openProjectLock(root, manifest, options = {}) {
  const mode = options.mode || 'read-write'
  if (mode === 'read-only') return { mode, lock: null, recoveredStaleLock: false }

  const path = join(root, '.pinax/project.lock')
  const existing = await readLock(path)
  let recoveredStaleLock = false
  if (existing) {
    const localHost = (options.hostname || systemHostname)()
    const active = existing.hostname !== localHost
      || (options.isPidAlive || defaultPidAlive)(existing.pid)
    if (active) {
      throw Object.assign(new Error('Project is already open for writing'), {
        code: DESKTOP_ERROR_CODES.PROJECT_LOCKED,
        details: { path, projectId: existing.projectId, hostname: existing.hostname, pid: existing.pid }
      })
    }
    recoveredStaleLock = true
  }

  const lock = {
    projectId: manifest.projectId,
    pid: options.pid ?? process.pid,
    hostname: (options.hostname || systemHostname)(),
    startedAt: (options.now || (() => new Date()))().toISOString(),
    nonce: (options.uuid || randomUUID)()
  }
  const temporaryPath = `${path}.${lock.nonce}.tmp`
  const handle = await open(temporaryPath, 'wx')
  try {
    await handle.writeFile(`${JSON.stringify(lock)}\n`, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  await rename(temporaryPath, path)
  return { mode, lock, recoveredStaleLock }
}

export async function closeProjectLock(root, nonce) {
  const path = join(root, '.pinax/project.lock')
  const current = await readLock(path)
  if (!current || current.nonce !== nonce) return false
  await unlink(path)
  return true
}

async function readLock(path) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'))
    if (!value?.nonce || !value?.hostname || !Number.isInteger(value?.pid)) throw new Error('Invalid lock')
    return value
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw Object.assign(new Error('Project lock is invalid'), {
      code: DESKTOP_ERROR_CODES.INTEGRITY_FAILED,
      details: { path }
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
