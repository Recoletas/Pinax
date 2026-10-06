// 本地文件镜像路由（项目标准范式 pinax-project@1）：
// GET  /api/localmirror/location     —— 文档根（未绑定项目的缺省落点）
// GET  /api/localmirror/appdata     —— 应用侧数据目录（注册表/索引所在，"代码安装位置附近"）
// GET  /api/localmirror/projects     —— 已打开项目注册表
// POST /api/localmirror/projects/create {path,name,kind,bookId?} —— 任意空目录创建项目（Obsidian 建库）
// POST /api/localmirror/projects/open   {path,bookId?}          —— 打开已有项目文件夹
// POST /api/localmirror/sync     {book,worldbook,logs,materials,media} —— 同步（落点=注册表绑定根 > 文档根）
// POST /api/localmirror/index    {books} —— 应用侧 index.json
// 安全：open/create 是"任意路径"能力面，公网部署（PINAX_PUBLIC_ORIGINS 非空）一律 403；路径必须是绝对路径。
import express from 'express'
import { createLocalMirrorService } from '../services/localMirrorService.js'

export function createLocalMirrorRouter({ service = createLocalMirrorService() } = {}) {
  const router = express.Router()
  const localOnly = (res) => {
    if (process.env.PINAX_PUBLIC_ORIGINS) {
      res.status(403).json({ error: 'ERR_LOCAL_ONLY', message: '任意路径项目能力仅限本机使用；公网部署已禁用。' })
      return false
    }
    return true
  }

  router.get('/location', (_req, res) => {
    try {
      return res.json({ ok: true, root: service.resolveRoot(), schema: 'pinax-project-fs@2' })
    } catch (error) {
      return res.status(500).json({ error: 'ERR_MIRROR_ROOT', message: error.message })
    }
  })
  router.get('/appdata', (_req, res) => {
    try {
      return res.json({ ok: true, appData: service.resolveAppDataDir() })
    } catch (error) {
      return res.status(500).json({ error: 'ERR_MIRROR_ROOT', message: error.message })
    }
  })
  router.get('/projects', (_req, res) => {
    return res.json({ ok: true, projects: service.listProjects() })
  })
  router.post('/projects/create', (req, res) => {
    if (!localOnly(res)) return
    try {
      const result = service.createProjectAt(req.body || {})
      return res.json({ ok: true, manifest: result.manifest, entry: result.entry })
    } catch (error) {
      const code = error?.code === 'ERR_INVALID_INPUT' || error?.code === 'ERR_DIR_NOT_EMPTY' ? 400 : 500
      return res.status(code).json({ error: error?.code || 'ERR_MIRROR_WRITE', message: error.message })
    }
  })
  router.post('/projects/open', (req, res) => {
    if (!localOnly(res)) return
    try {
      const result = service.openProjectAt(req.body || {})
      return res.json({ ok: true, manifest: result.manifest, entry: result.entry })
    } catch (error) {
      const code = error?.code === 'ERR_INVALID_INPUT' || error?.code === 'ERR_NOT_A_PROJECT' || error?.code === 'ERR_SPEC_MISMATCH' ? 400 : 500
      return res.status(code).json({ error: error?.code || 'ERR_MIRROR_WRITE', message: error.message })
    }
  })
  router.post('/projects/bind', (req, res) => {
    if (!localOnly(res)) return
    try {
      const entry = service.setProjectBinding(req.body || {})
      return res.json({ ok: true, entry })
    } catch (error) {
      const code = error?.code === 'ERR_PROJECT_NOT_FOUND' ? 404 : 400
      return res.status(code).json({ error: error?.code || 'ERR_MIRROR_WRITE', message: error.message })
    }
  })
  router.post('/projects/remove', (req, res) => {
    if (!localOnly(res)) return
    try {
      service.removeProjectEntry(req.body || {})
      return res.json({ ok: true })
    } catch (error) {
      const code = error?.code === 'ERR_PROJECT_NOT_FOUND' ? 404 : 400
      return res.status(code).json({ error: error?.code || 'ERR_MIRROR_WRITE', message: error.message })
    }
  })
  router.post('/sync', (req, res) => {
    try {
      const result = service.mirrorBook(req.body)
      return res.json({ ok: true, dir: result.dir, counts: result.counts, projectRoot: result.projectRoot })
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
