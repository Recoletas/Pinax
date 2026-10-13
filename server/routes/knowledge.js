// Read-only knowledge boundary. Default: pinned local kit runtime. Explicit endpoint: external kit protocol.
import { Router } from 'express'
import { createKnowledgeRuntime } from '../services/knowledgeRuntime.js'
import { createLocalMirrorService } from '../services/localMirrorService.js'
import {
  KNOWLEDGE_READ_VERBS,
  resolveKitProtocolPlaneEndpoint
} from '../../shared/kitProtocolPlane.js'

const PROJECT_ID_RE = /^proj_[A-Za-z0-9_]+$/
const UPSTREAM_TIMEOUT_MS = 8000

export function createKnowledgeRouter({
  fetchImpl = fetch,
  endpoint = process.env.PINAX_KIT_PROTOCOL_PORT ? resolveKitProtocolPlaneEndpoint(process.env) : null,
  runtime = createKnowledgeRuntime(),
  service = createLocalMirrorService()
} = {}) {
  const upstream = endpoint ? new URL(endpoint) : null
  if (upstream && !['127.0.0.1', 'localhost', '[::1]'].includes(upstream.hostname)) throw new Error('knowledge-protocol-plane-must-use-loopback')
  const router = Router()
  router.use((_req, res, next) => {
    if (String(process.env.PINAX_PUBLIC_ORIGINS || '').trim()) return res.status(403).json({ error: { code: 'ERR_LOCAL_ONLY', message: '项目知识检索仅限本机部署使用。' } })
    next()
  })

  const unavailable = (res, detail) => res.status(503).json({
    error: {
      code: 'KIT_PROTOCOL_PLANE_UNAVAILABLE',
      message: `知识服务尚未连接（${detail}），请先启动本机 kit 内核与协议服务。现有资料仍可阅读。`
    }
  })

  /** 转发一个只读检索动词到 8431。payload={verb,args,location?}；出错一律结构化 JSON，不冒充空结果。 */
  async function forwardKernelVerb(res, payload) {
    if (!KNOWLEDGE_READ_VERBS.includes(payload.verb)) {
      return res.status(400).json({ error: { code: 'VERB_FORBIDDEN', message: `知识代理只允许只读检索动词（${KNOWLEDGE_READ_VERBS.join(' / ')}）` } })
    }
    if (!upstream) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(new Error('知识检索超时，请重试。')), 60000)
      const onClose = () => { if (!res.writableEnded) controller.abort() }
      res.once('close', onClose)
      try {
        const entry = payload.args.project ? service.listProjects().find(item => item.projectId === payload.args.project) : null
        if (payload.args.project && !entry) return res.status(404).json({ error: { code: 'PROJECT_NOT_REGISTERED', message: '本书本地项目绑定已失效，请重新打开项目。' } })
        const result = await runtime.run(payload.verb, payload.args, entry, { signal: controller.signal })
        for (const key of ['worldbookId', 'worldbookRevision', 'indexRevision']) {
          if (payload.expected?.[key] && String(payload.expected[key]) !== String(result.coverage?.[key] || '')) return res.status(409).json({ error: { code: 'STALE_INDEX', message: '本地资料与当前版本不一致，请同步本书资料后重新检索。' } })
        }
        if (entry && !service.listProjects().some(item => item.projectId === entry.projectId && item.bookId === entry.bookId && item.rootPath === entry.rootPath)) return res.status(409).json({ error: { code: 'PROJECT_CHANGED', message: '项目绑定已变化，请重新检索。' } })
        res.setHeader('cache-control', 'no-store')
        return res.json(result)
      } catch (error) {
        return res.status(error.status || 503).json({ error: { code: error.code || 'KNOWLEDGE_UNAVAILABLE', message: error.message || '知识检索暂不可用。' } })
      } finally { clearTimeout(timer); res.removeListener('close', onClose) }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
    const send = async (withLocation) => {
      const body = { verb: payload.verb, args: payload.args, ...(withLocation && payload.location ? { location: payload.location } : {}) }
      const response = await fetchImpl(new URL('/api/kernel-verb', upstream), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        signal: controller.signal, body: JSON.stringify(body)
      })
      return { response, text: await response.text() }
    }
    let response, text
    try {
      const received = await send(true)
      // A mount conflict may point at another project: never retry without its location.
      ;({ response, text } = received)
    } catch (error) {
      return unavailable(res, error?.name === 'AbortError' ? '请求超时' : '连接失败')
    } finally { clearTimeout(timer) }
    let body = null
    try { body = JSON.parse(text) } catch { /* 非 JSON 载荷按失败处理 */ }
    if (!response.ok || body === null || typeof body !== 'object' || Array.isArray(body)) {
      const message = String(body?.error || body?.message || text || '').slice(0, 300) || `HTTP ${response.status}`
      const code = response.status === 401 ? 'KIT_PROTOCOL_PLANE_AUTH_REQUIRED' : 'KIT_VERB_FAILED'
      const status = response.status === 401 || response.ok ? 502 : response.status
      return res.status(status).json({ error: { code, message } })
    }
    for (const key of ['worldbookId', 'worldbookRevision', 'indexRevision']) {
      if (payload.expected?.[key] && String(payload.expected[key]) !== String(body.coverage?.[key] || '')) return res.status(409).json({ error: { code: 'STALE_INDEX', message: '外部知识服务未确认当前资料版本，请同步后重试。' } })
    }
    const project = payload.args.project ? service.listProjects().find(item => item.projectId === payload.args.project) : null
    if (payload.location && project?.rootPath !== payload.location) return res.status(409).json({ error: { code: 'PROJECT_CHANGED', message: '项目绑定已变化，请重新检索。' } })
    res.setHeader('cache-control', 'no-store')
    return res.json(body)
  }

  /**
   * kb 双根的可选项目侧入参：projectId → kit 形参 project。
   * 缺省（本书未绑定项目）= 不传，行为与历史一致（只查全局语料）；形状非法 = 400 显式拒绝，
   * 不做「悄悄丢掉这一维」的兼容，否则「本书档为什么没参与」在代理层就成了隐形故障。
   */
  function kbProjectArg(req) {
    const explicit = String(req.body?.projectId || '').trim()
    const bookId = String(req.body?.bookId || '').trim()
    const projectId = explicit || String(service.listProjects().find(item => String(item.bookId) === bookId && bookId)?.projectId || '')
    if (!projectId) return { value: '' }
    if (!PROJECT_ID_RE.test(projectId)) {
      return { error: { code: 'INVALID_PROJECT_ID', message: 'projectId 必须形如 proj_<字母/数字/下划线>' } }
    }
    const entry = service.listProjects().find(item => item.projectId === projectId)
    if (!entry || bookId && String(entry.bookId) !== bookId) return { error: { code: 'PROJECT_NOT_REGISTERED', message: '项目与当前作品绑定不一致。' } }
    return { value: projectId }
  }

  router.post('/worldbook-search', async (req, res) => {
    try {
      const bookId = String(req.body?.bookId || '').trim()
      const projectId = String(req.body?.projectId || service.listProjects().find(item => bookId && String(item.bookId) === bookId)?.projectId || '').trim()
      const q = String(req.body?.q ?? '').trim()
      if (!PROJECT_ID_RE.test(projectId)) {
        return res.status(400).json({ error: { code: 'INVALID_PROJECT_ID', message: 'projectId 必须形如 proj_<字母/数字/下划线>' } })
      }
      if (!q) return res.status(400).json({ error: { code: 'INVALID_QUERY', message: '检索词 q 不能为空' } })
      const entry = service.listProjects().find((item) => item?.projectId === projectId)
      if (!entry?.rootPath || bookId && String(entry.bookId) !== bookId) {
        return res.status(404).json({ error: { code: 'PROJECT_NOT_REGISTERED', message: `本地项目注册表中没有 ${projectId}，无法推导 kit 挂载位置` } })
      }
      const args = { project: projectId, q: q.slice(0, 2000) }
      const cat = typeof req.body?.cat === 'string' ? req.body.cat.trim() : ''
      if (cat) args.cat = cat.slice(0, 100)
      const k = Number(req.body?.k)
      if (Number.isInteger(k) && k > 0) args.k = Math.min(k, 30)
      return await forwardKernelVerb(res, { verb: 'worldbook_search', args, location: entry.rootPath, expected: { worldbookId: req.body?.worldbookId, worldbookRevision: req.body?.worldbookRevision } })
    } catch (error) {
      return res.status(500).json({ error: { code: 'KNOWLEDGE_PROXY_ERROR', message: String(error?.message || error) } })
    }
  })

  router.post('/kb-search', async (req, res) => {
    try {
      const q = String(req.body?.q ?? '').trim()
      if (!q) return res.status(400).json({ error: { code: 'INVALID_QUERY', message: '检索词 q 不能为空' } })
      const args = { q: q.slice(0, 2000) }
      const dir = typeof req.body?.dir === 'string' ? req.body.dir.trim() : ''
      if (dir) args.dir = dir.slice(0, 100)
      const k = Number(req.body?.k)
      if (Number.isInteger(k) && k > 0) args.k = Math.min(k, 30)
      const project = kbProjectArg(req)
      if (project.error) return res.status(400).json({ error: project.error })
      if (project.value) args.project = project.value
      return await forwardKernelVerb(res, { verb: 'kb_search', args, location: project.value ? service.listProjects().find(item => item.projectId === project.value)?.rootPath : undefined })
    } catch (error) {
      return res.status(500).json({ error: { code: 'KNOWLEDGE_PROXY_ERROR', message: String(error?.message || error) } })
    }
  })

  router.post('/kb-read', async (req, res) => {
    try {
      const ref = String(req.body?.ref ?? '').trim()
      if (/^(?:[A-Za-z]:|[/\\])/.test(ref) || ref.split(/[/\\]/).includes('..')) return res.status(400).json({ error: { code: 'INVALID_REF', message: '引用必须是知识库内的相对路径或卡片ID' } })
      if (ref.length > 1000) return res.status(400).json({ error: { code: 'INVALID_REF', message: '知识引用过长' } })
      if (!ref) return res.status(400).json({ error: { code: 'INVALID_REF', message: '卡片引用 ref 不能为空' } })
      const args = { ref }
      const maxChars = Number(req.body?.maxChars)
      if (Number.isInteger(maxChars) && maxChars > 0) args.max_chars = Math.min(maxChars, 20000)
      const project = kbProjectArg(req)
      if (project.error) return res.status(400).json({ error: project.error })
      if (project.value) args.project = project.value
      return await forwardKernelVerb(res, { verb: 'kb_read', args, location: project.value ? service.listProjects().find(item => item.projectId === project.value)?.rootPath : undefined, expected: { indexRevision: req.body?.indexRevision } })
    } catch (error) {
      return res.status(500).json({ error: { code: 'KNOWLEDGE_PROXY_ERROR', message: String(error?.message || error) } })
    }
  })

  return router
}
