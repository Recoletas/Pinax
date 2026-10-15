// 本地文件镜像路由（项目标准范式 pinax-project@1）：
// GET  /api/localmirror/location     —— 文档根（未绑定项目的缺省落点）
// GET  /api/localmirror/appdata     —— 应用侧数据目录（注册表/索引所在，"代码安装位置附近"）
// GET  /api/localmirror/projects     —— 已打开项目注册表
// POST /api/localmirror/projects/create {path,name,kind,bookId?} —— 任意空目录创建项目（Obsidian 建库）
// POST /api/localmirror/projects/open   {path,bookId?}          —— 打开已有项目文件夹
// POST /api/localmirror/sync     {book,worldbook,logs,materials,media} —— 同步（落点=注册表绑定根 > 文档根）
// POST /api/localmirror/index    {books} —— 应用侧 index.json
// GET  /api/localmirror/worldbook?path=<项目根或「世界书」目录绝对路径> —— 世界书读回（契约 v2）
// POST /api/localmirror/worldbook-validate {files:{relPath:text}} —— 世界书纯校验（不落盘）
// GET  /api/localmirror/book?path=<项目根绝对路径>   —— 书读回（正文/大纲/构思/元数据，W6·C）
// GET  /api/localmirror/sources?path=<项目根或归档目录绝对路径> —— 资料归档读回（W6·C）
// GET  /api/localmirror/rules?path=<项目根绝对路径> | ?bookId=<绑定书 ID> —— 本地约束读回（「约束」目录，W6·C）
// GET  /api/localmirror/lexicon?path=<项目根绝对路径> | ?bookId=<绑定书 ID> —— 词汇表读回（pinax-lexicon@1）
// 安全：open/create/worldbook/book/sources/rules 读写是"任意路径"能力面，公网部署（PINAX_PUBLIC_ORIGINS 非空）一律 403；路径必须是绝对路径。
import express from 'express'
import { createLocalMirrorService } from '../services/localMirrorService.js'
import { startFolderPick, getFolderPickResult } from '../services/nativeFolderPicker.js'

export function createLocalMirrorRouter({ service = createLocalMirrorService() } = {}) {
  const router = express.Router()
  const localOnly = (res) => {
    if (process.env.PINAX_PUBLIC_ORIGINS) {
      res.status(403).json({ error: 'ERR_LOCAL_ONLY', message: '任意路径项目能力仅限本机使用；公网部署已禁用。' })
      return false
    }
    return true
  }

  router.get('/capabilities', (_req, res) => res.json({ ok: true, localFiles: !Boolean(String(process.env.PINAX_PUBLIC_ORIGINS || '').trim()), protocolVersion: 2 }))
  router.use((_req, res, next) => { if (localOnly(res)) next() })

  router.get('/sync-state', (req, res) => {
    try { res.json({ ok: true, ...service.readSyncState(String(req.query.bookId || '')) }) }
    catch (error) { res.status(409).json({ ok: false, message: error.message }) }
  })

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
  // 内置文件夹浏览器数据源（local-only）：空路径=盘符+常用位置；否则列子目录 + pinax 徽标 + 顶层书稿计数
  router.get('/browse', (req, res) => {
    try {
      const result = service.browseDirectories(String(req.query.path || ''))
      return res.json({ ok: true, ...result })
    } catch (error) {
      const code = error?.code === 'ERR_INVALID_INPUT' || error?.code === 'ERR_DIR_NOT_FOUND' ? 400 : 500
      return res.status(code).json({ error: error?.code || 'ERR_MIRROR_WRITE', message: error.message })
    }
  })
  // 浏览器内新建文件夹（local-only）
  router.post('/browse/mkdir', (req, res) => {
    if (!localOnly(res)) return
    try {
      const target = service.createDirectory(String(req.body?.path || ''), String(req.body?.name || ''))
      return res.json({ ok: true, path: target })
    } catch (error) {
      const code = error?.code === 'ERR_INVALID_INPUT' || error?.code === 'ERR_DIR_NOT_FOUND' || error?.code === 'ERR_DIR_NOT_EMPTY' ? 400 : 500
      return res.status(code).json({ error: error?.code || 'ERR_MIRROR_WRITE', message: error.message })
    }
  })
  // Windows 原生文件夹选择器（local-only）：服务端拉起真实系统对话框，两步 start/result
  router.post('/projects/pick-folder/start', (req, res) => {
    if (!localOnly(res)) return
    try {
      const pick = startFolderPick({ initial: String(req.body?.initial || ''), description: '选择项目文件夹' })
      return res.json({ ok: true, pickId: pick.pickId, pid: pick.pid })
    } catch (error) {
      return res.status(500).json({ error: 'ERR_PICKER_START', message: error.message, fallback: true })
    }
  })
  router.get('/projects/pick-folder/result', (req, res) => {
    if (!localOnly(res)) return
    const result = getFolderPickResult(String(req.query.id || ''))
    return res.json({ ok: true, ...result })
  })
  // 反向导入数据源：读项目文件夹 正文/*.md 章节（不写库；书稿创建在浏览器侧）
  router.post('/projects/import-content', (req, res) => {
    if (!localOnly(res)) return
    try {
      const result = service.readProjectChapters(String(req.body?.path || ''))
      return res.json({ ok: true, ...result })
    } catch (error) {
      const code = error?.code === 'ERR_INVALID_INPUT' ? 400 : ['ERR_SYNC_CONFLICT', 'ERR_LOCAL_EDIT', 'ERR_REQUEST_REUSED'].includes(error?.code) ? 409 : 500
      return res.status(code).json({ error: error?.code || 'ERR_MIRROR_WRITE', message: error.message })
    }
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
      // 与 create/open/sync 对齐：已识别的客户端错误 4xx，注册表写盘等意外错误 500。
      const code = error?.code === 'ERR_PROJECT_NOT_FOUND' ? 404 : error?.code === 'ERR_INVALID_INPUT' ? 400 : 500
      return res.status(code).json({ error: error?.code || 'ERR_MIRROR_WRITE', message: error.message })
    }
  })
  router.post('/projects/remove', (req, res) => {
    if (!localOnly(res)) return
    try {
      service.removeProjectEntry(req.body || {})
      return res.json({ ok: true })
    } catch (error) {
      const code = error?.code === 'ERR_PROJECT_NOT_FOUND' ? 404 : error?.code === 'ERR_INVALID_INPUT' ? 400 : 500
      return res.status(code).json({ error: error?.code || 'ERR_MIRROR_WRITE', message: error.message })
    }
  })
  router.post('/projects/update', (req, res) => {
    if (!localOnly(res)) return
    try {
      const entry = service.updateProjectAt(req.body || {})
      return res.json({ ok: true, entry })
    } catch (error) {
      const code = error?.code === 'ERR_PROJECT_NOT_FOUND' || error?.code === 'ERR_NOT_A_PROJECT' ? 404 : error?.code === 'ERR_INVALID_INPUT' ? 400 : 500
      return res.status(code).json({ error: error?.code || 'ERR_MIRROR_WRITE', message: error.message })
    }
  })
  // 世界书读回（契约 §3.2，local-only）：项目根或「世界书」目录绝对路径 → { ok, worldbook, warnings }
  router.get('/worldbook', (req, res) => {
    if (!localOnly(res)) return
    try {
      const result = service.readWorldbookFolder(String(req.query.path || ''))
      return res.json({ ok: true, worldbook: result.worldbook, warnings: result.warnings })
    } catch (error) {
      const code = error?.code === 'ERR_INVALID_INPUT' || error?.code === 'ERR_DIR_NOT_FOUND' ? 400 : 500
      return res.status(code).json({ error: error?.code || 'ERR_MIRROR_READ', message: error.message })
    }
  })
  // 世界书纯校验（契约 §3.2，local-only；C 组预检复用）：{ files: { relPath: text } } → 逐文件 { relPath, ok, error? }
  router.post('/worldbook-validate', (req, res) => {
    if (!localOnly(res)) return
    try {
      return res.json({ ok: true, results: service.validateWorldbookFiles(req.body?.files) })
    } catch (error) {
      if (error?.code === 'ERR_INVALID_INPUT') return res.status(400).json({ error: 'ERR_INVALID_INPUT', message: error.message })
      return res.status(500).json({ error: 'ERR_MIRROR_READ', message: error.message })
    }
  })
  // 书读回（W6·C，local-only）：项目根绝对路径 → { ok, book: { id, title, kind, chapters, outline, explorations, ... }, warnings }
  router.get('/book', (req, res) => {
    if (!localOnly(res)) return
    try {
      const result = service.readBookFromFolder(String(req.query.path || ''))
      return res.json({ ok: true, book: result.book, warnings: result.warnings })
    } catch (error) {
      const code = error?.code === 'ERR_INVALID_INPUT' || error?.code === 'ERR_DIR_NOT_FOUND' ? 400 : 500
      return res.status(code).json({ error: error?.code || 'ERR_MIRROR_READ', message: error.message })
    }
  })
  // 资料归档读回（W6·C，local-only）：项目根或「资料/归档」目录绝对路径 → { ok, sources: [{docId, meta, chunks, chunkCount, file}], warnings }
  router.get('/sources', (req, res) => {
    if (!localOnly(res)) return
    try {
      const result = service.listArchivedSources(String(req.query.path || ''))
      return res.json({ ok: true, sources: result.sources, warnings: result.warnings, dir: result.dir })
    } catch (error) {
      const code = error?.code === 'ERR_INVALID_INPUT' || error?.code === 'ERR_DIR_NOT_FOUND' ? 400 : 500
      return res.status(code).json({ error: error?.code || 'ERR_MIRROR_READ', message: error.message })
    }
  })
  // 本地约束读回（W6·C，local-only）：?path=项目根 或 ?bookId=注册表绑定 → { ok, files: [{id,name,kind,content,sourceRef}], warnings }
  router.get('/rules', (req, res) => {
    if (!localOnly(res)) return
    try {
      const bookId = String(req.query.bookId || '').trim()
      const result = bookId
        ? service.readRuleFilesForBook(bookId)
        : service.readRuleFiles(String(req.query.path || ''))
      return res.json({ ok: true, files: result.files, warnings: result.warnings, dir: result.dir })
    } catch (error) {
      const code = error?.code === 'ERR_INVALID_INPUT' || error?.code === 'ERR_DIR_NOT_FOUND' ? 400 : 500
      return res.status(code).json({ error: error?.code || 'ERR_MIRROR_READ', message: error.message })
    }
  })
  // 词汇表读回（pinax-lexicon@1，local-only）：?path=项目根 或 ?bookId=注册表绑定 → { ok, exists, lexicon, warnings }
  router.get('/lexicon', (req, res) => {
    if (!localOnly(res)) return
    try {
      const bookId = String(req.query.bookId || '').trim()
      const result = bookId
        ? service.readLexiconForBook(bookId)
        : service.readLexicon(String(req.query.path || ''))
      return res.json({ ok: true, exists: result.exists === true, lexicon: result.lexicon, warnings: result.warnings })
    } catch (error) {
      const code = error?.code === 'ERR_INVALID_INPUT' || error?.code === 'ERR_DIR_NOT_FOUND' ? 400 : 500
      return res.status(code).json({ error: error?.code || 'ERR_MIRROR_READ', message: error.message })
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
