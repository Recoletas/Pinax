import { join } from 'node:path'
import { DESKTOP_ERROR_CODES } from '../../shared/desktopProjectContract.js'
import { createManagedBackup } from './projectBackup.mjs'
import { closeProjectDatabase, openProjectDatabase } from './projectDatabase.mjs'
import { closeProjectLock, openProjectLock } from './projectLock.mjs'
import { createProject as createManifestProject, readProjectManifest } from './projectManifest.mjs'
import { createProjectRepository } from './projectRepository.mjs'

export function createProjectService(deps = {}) {
  let active = null

  async function activate(root, manifest, mode) {
    if (active) await close()
    let lockResult
    let database
    try {
      lockResult = await openProjectLock(root, manifest, { mode, ...(deps.lock || {}) })
      database = openProjectDatabase(join(root, '.pinax/project.sqlite'))
      const repository = createProjectRepository({ root, mode, database }, deps.repository)
      const recovery = mode === 'read-write'
        ? await repository.recoverInterruptedWrites()
        : { recovered: [], repairCases: [] }
      active = { root, manifest, mode, lock: lockResult.lock, database, repository, recovery }
      return describeActive(active)
    } catch (error) {
      if (database) closeProjectDatabase(database)
      if (lockResult?.lock) await closeProjectLock(root, lockResult.lock.nonce)
      throw error
    }
  }

  async function close() {
    if (!active) return false
    const closing = active
    active = null
    closeProjectDatabase(closing.database)
    if (closing.lock) await closeProjectLock(closing.root, closing.lock.nonce)
    return true
  }

  function requireActive() {
    if (!active) throw desktopError(DESKTOP_ERROR_CODES.PROJECT_NOT_OPEN, 'Desktop project is not open')
    return active
  }

  return Object.freeze({
    async create(input) {
      const manifest = await createManifestProject(input.directory, { name: input.name }, deps.manifest)
      return activate(input.directory, manifest, 'read-write')
    },
    async open(input) {
      const manifest = await readProjectManifest(input.directory)
      return activate(input.directory, manifest, input.mode)
    },
    async getActive() {
      return active ? describeActive(active) : null
    },
    async listText(input) {
      return requireActive().repository.listText(input.kind, input.directory)
    },
    async readText(input) {
      return requireActive().repository.readText(input.itemId)
    },
    async writeText(input) {
      return requireActive().repository.writeText(input)
    },
    async checkIntegrity() {
      return requireActive().repository.checkIntegrity()
    },
    async createBackup(input) {
      const current = requireActive()
      return createManagedBackup({
        root: current.root,
        destination: input.destinationDirectory,
        database: current.database,
        name: current.manifest.name
      }, deps.backup)
    },
    close
  })
}

function describeActive(active) {
  return {
    directory: active.root,
    projectId: active.manifest.projectId,
    name: active.manifest.name,
    mode: active.mode,
    recovery: active.recovery
  }
}

function desktopError(code, message, details) {
  return Object.assign(new Error(message), { code, details })
}
