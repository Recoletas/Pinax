#!/usr/bin/env node
// 本地文件镜像确定性 smoke：注入临时根目录与 fake 时钟，不打真实文档目录、无网络。
// 覆盖：目录布局、md/frontmatter 内容、托管区清扫（stale 移除）、文件名消毒、payload 校验、
// 「约束」目录读回（W6·C local-rules：kind 判定/换行保留/绑定解析/同步不触碰）。
// 运行：node scripts/local-mirror-check.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLocalMirrorService, resolveMirrorRoot, sanitizeFilename } from '../server/services/localMirrorService.js'
import { createLocalMirrorRouter } from '../server/routes/localMirror.js'

let passed = 0
const check = (name, condition) => { assert.ok(condition, name); passed += 1; console.log(`  ✓ ${name}`) }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pinax-mirror-check-'))
const service = createLocalMirrorService({ rootPath: root, now: () => '2026-10-06T00:00:00.000Z' })

console.log('[1] 位置解析：env 覆盖 > Documents/Pinax 缺省')
process.env.PINAX_MIRROR_ROOT = ''
check('缺省位置在用户目录 Documents/Pinax 下', resolveMirrorRoot({}).endsWith(path.join('Documents', 'Pinax')))
process.env.PINAX_MIRROR_ROOT = root
check('env 覆盖生效', resolveMirrorRoot() === root)

console.log('[2] 同步一本书：布局与内容')
const payload = {
  book: {
    id: 'book_ab12cd34',
    title: '雾港纪事',
    chapters: [
      { id: 'c1', title: '第一章 潮声', content: '沈砚宁听见三声轻叩。' },
      { id: 'c2', title: '第二章 罗盘', content: '潮水正在回来。' }
    ],
    outline: { nodes: [{ id: 'n1', title: '码头对峙', status: 'planned', intent: '揭示密信' }], edges: [{ id: 'e1', kind: 'causes', fromNodeId: 'n1', toNodeId: 'n1' }] },
    explorations: [{ id: 'd1', title: '构思·雾的来历', content: '雾是记忆的沉积。' }]
  },
  worldbook: {
    id: 'wb_1', name: '雾港资料库', worldDescription: '一个被雾封锁的港口。', writingStyle: '冷峻', forbidden: '不写现代词',
    groups: ['角色', '地理'],
    entries: [
      { name: '沈砚宁', type: 'character', group: '角色', keys: ['沈砚宁', '主角'], content: '主角，灯塔守望人。' },
      { name: '雾港', type: 'location', group: '地理', keys: [], content: '终年浓雾的港口城市。' }
    ]
  }
}
const { dir, counts } = service.mirrorBook(payload)
check('章节数 2 / 条目数 2 / 构思数 1', counts.chapters === 2 && counts.entries === 2 && counts.explorations === 1)
check('正文 001 章存在且内容一致', fs.readFileSync(path.join(dir, '正文', '001-第一章 潮声.md'), 'utf-8') === '沈砚宁听见三声轻叩。\n')
check('世界书 v2 布局：条目按 cat 目录落位（character→人物 location→地理）', fs.existsSync(path.join(dir, '世界书', '人物', '沈砚宁.md')) && fs.existsSync(path.join(dir, '世界书', '地理', '雾港.md')))
const shenMd = fs.readFileSync(path.join(dir, '世界书', '人物', '沈砚宁.md'), 'utf-8')
check('世界书条目带契约 v2 frontmatter（kit 字段全集）', shenMd.includes('kind: character') && shenMd.includes('keys: [沈砚宁, 主角]') && shenMd.includes('schemaVersion: 1'))
check('index.json 指针账本（kit 形状，file 全部存在）', (() => {
  const index = JSON.parse(fs.readFileSync(path.join(dir, '世界书', 'index.json'), 'utf-8'))
  const pointers = index.sections.filter((s) => s.format === 'list').flatMap((s) => s.entries ?? [])
  return pointers.length === 2 && pointers.every((p) => fs.existsSync(path.join(dir, p.file))) && index.sections.some((s) => s.id === '伏笔' && s.file === '世界书/伏笔/台账.md')
})())
check('graph.json worldbook-graph@1', JSON.parse(fs.readFileSync(path.join(dir, '世界书', 'graph.json'), 'utf-8')).format === 'worldbook-graph@1')
check('体系标准骨架件四件幂等补齐', ['纪律.md', '伏笔/台账.md', '底牌/暗线底牌.md', '编年/章账.md'].every((rel) => fs.existsSync(path.join(dir, '世界书', ...rel.split('/')))))
check('manifest.json 汇总条目', JSON.parse(fs.readFileSync(path.join(dir, '世界书', 'manifest.json'), 'utf-8')).entryCount === 2)
check('大纲 md 含节点与关系', fs.readFileSync(path.join(dir, '大纲', '大纲.md'), 'utf-8').includes('码头对峙（planned）'))
check('构思落盘', fs.readFileSync(path.join(dir, '构思', '构思·雾的来历.md'), 'utf-8').includes('雾是记忆的沉积。'))
check('meta.json 完整标记', JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf-8')).mirroredAt === '2026-10-06T00:00:00.000Z')

console.log('[3] 托管区清扫：再次同步移除 stale 文件')
fs.writeFileSync(path.join(dir, '正文', '999-stale.md'), '旧文件')
service.mirrorBook(payload)
check('stale 章节被移除', !fs.existsSync(path.join(dir, '正文', '999-stale.md')))
check('现存章节保留', fs.existsSync(path.join(dir, '正文', '001-第一章 潮声.md')))

console.log('[4] 文件名消毒与去重')
check('非法字符消毒', sanitizeFilename('a<b>:"/\\|?*c') === 'a b c')
check('空名回落占位', sanitizeFilename('???') === '未命名')
const dup = service.mirrorBook({ book: { ...payload.book, chapters: [{ id: 'x', title: '同名', content: '1' }, { id: 'y', title: '同名', content: '2' }], title: '去重测试' }, worldbook: { id: 'wb_2', name: '去重库', entries: [ { name: '同名条目', type: 'general', group: 'g', keys: [], content: 'a' }, { name: '同名条目', type: 'general', group: 'g', keys: [], content: 'b' } ] } })
check('同序号章节按序号区分', fs.existsSync(path.join(dup.dir, '正文', '001-同名.md')) && fs.existsSync(path.join(dup.dir, '正文', '002-同名.md')))
check('同名条目按 cat 目录去重加后缀（general→设定）', fs.existsSync(path.join(dup.dir, '世界书', '设定', '同名条目.md')) && fs.existsSync(path.join(dup.dir, '世界书', '设定', '同名条目-2.md')))

console.log('[5] payload 校验（经路由信封）')
const router = createLocalMirrorRouter({ service })
const postHandler = router.stack.find((layer) => layer.route?.path === '/sync' && layer.route?.methods?.post).route.stack[0].handle
const calls = []
await postHandler({ body: { book: { id: '', title: 'x', chapters: [] } } }, { status(code) { this.code = code; return this }, json(body) { calls.push({ code: this.code, body }) } }, () => {})
check('非法 payload → 400 + ERR_INVALID_INPUT', calls[0]?.code === 400 && calls[0]?.body?.error === 'ERR_INVALID_INPUT')

console.log('[6] @2 日志体系：修订史/体验会话/助手对话/记忆台账')
const longMarkdown = '长'.repeat(30_000)
const logsPayload = {
  book: { id: 'book_logs_001', title: '日志验收', chapters: [{ id: 'c1', title: '第一章', content: '正文。' }], outline: { nodes: [], edges: [] }, explorations: [] },
  worldbook: null,
  logs: {
    revisions: [{ chapterId: 'c1', chapterTitle: '第一章', snapshots: [{ id: 's1', label: '里程碑', reason: 'word-milestone', createdAt: '2026-10-06T00:00:00Z', wordCount: 9, markdown: longMarkdown }], blockHistory: [{ id: 'b1', at: 1 }] }],
    sessions: [{ id: 'sess1', title: '跑团·雾港夜航', createdAt: '2026-10-06T01:00:00Z', turnCount: 3, record: { id: 'sess1', turns: ['回合一'] } }],
    conversations: [{ projectId: 'book_logs_001', messages: [{ role: 'user', content: '帮我续写' }, { role: 'assistant', content: '好的，潮声再起。' }] }],
    memory: [{ id: 'm1', status: 'active', type: 'fact', content: '沈砚宁守着灯塔。' }, { id: 'm2', status: 'pending', type: 'fact', content: '雾会说话。' }]
  }
}
const logsResult = service.mirrorBook(logsPayload)
const revisionJson = JSON.parse(fs.readFileSync(path.join(logsResult.dir, '日志', '修订史', '第一章.json'), 'utf-8'))
check('meta schema = pinax-project-fs@2', JSON.parse(fs.readFileSync(path.join(logsResult.dir, 'meta.json'), 'utf-8')).schema === 'pinax-project-fs@2')
check('修订史落盘且 markdown 截断到 2 万字符', revisionJson.snapshots[0].markdown.length === 20_000 && revisionJson.snapshots[0].label === '里程碑')
check('块级历史随修订史收录', revisionJson.blockHistory.length === 1)
check('体验会话按会话落 json', JSON.parse(fs.readFileSync(path.join(logsResult.dir, '日志', '体验会话', '跑团·雾港夜航.json'), 'utf-8')).turnCount === 3)
check('助手对话转可读 md', fs.readFileSync(path.join(logsResult.dir, '日志', '助手对话', 'book_logs_001.md'), 'utf-8').includes('## 助手') && fs.readFileSync(path.join(logsResult.dir, '日志', '助手对话', 'book_logs_001.md'), 'utf-8').includes('潮声再起'))
const ledger = JSON.parse(fs.readFileSync(path.join(logsResult.dir, '日志', '记忆台账.json'), 'utf-8'))
check('记忆台账带状态统计', ledger.count === 2 && ledger.byStatus.active === 1 && ledger.byStatus.pending === 1)

console.log('[7] @2 资料与媒体清单')
const materialsPayload = {
  book: { id: 'book_mat_001', title: '资料验收', chapters: [{ id: 'c1', title: '第一章', content: 'x' }], outline: { nodes: [], edges: [] }, explorations: [] },
  worldbook: null,
  materials: { artifacts: [{ ref: 'S1', title: '设定集·雾港', kind: 'reference-text', content: '资料正文内容。' }, { ref: 'S2', title: '同题资料', kind: 'reference-text', content: '第二份。' }, { ref: 'S2', title: '同题资料', kind: 'reference-text', content: '第三份。' }] },
  media: [{ id: 'asset1', kind: 'image', purpose: 'illustration', status: 'accepted', projectId: 'book_mat_001' }]
}
const matResult = service.mirrorBook(materialsPayload)
const sources = JSON.parse(fs.readFileSync(path.join(matResult.dir, '资料', 'sources.json'), 'utf-8'))
check('资料 sources.json 索引 3 份', sources.count === 3)
check('同名资料去重加后缀', fs.existsSync(path.join(matResult.dir, '资料', 'S2-同题资料.md')) && fs.existsSync(path.join(matResult.dir, '资料', 'S2-同题资料-2.md')))
check('媒体清单落盘（仅元数据）', JSON.parse(fs.readFileSync(path.join(matResult.dir, '媒体清单.json'), 'utf-8')).assets[0].kind === 'image')

console.log('[8] 根级项目索引')
const indexPath = service.writeProjectIndex([
  { id: 'book_logs_001', title: '日志验收', chapters: 1, words: 3, entries: 0, updatedAt: '2026-10-06T02:00:00Z', dir: logsResult.dir },
  { id: 'book_mat_001', title: '资料验收', chapters: 1, words: 1, entries: 0, updatedAt: '2026-10-06T02:00:00Z', dir: matResult.dir }
])
check('索引写在 app-data（注册表旁）', path.dirname(indexPath) === service.resolveAppDataDir() && JSON.parse(fs.readFileSync(indexPath, 'utf-8')).projects.length === 2)

console.log('[9] 项目标准范式 pinax-project@1：任意位置项目 + 注册表')
const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'pinax-appdata-'))
const paradigmService = createLocalMirrorService({ rootPath: root, appDataPath: appData })
const novelRoot = path.join(os.tmpdir(), 'pinax-proj-novel-')
fs.rmSync(novelRoot, { recursive: true, force: true })
const created = paradigmService.createProjectAt({ rootPath: novelRoot, name: '雾港纪事', kind: 'novel', bookId: 'book_logs_001' })
check('marker 落盘且 spec 正确', JSON.parse(fs.readFileSync(path.join(novelRoot, '.pinax', 'project.json'), 'utf-8')).spec === 'pinax-project@1')
check('novel 模板目录齐全', ['正文', '大纲', '世界书', '构思', '资料', '日志', '约束'].every((dir) => fs.existsSync(path.join(novelRoot, dir))))
check('create 登记注册表（绑定 bookId）', paradigmService.listProjects().some((item) => item.bookId === 'book_logs_001' && item.kind === 'novel'))
const reopened = paradigmService.openProjectAt({ rootPath: novelRoot })
check('open 校验 marker 并刷新注册表', reopened.manifest.projectId === created.manifest.projectId)
const boundSync = paradigmService.mirrorBook({ ...logsPayload, book: { ...logsPayload.book, id: 'book_logs_001' } })
check('绑定项目同步落到项目根（非文档根）', boundSync.projectRoot === path.resolve(novelRoot) && fs.existsSync(path.join(novelRoot, 'meta.json')))
check('项目根内含 @2 全布局', fs.existsSync(path.join(novelRoot, '世界书')) && fs.existsSync(path.join(novelRoot, '日志', '助手对话')))
const screenplayRoot = path.join(os.tmpdir(), 'pinax-proj-screenplay-')
fs.rmSync(screenplayRoot, { recursive: true, force: true })
paradigmService.createProjectAt({ rootPath: screenplayRoot, name: '夜航剧本', kind: 'screenplay' })
check('screenplay 模板目录齐全', ['剧本', '人物', '场景', '大纲', '世界书', '资料', '日志', '约束'].every((dir) => fs.existsSync(path.join(screenplayRoot, dir))))
const genericRoot = path.join(os.tmpdir(), 'pinax-proj-generic-')
fs.rmSync(genericRoot, { recursive: true, force: true })
paradigmService.createProjectAt({ rootPath: genericRoot, name: '杂项', kind: 'generic' })
check('generic 模板目录齐全', ['文档', '资料', '日志', '约束'].every((dir) => fs.existsSync(path.join(genericRoot, dir))))
let nonProjectError = ''
try { paradigmService.openProjectAt({ rootPath: os.tmpdir() }) } catch (error) { nonProjectError = error.code }
check('打开非项目目录 → ERR_NOT_A_PROJECT', nonProjectError === 'ERR_NOT_A_PROJECT')
let nonEmptyError = ''
try { paradigmService.createProjectAt({ rootPath: novelRoot, name: 'x', kind: 'novel' }) } catch (error) { nonEmptyError = error.code }
check('create 到非空目录 → ERR_DIR_NOT_EMPTY', nonEmptyError === 'ERR_DIR_NOT_EMPTY')
let badPathError = ''
try { paradigmService.createProjectAt({ rootPath: 'relative/path', name: 'x' }) } catch (error) { badPathError = error.code }
check('相对路径 → ERR_INVALID_INPUT', badPathError === 'ERR_INVALID_INPUT')

console.log('[10] 公网部署安全闸：open/create 403')
const guardRouter = createLocalMirrorRouter({ service: paradigmService })
process.env.PINAX_PUBLIC_ORIGINS = 'https://example.com'
const guardCalls = []
for (const routePath of ['/projects/create', '/projects/open']) {
  const handler = guardRouter.stack.find((layer) => layer.route?.path === routePath && layer.route?.methods?.post).route.stack[0].handle
  await handler({ body: { path: novelRoot, name: 'x' } }, { status(code) { this.code = code; return this }, json(body) { guardCalls.push({ routePath, code: this.code, body }) } }, () => {})
}
const guardRulesHandler = guardRouter.stack.find((layer) => layer.route?.path === '/rules' && layer.route?.methods?.get).route.stack[0].handle
await guardRulesHandler({ query: { path: novelRoot } }, { status(code) { this.code = code; return this }, json(body) { guardCalls.push({ routePath: '/rules', code: this.code, body }) } }, () => {})
delete process.env.PINAX_PUBLIC_ORIGINS
check('公网部署下 create/open/rules 均 403 ERR_LOCAL_ONLY', guardCalls.length === 3 && guardCalls.every((call) => call.code === 403 && call.body.error === 'ERR_LOCAL_ONLY'))

console.log('[11] 绑定管理：bind/remove（注册表层，磁盘不动）')
const bound = paradigmService.setProjectBinding({ projectId: created.manifest.projectId, bookId: 'book_new_1' })
check('bind 写入 bookId', bound.bookId === 'book_new_1')
const unbound = paradigmService.setProjectBinding({ projectId: created.manifest.projectId, bookId: null })
check('bookId=null 解绑', unbound.bookId === null)
paradigmService.setProjectBinding({ projectId: created.manifest.projectId, bookId: 'book_logs_001' })
paradigmService.removeProjectEntry({ projectId: created.manifest.projectId })
check('remove 摘除注册表条目（磁盘不动）', !paradigmService.listProjects().some((item) => item.projectId === created.manifest.projectId) && fs.existsSync(path.join(novelRoot, '.pinax', 'project.json')))
let notFoundError = ''
try { paradigmService.setProjectBinding({ projectId: 'proj_missing', bookId: 'x' }) } catch (error) { notFoundError = error.code }
check('绑定不存在项目 → ERR_PROJECT_NOT_FOUND', notFoundError === 'ERR_PROJECT_NOT_FOUND')

console.log('[12] create 缺 path 回落 + update 编辑项目属性')
const fallbackRoot = paradigmService.createProjectAt({ name: '回落项目', kind: 'generic' })
check('create 缺 path 回落 mirrorRoot 下', fallbackRoot.entry.rootPath.startsWith(root))
const updated = paradigmService.updateProjectAt({ projectId: fallbackRoot.manifest.projectId, name: '改名项目', kind: 'screenplay' })
check('update 改注册表 name/kind', updated.name === '改名项目' && updated.kind === 'screenplay')
const markerAfter = JSON.parse(fs.readFileSync(path.join(fallbackRoot.entry.rootPath, '.pinax', 'project.json'), 'utf-8'))
check('update 同步 marker 文件', markerAfter.name === '改名项目' && markerAfter.kind === 'screenplay')
let badKindError = ''
try { paradigmService.updateProjectAt({ projectId: fallbackRoot.manifest.projectId, kind: 'nope' }) } catch (error) { badKindError = error.code }
check('未知 kind → ERR_INVALID_INPUT', badKindError === 'ERR_INVALID_INPUT')

console.log('[13] W6·C 本地约束读回（约束/ 目录）')
const rulesRoot = fallbackRoot.entry.rootPath
const ruleDir = path.join(rulesRoot, '约束')
fs.mkdirSync(ruleDir, { recursive: true })
fs.writeFileSync(path.join(ruleDir, '禁用句式.md'), '不要写：\r\n- 不是…而是…\r\n')
fs.writeFileSync(path.join(ruleDir, '文风要求.txt'), '短句为主。')
fs.writeFileSync(path.join(ruleDir, '备注事项.md'), '备注文本。')
fs.writeFileSync(path.join(ruleDir, '别的不相关.json'), '{}')
const ruleFiles = paradigmService.readRuleFiles(rulesRoot)
check('约束读回：只收 md/txt，按文件名判 kind', ruleFiles.files.length === 3
  && ruleFiles.files.find((file) => file.id === '禁用句式').kind === 'forbidden'
  && ruleFiles.files.find((file) => file.id === '文风要求').kind === 'style'
  && ruleFiles.files.find((file) => file.id === '备注事项').kind === 'note')
check('约束内容 CRLF 归一化且保留换行', ruleFiles.files.find((file) => file.id === '禁用句式').content === '不要写：\n- 不是…而是…')
check('约束 sourceRef 指向文件名', ruleFiles.files.find((file) => file.id === '禁用句式').sourceRef === 'local-rule:禁用句式.md')
paradigmService.setProjectBinding({ projectId: fallbackRoot.manifest.projectId, bookId: 'book_rules_001' })
const ruleFilesByBook = paradigmService.readRuleFilesForBook('book_rules_001')
check('按 bookId 解析注册表绑定读约束', ruleFilesByBook.files.length === 3 && ruleFilesByBook.dir === ruleDir)
check('未绑定 bookId fail-open 空集', paradigmService.readRuleFilesForBook('book_missing').files.length === 0)
const emptyRuleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pinax-no-rules-'))
const noRulesResult = paradigmService.readRuleFiles(emptyRuleRoot)
check('无约束目录返回空集（不抛错）', noRulesResult.files.length === 0 && noRulesResult.dir === null)
// 约束目录不在 MANAGED_SUBDIRS：同步重建托管子目录，但不触碰用户手写约束。
fs.writeFileSync(path.join(ruleDir, '写作约束.md'), '作者手写。')
paradigmService.mirrorBook({ ...logsPayload, book: { ...logsPayload.book, id: 'book_rules_001' } })
check('同步不触碰约束目录（手写保留）', fs.readFileSync(path.join(ruleDir, '写作约束.md'), 'utf-8') === '作者手写。')
// 路由成功路径（local-only 未开启）：?bookId= 读回。
const rulesGetHandler = guardRouter.stack.find((layer) => layer.route?.path === '/rules' && layer.route?.methods?.get).route.stack[0].handle
const rulesRouteCalls = []
await rulesGetHandler({ query: { bookId: 'book_rules_001' } }, { status(code) { this.code = code; return this }, json(body) { rulesRouteCalls.push({ code: this.code, body }) } }, () => {})
check('路由 /rules?bookId= 读回（含新增手写共 4 份）', rulesRouteCalls[0]?.body?.ok === true && rulesRouteCalls[0]?.body?.files?.length === 4)

console.log(`local-mirror-check: ${passed} 项全部通过`)
fs.rmSync(root, { recursive: true, force: true })
