#!/usr/bin/env node
// 本地文件镜像确定性 smoke：注入临时根目录与 fake 时钟，不打真实文档目录、无网络。
// 覆盖：目录布局、md/frontmatter 内容、托管区清扫（stale 移除）、文件名消毒、payload 校验。
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
check('世界书条目带 frontmatter', fs.readFileSync(path.join(dir, '世界书', '角色', '沈砚宁.md'), 'utf-8').includes('type: character') && fs.readFileSync(path.join(dir, '世界书', '角色', '沈砚宁.md'), 'utf-8').includes('keys: 沈砚宁、主角'))
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
check('同名条目去重加后缀', fs.existsSync(path.join(dup.dir, '世界书', 'g', '同名条目.md')) && fs.existsSync(path.join(dup.dir, '世界书', 'g', '同名条目-2.md')))

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
const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
check('项目索引.json 含两项目与计数', index.projects.length === 2 && index.projects[0].words === 3 && index.schema === 'pinax-project-fs@2')

console.log(`local-mirror-check: ${passed} 项全部通过`)
fs.rmSync(root, { recursive: true, force: true })
