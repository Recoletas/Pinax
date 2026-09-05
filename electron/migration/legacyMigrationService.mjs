import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { DESKTOP_ERROR_CODES } from '../../shared/desktopProjectContract.js'
import { dryRunLegacyProjectMigration, importLegacyProject } from './legacyProjectImporter.mjs'

const SELECTION_TTL_MS = 30 * 60 * 1000

export function createLegacyMigrationService(deps) {
  const dialog = deps.dialog
  const getWindow = deps.getWindow
  const uuid = deps.uuid || randomUUID
  const now = deps.now || (() => new Date())
  const runDryRun = deps.dryRun || dryRunLegacyProjectMigration
  const runImport = deps.importProject || importLegacyProject
  const bundles = new Map()
  const destinations = new Map()
  let activeImport = null
  let activeImportPromise = null

  function remember(store, path) {
    pruneExpired(store)
    const token = uuid()
    store.set(token, { path, expiresAt: now().getTime() + SELECTION_TTL_MS })
    return token
  }

  function resolve(store, token, label) {
    pruneExpired(store)
    const selected = store.get(token)
    if (!selected) throw serviceError(DESKTOP_ERROR_CODES.INVALID_INPUT, `${label} selection is missing or expired`)
    return selected.path
  }

  function resolveSelection(store, token, label) {
    pruneExpired(store)
    const selected = store.get(token)
    if (!selected) throw serviceError(DESKTOP_ERROR_CODES.INVALID_INPUT, `${label} selection is missing or expired`)
    return selected
  }

  function pruneExpired(store) {
    const timestamp = now().getTime()
    for (const [token, selected] of store) {
      if (selected.expiresAt <= timestamp) store.delete(token)
    }
  }

  return Object.freeze({
    async chooseBundle() {
      const result = await dialog.showOpenDialog(getWindow(), {
        properties: ['openFile'],
        filters: [{ name: 'Pinax migration bundle', extensions: ['json'] }]
      })
      const path = result.canceled ? null : result.filePaths[0] || null
      return path ? { bundleToken: remember(bundles, path), displayName: basename(path) } : null
    },

    async chooseDestination() {
      const result = await dialog.showOpenDialog(getWindow(), { properties: ['openDirectory', 'createDirectory'] })
      const path = result.canceled ? null : result.filePaths[0] || null
      return path ? { destinationToken: remember(destinations, path), displayName: basename(path) } : null
    },

    async dryRun(input) {
      const selection = resolveSelection(bundles, input.bundleToken, 'Bundle')
      const preview = await runDryRun({ bundlePath: selection.path })
      selection.previewBundleId = preview.bundleId
      return { bundleId: preview.bundleId, report: preview.report }
    },

    async importProject(input) {
      if (activeImport) throw serviceError(DESKTOP_ERROR_CODES.IO_FAILED, 'A legacy project import is already running')
      const controller = new AbortController()
      activeImport = controller
      const operation = (async () => {
        const bundle = resolveSelection(bundles, input.bundleToken, 'Bundle')
        if (!bundle.previewBundleId) {
          throw serviceError(DESKTOP_ERROR_CODES.INVALID_INPUT, 'Migration bundle must be previewed before import')
        }
        const imported = await runImport({
          bundlePath: bundle.path,
          destinationParentDirectory: resolve(destinations, input.destinationToken, 'Destination'),
          name: input.name,
          expectedBundleId: bundle.previewBundleId
        }, { signal: controller.signal })
        const project = deps.activateProject
          ? await deps.activateProject({ directory: imported.directory, mode: 'read-write' })
          : { projectId: imported.projectId, name: imported.name, mode: 'read-write', recovery: { recovered: [], repairCases: [] } }
        return {
          alreadyImported: imported.alreadyImported,
          bundleId: imported.bundleId,
          report: imported.report,
          project: publicProject(project)
        }
      })()
      activeImportPromise = operation
      try {
        return await operation
      } catch (error) {
        throw serviceError(error?.code, error?.message)
      } finally {
        if (activeImport === controller) {
          activeImport = null
          activeImportPromise = null
        }
      }
    },

    cancelImport() {
      if (!activeImport) return false
      activeImport.abort()
      return true
    },

    async cancelAndWait() {
      if (!activeImport) return false
      const pending = activeImportPromise
      activeImport.abort()
      try {
        await pending
      } catch { /* cancellation is the expected shutdown result */ }
      return true
    }
  })
}

function serviceError(code, message) {
  return Object.assign(new Error(message), { code })
}

function publicProject(project) {
  return {
    projectId: project?.projectId,
    name: project?.name,
    mode: project?.mode,
    recovery: project?.recovery
  }
}
