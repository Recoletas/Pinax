#!/usr/bin/env node
// A3 worldStore 文件双写冒烟（零 npm 依赖，node 直跑；退出码 0=过）。
//
// 范围（worldStore 本体含 vue/pinia 不在 node 冒烟内；其接缝逻辑全部下沉到
// worldbookFileRepository 的可测纯逻辑，这里注入 fetchImpl / projectRootResolver 直测）：
//   1. 探活与绑定真源：注册表（GET /projects）bookId→rootPath 唯一真源链
//   2. 保存 → POST /sync 请求体含完整 worldbook（relations/injection/keys/metadata），
//      且载荷能被真实 createLocalMirrorService().mirrorBook 落盘、readWorldbookFolder 读回
//   3. 加载 → 文件优先；localStorage 缺失时也能还原完整世界书
//   4. 迁移 → 文件 404 时回落 localStorage 并触发一次幂等推送
//   5. 不可达 → 完全回落 localStorage 且不抛错（零行为差异）
//   6. 竞争守卫 → revision 变化的过期写拒绝；合并推送；删除跳过；失败回调不上抛
// 运行：node scripts/worldbook-dualwrite-smoke.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildWorldbookRawFromFiles,
  createWorldbookFileSyncController,
  isFileSourceAvailable,
  loadWorldbookFromFiles,
  refreshFileSourceAvailability,
  resetFileRepositoryCaches,
  resolveWorldbookLoadSource,
  resolveWorldbookProjectRoot,
  saveWorldbookToFiles,
  setFetchImpl,
  setProjectRootResolver
} from '../src/services/worldbook/worldbookFileRepository.js'
import { createLocalMirrorService } from '../server/services/localMirrorService.js'

let passed = 0
const failures = []
const check = (name, condition) => {
  if (condition) { passed += 1; console.log(`  ✓ ${name}`) } else { failures.push(name); console.error(`  ✗ ${name}`) }
}
const tick = async () => { await new Promise((resolve) => setImmediate(resolve)); await new Promise((resolve) => setImmediate(resolve)) }

/* ---------- 极简 localStorage 垫片（node 无 localStorage；供 writing_books 真源链测试） ---------- */
function installFakeLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  }
  return store
}
function uninstallFakeLocalStorage() {
  delete globalThis.localStorage
}

/* ---------- mock server（fetch 拦截） ---------- */
function createMockFetch({ projects = [], worldbookByRoot = new Map(), syncCapture = null, down = false } = {}) {
  return async function fetchImpl(url, options = {}) {
    if (down) throw new Error('E_MOCK_SERVER_DOWN')
    const target = String(url)
    const respond = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
    if (target.startsWith('/api/localmirror/projects')) return respond({ ok: true, projects })
    if (target.startsWith('/api/localmirror/worldbook')) {
      const parsed = new URL(target, 'http://mock.local')
      const root = parsed.searchParams.get('path') || ''
      const worldbook = worldbookByRoot.get(root)
      if (!worldbook) return respond({ ok: false, error: 'ERR_DIR_NOT_FOUND', message: '目录不存在' }, 400)
      return respond({ ok: true, worldbook, warnings: [] })
    }
    if (target.startsWith('/api/localmirror/sync') && options.method === 'POST') {
      const payload = JSON.parse(String(options.body || '{}'))
      if (syncCapture) syncCapture.push(payload)
      return respond({ ok: true, dir: '/mock/project', counts: { entries: payload.worldbook?.entries?.length ?? 0 } })
    }
    return respond({ ok: false, error: 'ERR_NOT_MOCKED' }, 404)
  }
}

/* ---------- 手动时钟（控制器合并窗口） ---------- */
function createManualClock() {
  const timers = []
  return {
    setTimeoutFn: (handler, ms) => { const handle = { handler, ms }; timers.push(handle); return handle },
    clearTimeoutFn: (handle) => { const index = timers.indexOf(handle); if (index >= 0) timers.splice(index, 1) },
    flush: () => { while (timers.length) timers.shift().handler() },
    pending: () => timers.length
  }
}

/* ---------- 公共样例 ---------- */
const PROJECT_ROOT = 'D:\\proj\\示例项目'
const FULL_WORLDBOOK = {
  id: 'wb_1',
  name: '示例世界书',
  worldDescription: '一片被雾海分割的大陆。',
  writingStyle: '冷峻、克制。',
  forbidden: '不得出现现代词汇。',
  groups: [],
  entries: [{
    id: 'entry_char_1',
    name: '李青书',
    type: 'character',
    keys: ['李青书', '青书'],
    keysSecondary: ['师父'],
    content: '雾海航路的引路人，怕水，要一张干净的海图。',
    injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 1, excludeRecursion: false, group: '角色' },
    relations: { tags: ['主角'], locations: ['loc_a'], characters: [], events: [] },
    metadata: { createdAt: 1700000000000, updatedAt: 1700000001000, importSource: 'manual', basis: 'creative', reviewState: 'ready' }
  }, {
    id: 'entry_loc_a',
    name: '雾海灯塔',
    type: 'location',
    keys: ['灯塔'],
    keysSecondary: [],
    content: '雾海深处唯一的固定光点。',
    injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 1, excludeRecursion: false, group: '地点' },
    relations: { tags: [], locations: [], characters: ['entry_char_1'], events: [] },
    metadata: { createdAt: 1700000000000, updatedAt: 1700000002000, importSource: 'manual', basis: 'creative', reviewState: 'ready' }
  }]
}
const BOUND_PROJECTS = [{ projectId: 'proj_1', bookId: 'book_1', name: '示例项目', kind: 'novel', rootPath: PROJECT_ROOT }]
const WRITING_BOOKS = [{
  id: 'book_1',
  title: '示例书',
  worldbookId: 'wb_1',
  chapters: [{ id: 'ch_1', title: '第一章 出海', content: '李青书把海图铺在桌上。' }],
  outlineNodes: [{ id: 'n1' }],
  outlineEdges: [],
  explorationDocuments: [{ id: 'e1', title: '构思', content: '雾海意象。' }]
}]

console.log('== A3 世界书 store 双写冒烟 ==')
const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'pinax-wb-a3-'))
try {
  /* ---------- 1. 探活与绑定真源 ---------- */
  console.log('[1] 探活与项目绑定真源（注册表 bookId→rootPath）')
  resetFileRepositoryCaches()
  installFakeLocalStorage({ writing_books: JSON.stringify(WRITING_BOOKS) })
  setFetchImpl(createMockFetch({ projects: BOUND_PROJECTS }))
  check('未探活时同步可用性为 false（不阻塞热路径）', isFileSourceAvailable() === false)
  check('探活：注册表有 bookId 绑定 → 可用', await refreshFileSourceAvailability() === true)
  check('探活后同步可用性为 true', isFileSourceAvailable() === true)
  check('worldbookId → 项目根（writing_books.worldbookId → 注册表 rootPath）',
    await resolveWorldbookProjectRoot('wb_1') === PROJECT_ROOT)
  check('未绑定世界书 → null', await resolveWorldbookProjectRoot('wb_none') === null)
  resetFileRepositoryCaches()
  setFetchImpl(createMockFetch({ projects: [{ projectId: 'proj_2', bookId: null, name: '未绑定', rootPath: 'D:\\x' }] }))
  check('注册表无 bookId 绑定 → 不可用', await refreshFileSourceAvailability() === false)

  /* ---------- 2. 保存：sync 请求体含完整 worldbook + 真实镜像落盘读回 ---------- */
  console.log('[2] 保存：sync 载荷完整 worldbook；真实 mirrorBook 落盘 + readWorldbookFolder 读回')
  resetFileRepositoryCaches()
  const syncCapture2 = []
  setFetchImpl(createMockFetch({ projects: BOUND_PROJECTS, syncCapture: syncCapture2 }))
  const saveResult = await saveWorldbookToFiles(PROJECT_ROOT, FULL_WORLDBOOK)
  check('saveWorldbookToFiles ok', saveResult.ok === true && typeof saveResult.dir === 'string')
  const syncPayload = syncCapture2[0]
  check('sync 载荷 book.id 来自注册表绑定', syncPayload?.book?.id === 'book_1')
  check('sync 载荷携带绑定书正文（避免部分同步清空托管目录）',
    syncPayload?.book?.chapters?.[0]?.content === '李青书把海图铺在桌上。')
  const pushedEntry = syncPayload?.worldbook?.entries?.find((entry) => entry.id === 'entry_char_1')
  check('sync 载荷 worldbook 完整（relations 对象桶）', pushedEntry?.relations?.locations?.[0] === 'loc_a')
  check('sync 载荷 worldbook 完整（injection）', pushedEntry?.injection?.mode === 'selective')
  check('sync 载荷 worldbook 完整（metadata）', pushedEntry?.metadata?.importSource === 'manual')
  check('sync 载荷 worldbook 完整（keys/正文）', pushedEntry?.keys?.[0] === '李青书' && typeof pushedEntry?.content === 'string')
  check('sync 载荷不含 entriesMap（索引不入文件）', Array.isArray(syncPayload?.worldbook?.entries) && syncPayload.worldbook.entriesMap === undefined)

  const mirrorService = createLocalMirrorService({ rootPath: tmpBase, appDataPath: path.join(tmpBase, 'appdata') })
  const mirrored = mirrorService.mirrorBook(syncPayload)
  const readBack = mirrorService.readWorldbookFolder(mirrored.dir)
  check('真实 mirrorBook 落盘并读回（ok）', readBack.ok === true && readBack.worldbook.entries.length === 2)
  const mirrorChar = readBack.worldbook.entries.find((entry) => entry.id === 'entry_char_1')
  check('读回：relations 桶还原（locations）', mirrorChar?.relations?.locations?.[0] === 'loc_a')
  check('读回：metadata 还位', mirrorChar?.metadata?.importSource === 'manual')
  check('读回：injection 保真', mirrorChar?.injection?.group === '角色')
  check('读回：正文无损', mirrorChar?.content === FULL_WORLDBOOK.entries[0].content)
  check('读回：index.json 指针账本存在', fs.existsSync(path.join(mirrored.dir, '世界书', 'index.json')))
  check('读回：graph.json 存在', fs.existsSync(path.join(mirrored.dir, '世界书', 'graph.json')))

  /* ---------- 3. 加载：文件优先；localStorage 缺失也能出完整世界书 ---------- */
  console.log('[3] 加载：文件优先；localStorage 缺失 → 完整世界书')
  resetFileRepositoryCaches()
  const worldbookByRoot = new Map([[PROJECT_ROOT, readBack.worldbook]])
  setFetchImpl(createMockFetch({ projects: BOUND_PROJECTS, worldbookByRoot }))
  const loadDeps = {
    isAvailable: () => true,
    refreshAvailability: async () => true,
    resolveRoot: async () => PROJECT_ROOT,
    loadFiles: loadWorldbookFromFiles
  }
  const fromFiles = await resolveWorldbookLoadSource('wb_1', null, loadDeps)
  check('文件优先：source=files', fromFiles.source === 'files')
  check('localStorage 缺失：raw.id 补齐为请求 id', fromFiles.raw?.id === 'wb_1')
  check('localStorage 缺失：条目完整读出', fromFiles.raw?.entries?.length === 2)
  check('localStorage 缺失：条目为运行时形状（relations 桶）',
    fromFiles.raw?.entries?.find((entry) => entry.id === 'entry_char_1')?.relations?.locations?.[0] === 'loc_a')
  check('localStorage 缺失：书级字段来自文件（worldDescription）', fromFiles.raw?.worldDescription === '一片被雾海分割的大陆。')
  const withCache = await resolveWorldbookLoadSource('wb_1', {
    id: 'wb_1', structuredSettings: { world: { tone: '冷' } }, geoHistory: { nodes: [{ id: 'g1' }] },
    research: { note: 'r' }, entriesMap: { stale: true }, updatedAt: 1700000003000
  }, loadDeps)
  check('文件优先：以文件条目覆盖缓存条目', withCache.raw?.entries?.length === 2)
  check('文件加载：localStorage 域字段保留（structuredSettings/geoHistory/research）',
    withCache.raw?.structuredSettings?.world?.tone === '冷' && withCache.raw?.geoHistory?.nodes?.length === 1 && withCache.raw?.research?.note === 'r')
  check('文件加载：不带旧 entriesMap（normalize 重建）', withCache.raw?.entriesMap === undefined)
  check('文件加载：revision 沿用缓存（不因加载推进）', withCache.raw?.updatedAt === 1700000003000)
  const mismatched = new Map([[PROJECT_ROOT, { ...readBack.worldbook, id: 'wb_other' }]])
  setFetchImpl(createMockFetch({ projects: BOUND_PROJECTS, worldbookByRoot: mismatched }))
  const mismatch = await loadWorldbookFromFiles(PROJECT_ROOT, 'wb_1')
  check('manifest 归属另一世界书 → 拒绝读入', mismatch.ok === false && mismatch.error?.code === 'WORLDBOOK_ID_MISMATCH')

  /* ---------- 4. 迁移：文件 404 → localStorage + 幂等推送一次 ---------- */
  console.log('[4] 首载迁移：文件缺失 → 回落 localStorage 并推送一次')
  resetFileRepositoryCaches()
  const syncCapture4 = []
  setFetchImpl(createMockFetch({ projects: BOUND_PROJECTS, syncCapture: syncCapture4 }))
  const persistedRaw = { id: 'wb_1', name: '示例世界书', entries: FULL_WORLDBOOK.entries, updatedAt: 1700000004000 }
  const migration = await resolveWorldbookLoadSource('wb_1', persistedRaw, {
    isAvailable: () => true,
    refreshAvailability: async () => true,
    resolveRoot: async () => PROJECT_ROOT,
    loadFiles: loadWorldbookFromFiles
  })
  check('文件 404：回落 localStorage 且标记迁移', migration.source === 'localStorage' && migration.migrate === true)
  const clock4 = createManualClock()
  const controller4 = createWorldbookFileSyncController({
    readFile: (id) => (id === 'wb_1' ? persistedRaw : null),
    resolveRoot: async () => PROJECT_ROOT,
    isAvailable: () => true,
    assemble: (raw) => raw,
    push: async (root, worldbook) => {
      const response = await saveWorldbookToFiles(root, worldbook)
      return response
    },
    coalesceMs: 0,
    setTimeoutFn: clock4.setTimeoutFn,
    clearTimeoutFn: clock4.clearTimeoutFn
  })
  controller4.enqueue('wb_1')
  clock4.flush()
  await tick()
  check('迁移推送恰好一次（幂等）', syncCapture4.length === 1)
  check('迁移推送携带完整条目', syncCapture4[0]?.worldbook?.entries?.length === 2)

  /* ---------- 5. 不可达：完全回落且不抛错 ---------- */
  console.log('[5] server 不可达 → localStorage 回落，绝不抛错')
  resetFileRepositoryCaches()
  setFetchImpl(createMockFetch({ down: true }))
  let unreachableError = null
  try {
    check('探活失败 → 不可用', await refreshFileSourceAvailability() === false)
    const load = await loadWorldbookFromFiles(PROJECT_ROOT, 'wb_1')
    check('加载不可达 → ok:false SERVER_UNREACHABLE', load.ok === false && load.error?.code === 'SERVER_UNREACHABLE')
    const save = await saveWorldbookToFiles(PROJECT_ROOT, FULL_WORLDBOOK)
    check('保存不可达 → ok:false（不抛错；注册表亦不可达 → 无绑定）', save.ok === false)
    const fallback = await resolveWorldbookLoadSource('wb_1', persistedRaw, {
      isAvailable: () => isFileSourceAvailable(),
      refreshAvailability: () => refreshFileSourceAvailability(),
      resolveRoot: async () => PROJECT_ROOT,
      loadFiles: loadWorldbookFromFiles
    })
    check('加载决策 → 完全回落 localStorage（零行为差异）', fallback.source === 'localStorage' && fallback.migrate !== true)
    const unbound = await saveWorldbookToFiles('D:\\proj\\未注册项目', FULL_WORLDBOOK)
    check('注册表无此项目 → NO_PROJECT_BINDING（不落文档根散目录）', unbound.ok === false && unbound.error?.code === 'NO_PROJECT_BINDING')
  } catch (error) {
    unreachableError = error
  }
  check('不可达路径零抛错', unreachableError === null)

  /* ---------- 6. 竞争守卫：过期写拒绝 / 合并推送 / 删除跳过 / 失败不上抛 ---------- */
  console.log('[6] 控制器竞争守卫（副作用 owner 复核）')
  const localStore = new Map([['wb_1', { id: 'wb_1', name: 'v1', updatedAt: 100, entries: [] }]])
  const pushes6 = []
  let failed6 = null
  let synced6 = 0
  const clock6 = createManualClock()
  const controller6 = createWorldbookFileSyncController({
    readFile: (id) => localStore.get(id) || null,
    resolveRoot: async () => PROJECT_ROOT,
    isAvailable: () => true,
    assemble: (raw) => raw,
    push: async (root, worldbook) => { pushes6.push(worldbook); return { ok: true, dir: root } },
    onSynced: () => { synced6 += 1 },
    onSyncFailed: (_id, error) => { failed6 = error },
    coalesceMs: 5,
    setTimeoutFn: clock6.setTimeoutFn,
    clearTimeoutFn: clock6.clearTimeoutFn
  })
  controller6.enqueue('wb_1')
  localStore.set('wb_1', { id: 'wb_1', name: 'v2', updatedAt: 200, entries: [] })
  clock6.flush()
  await tick()
  check('revision 已变 → 过期写拒绝（不推旧数据）', pushes6.length === 0)
  controller6.enqueue('wb_1')
  controller6.enqueue('wb_1')
  check('合并窗口内多次入队只挂一个定时器', clock6.pending() === 1)
  clock6.flush()
  await tick()
  check('合并推送一次且内容为最新', pushes6.length === 1 && pushes6[0].name === 'v2')
  check('成功回调恰好一次', synced6 === 1)
  localStore.delete('wb_1')
  controller6.enqueue('wb_1')
  clock6.flush()
  await tick()
  check('世界书已删除 → 跳过推送（文件侧不删档）', pushes6.length === 1)
  const controller7 = createWorldbookFileSyncController({
    readFile: () => ({ id: 'wb_2', updatedAt: 1, entries: [] }),
    resolveRoot: async () => PROJECT_ROOT,
    isAvailable: () => true,
    assemble: (raw) => raw,
    push: async () => ({ ok: false, error: { code: 'SERVER_UNREACHABLE', message: 'down' } }),
    onSynced: () => { synced6 += 100 },
    onSyncFailed: (_id, error) => { failed6 = error },
    coalesceMs: 0,
    setTimeoutFn: clock6.setTimeoutFn,
    clearTimeoutFn: clock6.clearTimeoutFn
  })
  let controller7Error = null
  try {
    controller7.enqueue('wb_2')
    clock6.flush()
    await tick()
  } catch (error) {
    controller7Error = error
  }
  check('推送失败 → onSyncFailed 收敛，绝不上抛', controller7Error === null && failed6?.code === 'SERVER_UNREACHABLE' && synced6 === 1)
  const gatedController = createWorldbookFileSyncController({
    readFile: () => ({ id: 'wb_3', updatedAt: 1, entries: [] }),
    resolveRoot: async () => PROJECT_ROOT,
    isAvailable: () => false,
    assemble: (raw) => raw,
    push: async (root, worldbook) => { pushes6.push(worldbook); return { ok: true, dir: root } },
    coalesceMs: 0,
    setTimeoutFn: clock6.setTimeoutFn,
    clearTimeoutFn: clock6.clearTimeoutFn
  })
  check('文件源不可用 → enqueue 直接拒绝（零开销）', gatedController.enqueue('wb_3') === false && clock6.pending() === 0)

  console.log('== 完成 ==')
} finally {
  setFetchImpl(null)
  setProjectRootResolver(null)
  uninstallFakeLocalStorage()
  try { fs.rmSync(tmpBase, { recursive: true, force: true }) } catch { /* 临时目录清理失败不遮蔽结果 */ }
}

console.log(`\n通过 ${passed} 项${failures.length ? `；失败 ${failures.length} 项：\n  - ${failures.join('\n  - ')}` : ''}`)
process.exit(failures.length ? 1 : 0)
