import { parentPort, workerData } from 'node:worker_threads'
import { openProjectCatalog } from '../projectCatalogDb.js'

const { root, request, expectedProjectId } = workerData
let catalog, response
try {
  catalog = openProjectCatalog(root, { readOnly: request.action !== 'sync', expectedProjectId })
  let result
  if (request.action === 'sync') {
    const synced = catalog.sync({ verifyContent: request.verifyContent === true })
    result = { ...synced, ...catalog.status(), initialized: true }
  } else {
    const before = catalog.status()
    if (request.action === 'status') result = { ...before, initialized: true }
    else {
      assertFresh(before)
      const data = request.action === 'search' ? catalog.search(request.query, request)
        : request.action === 'read' ? { item: catalog.read(request.kind, request.id) }
          : { items: catalog.list(request) }
      const after = catalog.status()
      assertFresh(after)
      if (after.revision !== before.revision) throw typedError('CATALOG_STALE', '查询期间目录版本已变化，请重试', after)
      result = { ...data, projectId: after.projectId, revision: after.revision, indexedAt: after.indexedAt, stale: false, initialized: true }
    }
  }
  response = { ok: true, result: { ...result, action: request.action } }
} catch (error) {
  if (request.action === 'status' && error.code === 'CATALOG_NOT_INITIALIZED') {
    response = { ok: true, result: { action: 'status', initialized: false, stale: true, revision: null } }
  } else response = { ok: false, error: { code: error.code || 'CATALOG_ERROR', message: error.message, details: error.details } }
} finally { catalog?.close() }
parentPort.postMessage(response)

function typedError(code, message, status) { return Object.assign(new Error(message), { code, details: { status } }) }
function assertFresh(status) {
  if (status.stale) throw typedError('CATALOG_STALE', '文件已变化，请先显式同步目录', status)
  if (request.expectedRevision !== undefined && request.expectedRevision !== status.revision) throw typedError('CATALOG_REVISION_MISMATCH', '目录版本与本次引用不一致，请重新查询', status)
}
