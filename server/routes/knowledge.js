// kit 知识检索代理（W1-A RAG 接线）：浏览器 → Pinax 同源代理 → 8431 协议面 POST /api/kernel-verb
// → 8421 内核。检索打分与一跳关系扩展的唯一实现在 kit 内核（kernel-view worldbookSearch /
// kbSearch），本路由只做入参校验与转发，不重算任何分数。
//   POST /api/knowledge/worldbook-search {projectId, q, cat?, k?}
//       → {verb:'worldbook_search', args:{project, q, cat?, k?}, location}
//   POST /api/knowledge/kb-search {q, dir?, k?}   → {verb:'kb_search', args:{q, dir?, k?}}（语料在 kit 仓，无 location）
//   POST /api/knowledge/kb-read  {ref, maxChars?} → {verb:'kb_read', args:{ref, max_chars?}}
// 纪律：
// - location（junction 挂载点）恒由 server 从本地项目注册表（service.listProjects() 的 rootPath）
//   推导，绝不信任浏览器入参——body 里的 location 字段一律忽略；项目未注册 → 404 显式错误。
// - 只读：转发动词限定 shared/kitProtocolPlane.js 的 KNOWLEDGE_READ_VERBS，永不发 flow_* 写动词。
// - 显式失败：8431 不可达/超时 → KIT_PROTOCOL_PLANE_UNAVAILABLE（含启动指引），不静默回落、
//   不冒充空结果；单次转发总超时 8s 防挂死。
// - junction 幂等：location 首调挂载（mklink /J）；kit 对已存在的 projects/<pid> 回 409 且不执行
//   动词（kit/storyharness/src/serve.ts kernel-verb 段）——此时剥 location 重发一次，续用既有挂载。
import { Router } from 'express'
import { createLocalMirrorService } from '../services/localMirrorService.js'
import {
  KNOWLEDGE_READ_VERBS,
  resolveKitProtocolPlaneEndpoint
} from '../../shared/kitProtocolPlane.js'

const PROJECT_ID_RE = /^proj_[A-Za-z0-9_]+$/
const UPSTREAM_TIMEOUT_MS = 8000

export function createKnowledgeRouter({
  fetchImpl = fetch,
  endpoint = resolveKitProtocolPlaneEndpoint(process.env),
  service = createLocalMirrorService()
} = {}) {
  const upstream = new URL(endpoint)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(upstream.hostname)) throw new Error('knowledge-protocol-plane-must-use-loopback')
  const router = Router()

  const unavailable = (res, detail) => res.status(503).json({
    error: {
      code: 'KIT_PROTOCOL_PLANE_UNAVAILABLE',
      message: `kit 协议面（8431）不可达，知识检索暂不可用（${detail}）。请在 kit 仓（storyflow-kit）启动协议面：cd kit/storyharness && npx tsx src/cli.ts web（先拉起 8421 内核，并钉 STORYHARNESS_WORKSPACE）；本机可用 node scripts/kit-protocol-probe.mjs 自检。`
    }
  })

  /** 转发一个只读检索动词到 8431。payload={verb,args,location?}；出错一律结构化 JSON，不冒充空结果。 */
  async function forwardKernelVerb(res, payload) {
    if (!KNOWLEDGE_READ_VERBS.includes(payload.verb)) {
      return res.status(400).json({ error: { code: 'VERB_FORBIDDEN', message: `知识代理只允许只读检索动词（${KNOWLEDGE_READ_VERBS.join(' / ')}）` } })
    }
    const send = (withLocation) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
      const body = withLocation && payload.location ? payload : { verb: payload.verb, args: payload.args }
      return fetchImpl(new URL('/api/kernel-verb', upstream), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(body)
      }).finally(() => clearTimeout(timer))
    }
    const fail = (error) => unavailable(res, error?.name === 'AbortError' ? `等待 ${UPSTREAM_TIMEOUT_MS}ms 超时` : String(error?.message || error))
    let response
    try {
      response = await send(true)
    } catch (error) {
      return fail(error)
    }
    if (response.status === 409 && payload.location) {
      // junction 已存在（此前挂载过）→ kit 409 且动词未执行：剥 location 重发，续用既有挂载
      try {
        response = await send(false)
      } catch (error) {
        return fail(error)
      }
    }
    const text = await response.text()
    let body = null
    try { body = JSON.parse(text) } catch { /* 非 JSON 载荷按失败处理 */ }
    if (!response.ok || body === null || typeof body !== 'object') {
      const message = String(body?.error || body?.message || text || '').slice(0, 300) || `HTTP ${response.status}`
      const code = response.status === 401 ? 'KIT_PROTOCOL_PLANE_AUTH_REQUIRED' : 'KIT_VERB_FAILED'
      const status = response.status === 401 ? 502 : response.status
      return res.status(status).json({ error: { code, message } })
    }
    res.setHeader('cache-control', 'no-store')
    return res.json(body)
  }

  router.post('/worldbook-search', async (req, res) => {
    try {
      const projectId = String(req.body?.projectId || '').trim()
      const q = String(req.body?.q ?? '').trim()
      if (!PROJECT_ID_RE.test(projectId)) {
        return res.status(400).json({ error: { code: 'INVALID_PROJECT_ID', message: 'projectId 必须形如 proj_<字母/数字/下划线>' } })
      }
      if (!q) return res.status(400).json({ error: { code: 'INVALID_QUERY', message: '检索词 q 不能为空' } })
      const entry = service.listProjects().find((item) => item?.projectId === projectId)
      if (!entry?.rootPath) {
        return res.status(404).json({ error: { code: 'PROJECT_NOT_REGISTERED', message: `本地项目注册表中没有 ${projectId}，无法推导 kit 挂载位置` } })
      }
      const args = { project: projectId, q }
      const cat = typeof req.body?.cat === 'string' ? req.body.cat.trim() : ''
      if (cat) args.cat = cat
      const k = Number(req.body?.k)
      if (Number.isInteger(k) && k > 0) args.k = Math.min(k, 30)
      return await forwardKernelVerb(res, { verb: 'worldbook_search', args, location: entry.rootPath })
    } catch (error) {
      return res.status(500).json({ error: { code: 'KNOWLEDGE_PROXY_ERROR', message: String(error?.message || error) } })
    }
  })

  router.post('/kb-search', async (req, res) => {
    try {
      const q = String(req.body?.q ?? '').trim()
      if (!q) return res.status(400).json({ error: { code: 'INVALID_QUERY', message: '检索词 q 不能为空' } })
      const args = { q }
      const dir = typeof req.body?.dir === 'string' ? req.body.dir.trim() : ''
      if (dir) args.dir = dir
      const k = Number(req.body?.k)
      if (Number.isInteger(k) && k > 0) args.k = k
      return await forwardKernelVerb(res, { verb: 'kb_search', args })
    } catch (error) {
      return res.status(500).json({ error: { code: 'KNOWLEDGE_PROXY_ERROR', message: String(error?.message || error) } })
    }
  })

  router.post('/kb-read', async (req, res) => {
    try {
      const ref = String(req.body?.ref ?? '').trim()
      if (!ref) return res.status(400).json({ error: { code: 'INVALID_REF', message: '卡片引用 ref 不能为空' } })
      const args = { ref }
      const maxChars = Number(req.body?.maxChars)
      if (Number.isInteger(maxChars) && maxChars > 0) args.max_chars = maxChars
      return await forwardKernelVerb(res, { verb: 'kb_read', args })
    } catch (error) {
      return res.status(500).json({ error: { code: 'KNOWLEDGE_PROXY_ERROR', message: String(error?.message || error) } })
    }
  })

  return router
}
