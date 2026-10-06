// 本地文件镜像路由：GET /api/localmirror/location（位置查询）、POST /api/localmirror/sync（同步一本书）。
// 位置由服务端唯一决定（PINAX_MIRROR_ROOT > <homedir>/Documents/Pinax）；浏览器不传路径，防注入。
import express from 'express'
import { createLocalMirrorService } from '../services/localMirrorService.js'

export function createLocalMirrorRouter({ service = createLocalMirrorService() } = {}) {
  const router = express.Router()
  router.get('/location', (_req, res) => {
    try {
      const root = service.resolveRoot()
      return res.json({ ok: true, root, schema: 'pinax-local-mirror@1' })
    } catch (error) {
      return res.status(500).json({ error: 'ERR_MIRROR_ROOT', message: error.message })
    }
  })
  router.post('/sync', (req, res) => {
    try {
      const result = service.mirrorBook(req.body)
      return res.json({ ok: true, dir: result.dir, counts: result.counts })
    } catch (error) {
      if (error?.code === 'ERR_INVALID_INPUT') return res.status(400).json({ error: 'ERR_INVALID_INPUT', message: error.message })
      return res.status(500).json({ error: 'ERR_MIRROR_WRITE', message: error.message })
    }
  })
  router.post('/index', (req, res) => {
    try {
      const file = service.writeProjectIndex(req.body?.books)
      return res.json({ ok: true, file })
    } catch (error) {
      if (error?.code === 'ERR_INVALID_INPUT') return res.status(400).json({ error: 'ERR_INVALID_INPUT', message: error.message })
      return res.status(500).json({ error: 'ERR_MIRROR_WRITE', message: error.message })
    }
  })
  return router
}
