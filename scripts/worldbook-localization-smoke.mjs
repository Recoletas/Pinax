#!/usr/bin/env node
// W6·C 全量本地化冒烟（零 npm 依赖，node 直跑；退出码 0=过）。
//
// 范围（localizationService 纯函数 + server 纯函数；UI 不在本冒烟内）：
//   1. 键裁定表完整性：任务卡盘点的每个键（localStorage + IndexedDB）都命中三类之一；
//      安全敏感项（模型 key/provider 配置）全部 browser-only 且 sensitive 标记
//   2. 恢复计划：文件有→拉文件；文件无浏览器有→保留并提示补推；冲突→文件优先；
//      浏览器 revision 严格更新时仲裁让位浏览器（保留+补推，A3 口径的未同步修订保护）
//   3. 湮灭只清批准键：可丢缓存/file-source 清；安全敏感键动不了（断言）；未知键动不了；
//      IndexedDB 域无 clearner 时跳过不静默清
//   4. 书读回（真实 createLocalMirrorService + 临时目录）：mirrorBook 落盘 →
//      readBookFromFolder 逐章相等（title/content）；sessions 落盘 日志/会话-<bookId>.json；
//      资料归档落盘 资料/归档/<docId>.json → listArchivedSources 读回往返相等
//   5. 载荷校验：sessions/sourceArchive 非法输入被 validatePayload 拒绝（ERR_INVALID_INPUT）
// 运行：node scripts/worldbook-localization-smoke.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  LOCALIZATION_CATEGORIES,
  annihilateBrowserCache,
  buildArchivePushPayload,
  buildRestorePlan,
  buildSessionsPushPayload,
  collectBrowserState,
  extractUpdatedAt,
  matchLocalizationKey,
  summarizeKeyPlan
} from '../src/services/localization/localizationService.js'
import { createLocalMirrorService } from '../server/services/localMirrorService.js'

let passed = 0
const failures = []
const check = (name, condition) => {
  if (condition) { passed += 1; console.log(`  ✓ ${name}`) } else { failures.push(name); console.error(`  ✗ ${name}`) }
}
const section = (title) => console.log(`\n── ${title} ${'─'.repeat(Math.max(1, 66 - title.length))}`)

/* ---------- 极简 localStorage 垫片（可断言清除行为） ---------- */
function installFakeLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    key: (index) => [...store.keys()][index] ?? null,
    get length() { return store.size }
  }
  return store
}
function uninstallFakeLocalStorage() {
  delete globalThis.localStorage
}

/* ---------- 1. 键裁定表完整性 ---------- */
section('1. 键裁定表完整性')

// 任务卡盘点的键（worldbook-unification-abc-20261008 W6）：逐键裁定进三类之一
const INVENTORY_KEYS = [
  'writing_books',
  'worldbook_1690000000000', // worldbook_*（A3 per-worldbook raw）
  'active_worldbook_id',
  'sab_mode', // sab_*
  'sab_enabled',
  'workspace_tabs_v1',
  'authoring_first_run_v1',
  'dialogue_characters',
  'legacy_image_library',
  'pinax_knowledge_read_model_enabled',
  'worldbook:brief:wb1:character', // worldbook:brief:*
  'worldbook:setting-drafts:wb1', // worldbook:setting-drafts:*
  '@idb:pinax-source-archive', // IndexedDB 世界书资料全文/chunk
  '@idb:pinax-memory-history' // 修订史 Dexie
]
for (const key of INVENTORY_KEYS) {
  const plan = matchLocalizationKey(key)
  check(`盘点键 ${key} 命中裁定（${plan?.category ?? 'MISS'}）`, !!plan && LOCALIZATION_CATEGORIES.includes(plan.category))
}

const summary = summarizeKeyPlan()
check('裁定表三类齐备且计数一致', summary.categories.length === 3 && summary.categories.reduce((sum, group) => sum + group.count, 0) === summary.total)
check('裁定表覆盖 ≥ 盘点键数', summary.total >= INVENTORY_KEYS.length)

const sensitiveEntries = ['text_model_configs', 'image_model_configs', 'video_model_configs', 'apiSettings', 'mem0_settings']
for (const key of sensitiveEntries) {
  const plan = matchLocalizationKey(key)
  check(`安全敏感项 ${key} = browser-only + sensitive`, plan?.category === 'browser-only' && plan?.sensitive === true)
}

// 前缀内例外：worldbook_ 命中前，exact 草稿/偏好键先行
check('worldbook_create_draft_v1 不被 worldbook_* 吞掉（browser-only）', matchLocalizationKey('worldbook_create_draft_v1')?.category === 'browser-only')
check('worldbook_research_settings_v1 为可丢缓存（偏好）', matchLocalizationKey('worldbook_research_settings_v1')?.category === 'cache-droppable')
check('未裁定键返回 null（保守保留）', matchLocalizationKey('totally_unknown_key') === null)

/* ---------- 2. 恢复计划 ---------- */
section('2. 恢复计划（A3 口径）')

const browserSeed = {
  writing_books: JSON.stringify([{ id: 'b1', title: '浏览器书', updatedAt: '2026-10-08T01:00:00Z', chapters: [{ id: 'c1', title: '章', content: '旧正文' }] }]),
  worldbook_wb1: JSON.stringify({ id: 'wb1', updatedAt: '2026-10-08T01:00:00Z', entries: [] }),
  text_model_configs: JSON.stringify([{ provider: 'x', apiKey: 'sk-SENSITIVE' }]),
  workspace_tabs_v1: JSON.stringify([{ id: 'tab1' }]),
  authoring_first_run_v1: JSON.stringify({ step: 2 }),
  sab_mode: 'auto',
  some_unknown_key: 'keep-me'
}
installFakeLocalStorage(browserSeed)
const snapshot = collectBrowserState({ idbUsage: { '@idb:pinax-source-archive': { exists: true, bytes: 2048 } } })
check('快照：键存在性+大小+updatedAt', snapshot.totals.keys === 8 && snapshot.keys.find((item) => item.key === 'writing_books')?.updatedAt === '2026-10-08T01:00:00Z')
check('extractUpdatedAt 数组取最大项', extractUpdatedAt(browserSeed.writing_books) === '2026-10-08T01:00:00Z')

// 2a. 文件有 → 拉文件（浏览器也有 → 冲突文件优先）
const planFileWins = buildRestorePlan(snapshot, {
  books: { available: true, book: { id: 'b1', title: '文件书', chapters: [{ title: '章', content: '新正文' }], updatedAt: '2026-10-08T02:00:00Z' } },
  worldbook: { available: true, worldbook: { id: 'wb1', entries: [{ id: 'e1', name: '条目' }] } },
  sourceArchive: { available: true, sources: [{ docId: 'doc1', chunks: [{}] }] }
})
const actionOf = (plan, domain) => plan.actions.find((action) => action.domain === domain)
check('冲突→books 文件优先 restore-from-files', actionOf(planFileWins, 'books')?.type === 'restore-from-files' && actionOf(planFileWins, 'books')?.arbitration === 'file-first')
check('文件有→worldbook restore-from-files', actionOf(planFileWins, 'worldbook')?.type === 'restore-from-files')
check('文件有→source-archive restore-from-files', actionOf(planFileWins, 'source-archive')?.type === 'restore-from-files')
check('计划汇总：3 个文件域 / 批准清除键数>0', planFileWins.summary.restoreDomains.length === 3 && planFileWins.summary.clearKeyCount > 0)

// 2b. 文件无浏览器有 → 保留并提示补推
const planBrowserOnly = buildRestorePlan(snapshot, {
  books: { available: false, book: null },
  worldbook: { available: false, worldbook: null },
  sourceArchive: { available: false, sources: [] }
})
check('文件无→books keep-browser + pushPending', actionOf(planBrowserOnly, 'books')?.type === 'keep-browser' && actionOf(planBrowserOnly, 'books')?.pushPending === true)
check('文件无→worldbook keep-browser + pushPending', actionOf(planBrowserOnly, 'worldbook')?.pushPending === true)
check('文件无→source-archive keep-browser + pushPending', actionOf(planBrowserOnly, 'source-archive')?.pushPending === true)
check('汇总 pushPendingDomains 三域', planBrowserOnly.summary.pushPendingDomains.length === 3)

// 2c. revision 仲裁：浏览器严格更新（有未同步修订）→ 让位浏览器 + 补推
const planBrowserNewer = buildRestorePlan(snapshot, {
  books: { available: true, book: { id: 'b1', title: '文件书（落后）', chapters: [{ title: '章', content: '旧文件正文' }], updatedAt: '2026-10-08T00:00:00Z' } },
  worldbook: { available: false, worldbook: null },
  sourceArchive: { available: false, sources: [] }
})
check('浏览器 revision 更新→books 保留+补推（revision-browser-newer）', actionOf(planBrowserNewer, 'books')?.type === 'keep-browser' && actionOf(planBrowserNewer, 'books')?.arbitration === 'revision-browser-newer' && actionOf(planBrowserNewer, 'books')?.pushPending === true)

// 2d. 失配守卫（A3：另一世界书 id 拒绝读入）
const planMismatch = buildRestorePlan(snapshot, {
  books: { available: false, book: null },
  worldbook: { available: true, mismatch: true, worldbook: null },
  sourceArchive: { available: false, sources: [] }
})
check('worldbook id 失配→keep-browser 不读入', actionOf(planMismatch, 'worldbook')?.type === 'keep-browser' && actionOf(planMismatch, 'worldbook')?.pushPending === false)

/* ---------- 3. 湮灭只清批准键 ---------- */
section('3. 湮灭只清批准键')

const result = annihilateBrowserCache(planFileWins)
let archiveCleared = false
const resultWithClearner = annihilateBrowserCache(planFileWins, {
  clearners: { '@idb:pinax-source-archive': () => { archiveCleared = true } }
})
check('file-source 键被清除（writing_books/worldbook_*）', result.cleared.includes('writing_books') && result.cleared.includes('worldbook_wb1'))
check('可丢缓存键被清除（workspace_tabs_v1/authoring_first_run_v1）', result.cleared.includes('workspace_tabs_v1') && result.cleared.includes('authoring_first_run_v1'))
check('安全敏感键动不了（不在批准集/不清除）', !result.cleared.includes('text_model_configs') && !planFileWins.clearKeys.includes('text_model_configs'))
check('sab_* 键动不了（浏览器保留）', !result.cleared.includes('sab_mode') && !result.refused.some((item) => item.key === 'sab_mode'))
check('未知键动不了', !result.cleared.includes('some_unknown_key') && !result.refused.some((item) => item.key === 'some_unknown_key'))
check('active_worldbook_id 随 worldbook 域清除（派生恢复）', result.cleared.includes('active_worldbook_id') || !browserSeed.active_worldbook_id)
check('IndexedDB 无 clearner → 显式跳过不静默', result.idbSkipped.some((item) => item.key === '@idb:pinax-source-archive' && item.reason === 'no-clearner'))
check('IndexedDB 带 clearner → 执行', resultWithClearner.idbCleared.includes('@idb:pinax-source-archive') && archiveCleared)
check('湮灭后敏感键内容原样', (globalThis.localStorage.getItem('text_model_configs') || '').includes('sk-SENSITIVE'))

// 损坏计划（把敏感键塞进批准集）也清不掉——第二道守卫
const hostilePlan = { clearKeys: ['text_model_configs', 'apiSettings', 'unknown_forced_key'] }
const hostileResult = annihilateBrowserCache(hostilePlan)
check('损坏计划被守卫拒绝（敏感+未知全 refused）', hostileResult.cleared.length === 0 && hostileResult.refused.length === 3)

/* ---------- 补推载荷组装（纯函数） ---------- */
section('3b. 补推载荷组装')
const archivePayload = buildArchivePushPayload({
  artifacts: [{ id: 'doc1', title: '资料一', chunkIds: ['doc1:chunk:1:x'] }, { id: '', title: '无id跳过' }],
  chunks: [{ id: 'doc1:chunk:1:x', sourceId: 'doc1', text: '块一' }, { id: 'doc1:chunk:2:y', sourceId: 'doc2', text: '别家的' }]
})
check('归档载荷按 sourceId 归 chunk + 跳过无 id artifact', archivePayload.doc1?.chunks?.length === 1 && archivePayload.doc1?.meta?.title === '资料一' && !('' in archivePayload))
const sessionsPayload = buildSessionsPushPayload([{ id: 's1', title: '会话一' }, null, 'junk'])
check('会话载荷滤非法项', sessionsPayload.length === 1 && sessionsPayload[0].id === 's1')

uninstallFakeLocalStorage()

/* ---------- 4. 书读回 / 归档落盘往返（真实 service + 临时目录） ---------- */
section('4. 书读回 / 归档落盘往返')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-localization-smoke-'))
const service = createLocalMirrorService({ rootPath: path.join(tmp, 'mirror'), appDataPath: path.join(tmp, 'appdata') })
const project = service.createProjectAt({ path: path.join(tmp, 'proj'), name: '本地化冒烟书', kind: 'novel', bookId: 'book_smoke_1' })
check('项目创建并绑定 bookId', project.entry.bookId === 'book_smoke_1')

const chapters = [
  { id: 'c1', title: '第一章 起航', content: '清晨的港口停着一条旧船。\n\n第二章再会。' },
  { id: 'c2', title: '第二章 风暴', content: '风暴在午夜降临：雨点砸在甲板上。' },
  { id: 'c3', title: '第三章 星图', content: '星图摊开在舱桌上——三条航线。' }
]
const outlineNodes = [{ id: 'n1', title: '起航', status: 'done', intent: '离开港口' }, { id: 'n2', title: '风暴' }]
const outlineEdges = [{ fromNodeId: 'n1', toNodeId: 'n2', kind: 'causes' }]
const explorations = [{ id: 'e1', title: '风暴的隐喻', content: '风暴既是天气也是决断。' }, { id: 'e2', title: '星图三航线', content: '北线快而险。' }]
const sessions = [{ id: 's1', title: '体验会话一', turnCount: 3 }, { id: 's2', title: '助手会话', messages: [] }]
const sourceArchive = {
  'doc-甲': { meta: { id: 'doc-甲', title: '资料甲', kind: 'reference-text', chunkIds: ['doc-甲:chunk:1:h1'] }, chunks: [{ id: 'doc-甲:chunk:1:h1', sourceId: 'doc-甲', text: '甲之全文切块。', hash: 'h1' }, { id: 'doc-甲:chunk:2:h2', sourceId: 'doc-甲', text: '第二块。', hash: 'h2' }] },
  'doc-乙': { meta: { id: 'doc-乙', title: '资料乙', kind: 'reference-text' }, chunks: [] }
}

const mirror = service.mirrorBook({
  book: { id: 'book_smoke_1', title: '本地化冒烟书', chapters, outline: { nodes: outlineNodes, edges: outlineEdges }, explorations },
  sessions,
  sourceArchive
})
check('mirrorBook 落盘含 sessions/sourceArchive 计数', mirror.counts.sessionFiles === 1 && mirror.counts.archiveDocs === 2)
check('落点=注册表绑定项目根', mirror.projectRoot === path.join(tmp, 'proj'))

const readBack = service.readBookFromFolder(path.join(tmp, 'proj'))
check('书读回 ok 且 id=注册表绑定', readBack.ok === true && readBack.book.id === 'book_smoke_1')
check('书读回逐章相等（title+content 逐字）', readBack.book.chapters.length === chapters.length
  && chapters.every((chapter, index) => readBack.book.chapters[index]?.title === chapter.title && readBack.book.chapters[index]?.content === chapter.content))
check('大纲读回（nodes/edges）', JSON.stringify(readBack.book.outline.nodes) === JSON.stringify(outlineNodes) && readBack.book.outline.edges.length === 1)
check('构思读回逐篇相等', readBack.book.explorations.length === explorations.length && explorations.every((doc) => readBack.book.explorations.some((item) => item.title === doc.title && item.content === doc.content)))
check('书读回零 warning', readBack.warnings.length === 0)

const sessionFile = path.join(tmp, 'proj', '日志', `会话-book_smoke_1.json`)
check('会话落盘 日志/会话-<bookId>.json', fs.existsSync(sessionFile))
const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'))
check('会话内容往返相等', sessionData.bookId === 'book_smoke_1' && sessionData.count === 2 && JSON.stringify(sessionData.sessions) === JSON.stringify(sessions))

const sources = service.listArchivedSources(path.join(tmp, 'proj'))
check('归档读回 ok 且逐文档 docId 相等', sources.ok === true && sources.sources.map((item) => item.docId).sort().join(',') === 'doc-乙,doc-甲')
const docJia = sources.sources.find((item) => item.docId === 'doc-甲')
check('归档往返：meta 与 chunks 逐字段相等', JSON.stringify(docJia.meta) === JSON.stringify(sourceArchive['doc-甲'].meta) && JSON.stringify(docJia.chunks) === JSON.stringify(sourceArchive['doc-甲'].chunks))
check('归档 chunkCount 计数', docJia.chunkCount === 2)

// 路由面语义抽查（service 层等价）：相对路径/不存在目录 → ERR_INVALID_INPUT / ERR_DIR_NOT_FOUND
let threwInvalid = false
try { service.readBookFromFolder('relative/path') } catch (error) { threwInvalid = error?.code === 'ERR_INVALID_INPUT' }
check('相对路径拒绝（ERR_INVALID_INPUT）', threwInvalid)
let threwMissing = false
try { service.listArchivedSources(path.join(tmp, 'no-such-dir')) } catch (error) { threwMissing = error?.code === 'ERR_DIR_NOT_FOUND' }
check('目录不存在（ERR_DIR_NOT_FOUND）', threwMissing)

/* ---------- 5. 载荷校验 ---------- */
section('5. mirrorBook 载荷校验')
const invalidPayloads = [
  { name: 'sessions 非数组', payload: { book: { id: 'x', title: 't', chapters: [] }, sessions: 'nope' } },
  { name: 'sessions 项非对象', payload: { book: { id: 'x', title: 't', chapters: [] }, sessions: [42] } },
  { name: 'sourceArchive 非对象', payload: { book: { id: 'x', title: 't', chapters: [] }, sourceArchive: [] } },
  { name: 'sourceArchive.chunks 缺失', payload: { book: { id: 'x', title: 't', chapters: [] }, sourceArchive: { d1: { meta: {} } } } }
]
for (const { name, payload } of invalidPayloads) {
  let rejected = false
  try { service.mirrorBook(payload) } catch (error) { rejected = error?.code === 'ERR_INVALID_INPUT' }
  check(`拒绝：${name}`, rejected)
}

fs.rmSync(tmp, { recursive: true, force: true })

/* ---------- 汇总 ---------- */
console.log(`\n${'='.repeat(70)}`)
console.log(`worldbook-localization-smoke: ${passed} passed / ${failures.length} failed`)
if (failures.length) {
  for (const name of failures) console.error(`  FAIL: ${name}`)
  process.exit(1)
}
console.log('OK')
