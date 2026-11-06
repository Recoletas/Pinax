import fs from 'node:fs'
import path from 'node:path'
import { createMemoryBookStore } from '@pinax/core'
import { fail, ok } from '@pinax/core/contracts/result'
import { safePath } from './projectCatalog/sources.js'
import { createFileProjectStores } from './fileProjectStores.js'
import { createLocalMirrorService } from './localMirrorService.js'
import { mirrorBookFingerprint, mirrorDomainFingerprint } from './localMirrorTransaction.js'

// The Host creates/opens and binds a project folder first. Book CRUD never picks
// a disk location, invents a registry or recursively deletes an author's folder.
export function createFileBookStore({ service = createLocalMirrorService() } = {}) {
  function entryFor(id) { return service.listProjects().find(item => String(item.bookId || '') === String(id)) || null }
  function loaded(id) {
    const entry = entryFor(id)
    if (!entry) return null
    if (fs.existsSync(`${entry.rootPath}.pinax-sync.json`)) throw Object.assign(new Error('请先处理未完成的镜像事务'), { code: 'ERR_SYNC_RECOVERY' })
    const marker = JSON.parse(fs.readFileSync(safePath(entry.rootPath, '.pinax/project.json'), 'utf8'))
    if (marker.spec !== 'pinax-project@1' || marker.projectId !== entry.projectId) throw Object.assign(new Error('项目标记与绑定不符'), { code: 'ERR_PROJECT_IDENTITY' })
    const meta = path.join(entry.rootPath, 'meta.json')
    if (!fs.existsSync(meta)) return null
    const result = service.readBookFromFolder(entry.rootPath)
    return { entry, ...result }
  }
  function protect() {
    if (String(process.env.PINAX_PUBLIC_ORIGINS || '').trim()) throw Object.assign(new Error('作品文件Store仅限本地Host'), { code: 'ERR_LOCAL_ONLY' })
  }
  const wrap = fn => (...args) => { try { protect(); return fn(...args) } catch (error) { return fail(error.code || 'IO_FAILED', error.message) } }
  return {
    list: wrap(() => ok(service.listProjects().filter(item => item.bookId).map(item => loaded(item.bookId)?.book).filter(Boolean))),
    read: wrap(id => ok(loaded(id)?.book || null)),
    create: wrap(book => {
      const entry = entryFor(book?.id)
      if (!entry) return fail('INVALID_INPUT', '请先由项目Host创建并绑定文件夹，再建立作品记录')
      if (fs.existsSync(path.join(entry.rootPath, '.pinax/project.lock'))) return fail('ERR_PROJECT_LOCKED', '请先关闭桌面写会话')
      if (loaded(book.id)) return fail('DUPLICATE_BOOK', '作品已经存在')
      for (const name of ['正文', '大纲', '构思']) {
        const dir = path.join(entry.rootPath, name)
        if (fs.existsSync(dir) && fs.readdirSync(dir).length) return fail('INVALID_INPUT', '已有稿件目录需要显式导入，不能按空作品覆盖')
      }
      const result = createMemoryBookStore().create(book)
      if (!result.ok) return result
      service.mirrorBook({ book: { ...result.value, outline: { nodes: [], edges: [] }, explorations: [] }, domains: ['book'], baseRevision: service.readSyncState(book.id).revision,
        expectedBookFingerprint: mirrorBookFingerprint(entry.rootPath), expectedWorldbookFingerprint: mirrorDomainFingerprint(path.join(entry.rootPath, '世界书')) })
      return ok(service.readBookFromFolder(entry.rootPath).book)
    }),
    rename: wrap((id, title) => {
      const current = loaded(id)
      if (!current) return fail('BOOK_NOT_FOUND', '作品不存在')
      if (fs.existsSync(path.join(current.entry.rootPath, '.pinax/project.lock'))) return fail('ERR_PROJECT_LOCKED', '请先关闭桌面写会话')
      const files = createFileProjectStores({ root: current.entry.rootPath, service })
      const token = files.snapshot()
      const result = createMemoryBookStore({ books: new Map([[id, files.book()]]) }).rename(id, title)
      if (!result.ok) return result
      service.mirrorBook({ book: result.value, domains: ['book'], baseRevision: token.revision,
        expectedBookFingerprint: token.book, expectedWorldbookFingerprint: token.worldbook })
      return ok(service.readBookFromFolder(current.entry.rootPath).book)
    }),
    remove: wrap(id => {
      const current = loaded(id)
      if (!current) return fail('BOOK_NOT_FOUND', '作品不存在')
      service.removeProjectEntry({ projectId: current.entry.projectId })
      return ok(current.book)
    })
  }
}
