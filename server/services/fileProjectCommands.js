import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { hashCanonicalValue } from '@pinax/core/experience/run/runContract'
import { createFileProjectStores } from './fileProjectStores.js'
import { createLocalMirrorService } from './localMirrorService.js'
import { recoverMirrorTransaction } from './localMirrorTransaction.js'
import { safePath } from './projectCatalog/sources.js'

const error = (code, message) => Object.assign(new Error(message), { code })
const sha = value => createHash('sha256').update(value).digest('hex')
const methods = { chapter: ['list', 'read', 'create', 'save', 'remove'], entry: ['list', 'read', 'create', 'update', 'remove'], node: ['list', 'read', 'create', 'update', 'move', 'remove'], edge: ['list', 'add', 'remove'] }
const namespaces = { chapter: 'chapters', entry: 'entries', node: 'nodes', edge: 'edges' }

// Explicit local application commands. MCP chapter_write remains proposal-only;
// it does not call this API or gain a direct formal write capability.
export async function runFileProjectCommand(request, { service = createLocalMirrorService() } = {}) {
  if (String(process.env.PINAX_PUBLIC_ORIGINS || '').trim()) throw error('ERR_LOCAL_ONLY', '正式文件操作仅限本地项目')
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw error('ERR_INVALID_INPUT', '需要文件操作对象')
  const allowed = ['projectPath', 'projectId', 'action', 'entity', 'id', 'input', 'operationId', 'expectedSnapshot']
  if (Object.keys(request).some(key => !allowed.includes(key))) throw error('ERR_INVALID_INPUT', '未知文件操作参数')
  if (request.projectPath !== undefined && (typeof request.projectPath !== 'string' || !path.isAbsolute(request.projectPath))) throw error('ERR_INVALID_INPUT', 'projectPath必须是绝对路径')
  const entry = service.listProjects().find(item => request.projectPath ? path.resolve(item.rootPath) === path.resolve(request.projectPath) : item.projectId === request.projectId || item.bookId === request.projectId)
  if (!entry?.bookId) throw error('ERR_PROJECT_UNBOUND', '需要明确绑定bookId的本地项目')
  const root = path.resolve(entry.rootPath)
  if (request.action === 'recover') {
    for (const candidate of [root, `${root}.pinax-before-sync`]) {
      if (!fs.existsSync(candidate)) continue
      const marker = JSON.parse(fs.readFileSync(safePath(candidate, '.pinax/project.json'), 'utf8'))
      if (marker.projectId !== entry.projectId) throw error('ERR_PROJECT_IDENTITY', '恢复目录属于另一项目')
    }
    recoverMirrorTransaction(root)
  }
  const marker = JSON.parse(fs.readFileSync(safePath(root, '.pinax/project.json'), 'utf8'))
  if (marker.projectId !== entry.projectId) throw error('ERR_PROJECT_IDENTITY', '项目标记与注册表不符')
  const action = request.action || 'snapshot'
  const writing = !['snapshot', 'recover', 'read', 'list'].includes(action)
  if (action !== 'snapshot' && action !== 'recover' && (!Object.hasOwn(methods, request.entity) || !methods[request.entity].includes(action))) throw error('ERR_INVALID_INPUT', '不支持的内容类型或操作')
  if (writing && (typeof request.operationId !== 'string' || !request.operationId.trim())) throw error('ERR_INVALID_INPUT', '正式写入需要operationId，以便失败后重试同一操作')
  const fingerprint = writing ? hashCanonicalValue({ projectId: marker.projectId, entity: request.entity, action, id: request.id, input: request.input, expectedSnapshot: request.expectedSnapshot }) : null
  const receiptPath = writing ? safePath(root, `.pinax/operations/${sha(request.operationId)}.json`, { missing: true }) : null
  if (receiptPath && fs.existsSync(receiptPath)) {
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'))
    if (receipt.projectId !== marker.projectId || receipt.fingerprint !== fingerprint) throw error('ERR_OPERATION_CONFLICT', '此操作编号已经用于其他请求')
    const current = createFileProjectStores({ root, service })
    const snapshot = current.snapshot()
    return { ...receipt.result, replayed: true, operationRevision: receipt.revision, snapshot: snapshot.revision === receipt.revision ? snapshot : null, requiresReload: snapshot.revision !== receipt.revision }
  }
  const stores = createFileProjectStores({ root, service, expectedSnapshot: request.expectedSnapshot,
    receipt: writing ? { operationId: request.operationId, projectId: marker.projectId, fingerprint } : null })
  if (action === 'snapshot' || action === 'recover') return { ok: true, book: stores.book(), snapshot: stores.snapshot() }
  const scope = request.entity === 'entry' ? stores.snapshot().worldbookId : stores.snapshot().bookId
  const api = stores[namespaces[request.entity]]
  const args = ['list'].includes(action) ? [scope] : ['create', 'add'].includes(action) ? [scope, request.input || {}]
    : ['read'].includes(action) ? [scope, request.id] : [scope, request.id, request.input || {}]
  const result = await api[action](...args)
  return { ...result, snapshot: stores.snapshot() }
}
