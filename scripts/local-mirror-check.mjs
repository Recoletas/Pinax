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

console.log(`local-mirror-check: ${passed} 项全部通过`)
fs.rmSync(root, { recursive: true, force: true })
