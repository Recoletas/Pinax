import fs from 'node:fs'
import path from 'node:path'
import {
  createMemoryChapterStore, createMemoryWorldbookEntryStore, createMemoryOutlineNodeStore, createMemoryOutlineEdgeStore,
  createChapterService, createWorldbookEntryService, createOutlineNodeService, createOutlineEdgeService
} from '@pinax/core'
import { fail } from '@pinax/core/contracts/result'
import { safePath } from './projectCatalog/sources.js'
import { createLocalMirrorService } from './localMirrorService.js'
import { mirrorBookFingerprint, mirrorDomainFingerprint } from './localMirrorTransaction.js'

const clone = value => JSON.parse(JSON.stringify(value))
const error = (code, message) => Object.assign(new Error(message), { code })

// The Core reference adapters are temporary working copies only. Every mutation
// is acknowledged after the existing mirror transaction durably installs files.
export function createFileProjectStores({ root, service = createLocalMirrorService(), expectedSnapshot = null, receipt = null } = {}) {
  if (String(process.env.PINAX_PUBLIC_ORIGINS || '').trim()) throw error('ERR_LOCAL_ONLY', '正式文件写入仅限本地项目')
  root = fs.realpathSync(root)
  if (fs.existsSync(`${root}.pinax-sync.json`)) throw error('ERR_SYNC_RECOVERY', '请先处理未完成的项目镜像事务')
  const manifest = JSON.parse(fs.readFileSync(safePath(root, '.pinax/project.json'), 'utf8'))
  if (manifest.spec !== 'pinax-project@1' || !manifest.projectId) throw error('ERR_NOT_A_PROJECT', '需要合法本地项目')
  const bound = service.listProjects().find(item => path.resolve(item.rootPath) === root)
  if (bound && bound.projectId !== manifest.projectId) throw error('ERR_PROJECT_IDENTITY', '项目标记与绑定不符')
  if (!bound?.bookId) throw error('ERR_PROJECT_UNBOUND', '正式写入需要已绑定bookId的项目，不从活动作品猜测')
  if (fs.existsSync(path.join(root, '.pinax/project.lock'))) throw error('ERR_PROJECT_LOCKED', '项目正在由桌面端持有，请先关闭桌面写会话')
  let snapshot = load()
  function load() {
    const before = { book: mirrorBookFingerprint(root), worldbook: mirrorDomainFingerprint(path.join(root, '世界书')) }
    const loaded = service.readBookFromFolder(root)
    // Never turn a truncated/ambiguous read into a whole-domain replacement.
    const metadata = fs.existsSync(path.join(root, 'meta.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'meta.json'), 'utf8')) : null
    for (const [directory, records, bindings] of [['正文', loaded.book.chapters, metadata?.chapterFiles], ['构思', loaded.book.explorations, metadata?.explorationFiles]]) {
      const dir = path.join(root, directory)
      const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => /\.(md|txt)$/iu.test(name)) : []
      if (names.length !== records.length || Object.keys(bindings || {}).some(name => !names.includes(name))) throw error('ERR_INCOMPLETE_READ', `${directory}未完整读取，不能保存半份项目`)
      if (new Set(records.map(item => item.id)).size !== records.length) throw error('ERR_DOCUMENT_METADATA', `${directory}存在重复ID`)
    }
    const wb = fs.existsSync(path.join(root, '世界书')) ? service.readWorldbookFolder(root) : { worldbook: { id: loaded.book.worldbookId || '', name: '', entries: [] }, warnings: [] }
    if (loaded.book.worldbookId && wb.worldbook.id && loaded.book.worldbookId !== wb.worldbook.id) throw error('ERR_WORLD_BINDING', '作品关联的世界书与文件身份不一致')
    const version = fs.existsSync(path.join(root, '.pinax/sync-manifest.json')) ? JSON.parse(fs.readFileSync(path.join(root, '.pinax/sync-manifest.json'), 'utf8')).revision : 0
    const token = { ...before, revision: version, projectId: manifest.projectId, bookId: bound.bookId, worldbookId: wb.worldbook.id || null }
    if (before.book !== mirrorBookFingerprint(root) || before.worldbook !== mirrorDomainFingerprint(path.join(root, '世界书'))) throw error('ERR_SYNC_CONFLICT', '读取期间来源变化')
    return { book: loaded.book, worldbook: wb.worldbook, warnings: wb.warnings, token }
  }
  async function perform(type, method, args) {
    try {
      const scope = type === 'entry' ? snapshot.worldbook.id : bound.bookId
      if (!scope || String(args[0]) !== String(scope)) return fail('INVALID_INPUT', '请求不属于此项目绑定的作品/世界书')
      const working = clone(snapshot)
      const chapters = new Map([[bound.bookId, working.book.chapters]])
      const entries = new Map([[String(working.worldbook.id), working.worldbook.entries]])
      const nodes = new Map([[bound.bookId, working.book.outline.nodes]])
      const edges = new Map([[bound.bookId, working.book.outline.edges]])
      const stores = {
        chapter: createMemoryChapterStore({ books: chapters }), entry: createMemoryWorldbookEntryStore({ buckets: entries }),
        node: createMemoryOutlineNodeStore({ buckets: nodes }), edge: createMemoryOutlineEdgeStore({ buckets: edges })
      }
      if (!['read', 'list'].includes(method)) {
        if (!expectedSnapshot || !['book', 'worldbook', 'revision', 'projectId', 'bookId', 'worldbookId'].every(key => expectedSnapshot[key] === snapshot.token?.[key])) return fail('STALE_REVISION', '需要读取返回的完整文件快照后再保存')
        if (type === 'entry' && working.warnings.some(item => !item.includes('目录内未找到'))) return fail('IO_FAILED', '设定文件未完整解析，不能保存部分条目', { warnings: working.warnings })
        if (type === 'node' && method === 'remove' && (working.book.outline.nodes.some(node => node.parentId === args[1]) || working.book.outline.edges.some(edge => edge.fromNodeId === args[1] || edge.toNodeId === args[1]))) return fail('OUTLINE_NODE_REFERENCED', '节点仍有子节点或关系，请先处理引用')
      }
      const result = await stores[type][method](...args)
      if (!result.ok || ['read', 'list'].includes(method)) return result
      const current = JSON.parse(fs.readFileSync(safePath(root, '.pinax/project.json'), 'utf8'))
      if (current.projectId !== manifest.projectId || !service.listProjects().some(item => item.bookId === bound.bookId && path.resolve(item.rootPath) === root)) return fail('STALE_REVISION', '项目身份或绑定已经改变')
      working.book.chapters = chapters.get(bound.bookId)
      working.book.outline.nodes = nodes.get(bound.bookId)
      working.book.outline.edges = edges.get(bound.bookId)
      working.worldbook.entries = entries.get(String(working.worldbook.id)) || []
      // Entry and outline ports also enforce referential integrity on final state.
      const ids = new Set(working.book.outline.nodes.map(node => node.id))
      if (working.book.outline.edges.some(edge => !ids.has(edge.fromNodeId) || !ids.has(edge.toNodeId))) return fail('OUTLINE_ENDPOINT_NOT_FOUND', '大纲关系引用的节点不存在')
      const payload = { book: working.book, domains: [type === 'entry' ? 'worldbook' : 'book'], baseRevision: snapshot.token.revision,
        expectedBookFingerprint: snapshot.token.book, expectedWorldbookFingerprint: snapshot.token.worldbook }
      if (type === 'entry') payload.worldbook = working.worldbook
      service.mirrorBook(payload, { receipt: receipt ? { ...receipt, result } : null })
      try { snapshot = load(); expectedSnapshot = snapshot.token }
      catch { snapshot = { ...working, token: null }; expectedSnapshot = null }
      return result
    } catch (exception) { return fail(exception.code || 'IO_FAILED', exception.message) }
  }
  const port = (type, methods) => Object.fromEntries(methods.map(method => [method, (...args) => perform(type, method, args)]))
  const chapterStore = port('chapter', ['list', 'read', 'create', 'update', 'remove'])
  const worldbookEntryStore = port('entry', ['list', 'read', 'create', 'update', 'remove'])
  const outlineNodeStore = port('node', ['list', 'read', 'create', 'update', 'move', 'remove'])
  const outlineEdgeStore = port('edge', ['list', 'add', 'remove'])
  return {
    chapterStore, worldbookEntryStore, outlineNodeStore, outlineEdgeStore,
    chapters: createChapterService({ store: chapterStore }), entries: createWorldbookEntryService({ store: worldbookEntryStore }),
    nodes: createOutlineNodeService({ store: outlineNodeStore }), edges: createOutlineEdgeService({ store: outlineEdgeStore, nodeStore: outlineNodeStore }),
    snapshot: () => clone(snapshot.token), book: () => clone(snapshot.book)
  }
}
