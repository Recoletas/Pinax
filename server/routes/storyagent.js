import { createHash } from 'node:crypto'
import { Router } from 'express'
import { Readable } from 'node:stream'
import { KIT_TASK_PLANE_ENDPOINT } from '../../shared/kitTaskPlane.js'

// The runtime stays on loopback. Browser capabilities isolate task journals; no global list is exposed.
export function createStoryAgentRouter({ fetchImpl = fetch, endpoint = process.env.PINAX_ADAPTER_ENDPOINT || KIT_TASK_PLANE_ENDPOINT } = {}) {
  const upstream = new URL(endpoint)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(upstream.hostname)) throw new Error('storyagent-runtime-must-use-loopback')
  const router = Router()
  router.use(async (req, res) => {
    const health = req.method === 'GET' && req.path === '/healthz'
    const modelRead = req.method === 'GET' && req.path === '/model'
    const modelWrite = req.method === 'POST' && req.path === '/model'
    const token = String(req.get('x-pinax-agent-session') || '')
    if (!health && !modelRead && !modelWrite && !/^[a-f0-9]{64}$/.test(token)) return res.status(403).json({ error: 'agent-session-required' })
    const prefix = `pa_${createHash('sha256').update(token).digest('hex').slice(0, 24)}_`
    const create = req.method === 'POST' && req.path === '/v1/pinax/tasks'
    const task = /^\/v1\/pinax\/tasks\/([a-zA-Z0-9_-]{1,80})(?:\/(resume|cancel))?$/.exec(req.path)
    if (!health && !modelRead && !modelWrite && !create && !(task && task[1].startsWith(prefix) && ((req.method === 'GET' && !task[2]) || (req.method === 'POST' && task[2])))) {
      return res.status(404).json({ error: 'agent-route-not-found' })
    }
    if (modelWrite && process.env.PINAX_PUBLIC_ORIGINS) return res.status(403).json({ error: 'ERR_LOCAL_ONLY', message: 'agent 模型切换仅限本机使用；公网部署已禁用。' })
    if (create && (!req.body?.taskId || !String(req.body.taskId).startsWith(prefix))) return res.status(403).json({ error: 'agent-task-scope-mismatch' })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), health || modelRead ? 2000 : modelWrite ? 5000 : 250000)
    res.on('close', () => controller.abort())
    try {
      const response = await fetchImpl(new URL(req.path, upstream), {
        method: req.method, signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        ...(req.method === 'POST' ? { body: JSON.stringify(req.body || {}) } : {})
      })
      res.status(response.status)
      res.setHeader('content-type', response.headers.get('content-type') || 'application/json')
      res.setHeader('cache-control', 'no-store')
      res.setHeader('x-accel-buffering', 'no')
      if (!response.body) return res.end()
      await new Promise((resolve, reject) => {
        const source = Readable.fromWeb(response.body)
        source.on('error', reject)
        res.on('finish', resolve)
        res.on('close', resolve)
        source.pipe(res)
      })
    } catch {
      if (!res.headersSent && !res.destroyed) res.status(503).json({ error: 'agent-runtime-unavailable', message: '写作工具暂不可用，请使用讨论故事或查阅资料。' })
      else if (!res.destroyed) res.end()
    } finally { clearTimeout(timer) }
  })
  return router
}
