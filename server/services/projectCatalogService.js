import { Worker } from 'node:worker_threads'

export const CATALOG_ACTIONS = ['status', 'sync', 'search', 'list', 'read']
export const CATALOG_KINDS = ['chapter', 'worldbook-entry', 'outline-node', 'outline-edge', 'exploration', 'material-file', 'source-document', 'rule', 'document']
const fail = (code, message, details) => Object.assign(new Error(message), { code, details })

export function validateCatalogRequest(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('CATALOG_INPUT', '目录请求必须是对象')
  const allowed = ['action', 'query', 'kind', 'id', 'limit', 'offset', 'view', 'verifyContent', 'expectedRevision']
  if (Object.keys(input).some(key => !allowed.includes(key))) throw fail('CATALOG_INPUT', '目录请求包含未知参数')
  const request = { ...input, action: input.action ?? 'status' }
  if (!CATALOG_ACTIONS.includes(request.action)) throw fail('CATALOG_INPUT', '未知目录操作')
  if (request.kind !== undefined && !CATALOG_KINDS.includes(request.kind)) throw fail('CATALOG_INPUT', '未知目录内容类型')
  if (request.action === 'search' && (typeof request.query !== 'string' || !request.query.trim() || request.query.length > 500)) throw fail('CATALOG_QUERY', '请输入1至500字符的查询')
  if (request.action === 'read' && (!request.kind || typeof request.id !== 'string' || !request.id.trim())) throw fail('CATALOG_INPUT', '读取需要kind与条目id')
  if (request.view !== undefined && (request.action !== 'list' || !['summary', 'full'].includes(request.view))) throw fail('CATALOG_INPUT', 'view仅适用于list，可选summary或full')
  if (request.verifyContent !== undefined && typeof request.verifyContent !== 'boolean') throw fail('CATALOG_INPUT', 'verifyContent必须是布尔值')
  if (request.expectedRevision !== undefined && typeof request.expectedRevision !== 'string') throw fail('CATALOG_INPUT', 'expectedRevision必须是字符串')
  for (const [key, min, max] of [['limit', 1, request.action === 'search' ? 100 : 1000], ['offset', 0, 100000]]) {
    if (request[key] !== undefined && (!Number.isInteger(request[key]) || request[key] < min || request[key] > max)) throw fail('CATALOG_INPUT', `${key}超出有效范围`)
  }
  return request
}

// Keep at most one idle thread. Each job still opens a fresh connection against
// its own root, so switching projects or replacing a database is safe.
let idleWorker = null
function releaseWorker(worker) {
  if (idleWorker) { void worker.terminate(); return }
  idleWorker = worker
  worker.unref()
}
function acquireWorker() {
  if (idleWorker) {
    const worker = idleWorker
    idleWorker = null
    worker.ref()
    return worker
  }
  const worker = new Worker(new URL('./projectCatalog/worker.js', import.meta.url))
  worker.on('error', () => { if (idleWorker === worker) idleWorker = null })
  worker.once('exit', () => { if (idleWorker === worker) idleWorker = null })
  return worker
}

export function runProjectCatalog(root, input, { expectedProjectId, signal } = {}) {
  if (String(process.env.PINAX_PUBLIC_ORIGINS || '').trim()) return Promise.reject(fail('CATALOG_LOCAL_ONLY', '派生目录仅限本地项目'))
  let request
  try {
    if (typeof root !== 'string' || !root.trim()) throw fail('CATALOG_PATH', '需要本地项目路径')
    request = validateCatalogRequest(input)
  } catch (error) { return Promise.reject(error) }
  if (signal?.aborted) return Promise.reject(fail('CATALOG_CANCELLED', '目录请求已取消'))
  return new Promise((resolve, reject) => {
    const worker = acquireWorker()
    function cleanup() {
      worker.off('message', onMessage)
      worker.off('error', onError)
      worker.off('exit', onExit)
      signal?.removeEventListener('abort', cancel)
    }
    function onMessage(message) {
      cleanup()
      releaseWorker(worker)
      if (message.ok) resolve(message.result)
      else reject(fail(message.error.code, message.error.message, message.error.details))
    }
    function onError(error) {
      cleanup()
      reject(fail('CATALOG_WORKER_FAILED', error.message))
    }
    function onExit(code) { onError(new Error(`目录Worker未返回结果（${code}）`)) }
    function cancel() {
      cleanup()
      void worker.terminate()
      reject(fail('CATALOG_CANCELLED', '目录请求已取消'))
    }
    worker.once('message', onMessage)
    worker.once('error', onError)
    worker.once('exit', onExit)
    signal?.addEventListener('abort', cancel, { once: true })
    if (signal?.aborted) cancel()
    else worker.postMessage({ root, request, expectedProjectId })
  })
}
