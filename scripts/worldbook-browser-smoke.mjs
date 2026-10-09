#!/usr/bin/env node
/**
 * 统一条目浏览器模型冒烟（W2·B1）——零依赖，`node scripts/worldbook-browser-smoke.mjs` 直跑。
 *
 * 只测 src/services/worldbook/entryBrowserModel.js（纯逻辑，无 Vue 依赖）：
 *   1. buildCategoryTree：目录计数 / 自由分组二级 / 与契约 graph.stats.byCat 同数
 *   2. entryStatusOf：缺省 active / draft / retired / 未知值回落 active
 *   3. filterEntries（cat/status 本地过滤）：目录+自由分组二级联合过滤、status 过滤、
 *      无条件保序；文本检索自 W1-A 起走 kit worldbook_search 代理（§5-7 裁定移除本地
 *      打分轨），q 不再参与本地过滤/排序——防「第二实现漂移」回归钉
 *   4. 关联 chips：links ∪ relations（含旧分组桶，tags 桶排除）∪ 正文 [[id]] 三来源合并去重，
 *      四级兜底解析（全路径 → .md 尾段 → 裸标题 → id），未解析显式 resolved=false
 *   5. 防漂移交叉验证：entryCatDirOf/entryTagsOf/entrySummaryOf 逐条与
 *      shared/worldbookFileContract.js buildWorldbookGraphFile 产物一致；
 *      buildGraph 与契约产物 deepStrictEqual
 *
 * 蓝本：kit kernel-view worldbookSearch（打分/一跳扩展在 kit，经 knowledgeSearchClient 代理渲染）、
 * resolveEntryRef 四级兜底（worldbook-data.ts:42）。
 */
import assert from 'node:assert/strict'
import { buildWorldbookGraphFile } from '../shared/worldbookFileContract.js'
import {
  CAT_DIRS,
  buildCategoryTree,
  buildGraph,
  buildRelationChips,
  catColorOf,
  entryCatDirOf,
  entryStatusOf,
  entrySummaryOf,
  entryTagsOf,
  filterEntries,
  relationRefsOf,
  resolveEntryRef
} from '../src/services/worldbook/entryBrowserModel.js'

let asserted = 0
function ok(value, message) {
  asserted += 1
  assert.ok(value, message)
  console.log(`  ok - ${message}`)
}
function eq(actual, expected, message) {
  asserted += 1
  assert.deepStrictEqual(actual, expected, message)
  console.log(`  ok - ${message}`)
}

/* ============ 1. 分类树 + 状态 ============ */

// 11 条：六目录全覆盖、多 group、缺省 status / draft / retired 各有
const TREE_ENTRIES = [
  { id: 'char-zhangsan', name: '张三', type: 'character', keys: ['张三'], content: '张三是边境领主的次子，惯用一柄旧剑。', injection: { mode: 'selective', group: '皇室' }, relations: { locations: ['loc-bianjing'], characters: ['char-lisi'] } },
  { id: 'char-lisi', name: '李四', type: 'character', keys: ['李四'], content: '李四是王城的抄写员。', injection: { group: '皇室' }, links: ['loc-wangcheng'], tags: ['抄写员'] },
  { id: 'char-wangwu', name: '王五', type: 'character', content: '王五是个卖药的，走街串巷。', injection: {} },
  { id: 'loc-bianjing', name: '边境领地', type: 'location', content: '边境领地常年起风，人烟稀少。', injection: { group: '边境' } },
  { id: 'loc-wangcheng', name: '王城', type: 'location', content: '王城的城墙修了三百年。', injection: {} },
  { id: 'org-xuncha', name: '巡查司', type: 'organization', content: '巡查司统辖边境治安事务。', injection: {} },
  { id: 'event-founding', name: '建城之誓', type: 'event', content: '三百年前的建城之誓定下盟约。', injection: {} },
  { id: 'event-feast', name: '血宴', type: 'event', status: 'draft', content: '血宴尚未写进正文，只是草稿。', injection: {} },
  { id: 'lore-sword', name: '旧剑规', type: 'lore', content: '旧剑规约束一切佩剑之人。', injection: {} },
  { id: 'src-notes', name: '旧稿摘录', type: 'source', status: 'retired', content: '早期设定摘录，已经退役归档。', injection: {} },
  { id: 'src-short', name: '太短', type: 'source', content: '太短。' }
]

function section1() {
  console.log('# 1. buildCategoryTree / entryStatusOf')
  const tree = buildCategoryTree(TREE_ENTRIES)
  eq(tree.total, 11, '树 total = 11')
  eq(tree.cats.map((c) => c.id), ['设定', '人物', '势力', '地理', '编年', '资料'], '一级目录按契约 CAT_DIRS 定序')
  eq(tree.cats.map((c) => c.count), [1, 3, 1, 2, 2, 2], '目录计数（设定1/人物3/势力1/地理2/编年2/资料2）')
  const ren = tree.cats.find((c) => c.id === '人物')
  eq(ren.groups, [{ id: '人物/皇室', label: '皇室', count: 2 }], '自由分组作二级（人物/皇室=2）')
  const dili = tree.cats.find((c) => c.id === '地理')
  eq(dili.groups, [{ id: '地理/边境', label: '边境', count: 1 }], '地理/边境=1')
  ok(tree.cats.find((c) => c.id === '资料').groups.length === 0, '无分组目录二级为空')

  // 与契约 graph.stats.byCat 互证（防目录映射漂移）
  const graph = buildWorldbookGraphFile({ name: '测试书', entries: TREE_ENTRIES })
  eq(Object.fromEntries(tree.cats.map((c) => [c.id, c.count])), graph.stats.byCat, '树计数 === 契约 graph.stats.byCat')
  eq(tree.total, graph.stats.entries, '树 total === graph.stats.entries')

  eq(buildCategoryTree([]), { total: 0, cats: [] }, '空输入 → 空树')
  eq(buildCategoryTree(undefined), { total: 0, cats: [] }, 'undefined → 空树')

  eq(entryStatusOf({}), 'active', '缺省 status → active')
  eq(entryStatusOf({ status: '' }), 'active', '空串 status → active')
  eq(entryStatusOf({ status: 'draft' }), 'draft', 'draft 原样')
  eq(entryStatusOf({ status: 'retired' }), 'retired', 'retired 原样')
  eq(entryStatusOf({ status: 'weird' }), 'active', '未知 status 回落 active')
}

/* ============ 2. filterEntries（cat/status 本地过滤；文本检索走 kit 代理） ============ */

function section2() {
  console.log('# 2. filterEntries（cat/status 过滤；W1-A 移除本地打分轨）')
  // W1-A §5-7 裁定：打分/排序单源在 kit（worldbook_search 代理），q 不再参与本地过滤
  eq(filterEntries(TREE_ENTRIES, { q: '王城' }).length, 11, "q 不再本地过滤（'王城' 返回全量，文本检索走 kit 代理）")
  eq(filterEntries(TREE_ENTRIES, { q: '    ' }).length, 11, '空白查询 → 全量保序')

  // cat（含「目录/分组」二级联合）与 status 过滤
  eq(filterEntries(TREE_ENTRIES, { cat: '人物' }).map((e) => e.id), ['char-zhangsan', 'char-lisi', 'char-wangwu'], 'cat=人物 3 条')
  eq(filterEntries(TREE_ENTRIES, { cat: '人物/皇室' }).map((e) => e.id), ['char-zhangsan', 'char-lisi'], 'cat=人物/皇室 二级联合 2 条')
  eq(filterEntries(TREE_ENTRIES, { cat: '地理/边境' }).map((e) => e.id), ['loc-bianjing'], 'cat=地理/边境 1 条')
  eq(filterEntries(TREE_ENTRIES, { cat: '全部' }).length, 11, "cat='全部' 不过滤")
  eq(filterEntries(TREE_ENTRIES, { status: 'draft' }).map((e) => e.id), ['event-feast'], 'status=draft 1 条')
  eq(filterEntries(TREE_ENTRIES, { status: 'retired' }).map((e) => e.id), ['src-notes'], 'status=retired 1 条')
  eq(filterEntries(TREE_ENTRIES, { status: 'active' }).length, 9, '缺省条目按 active 计入过滤')
  eq(filterEntries(TREE_ENTRIES, { cat: '人物', status: 'draft' }).length, 0, 'cat+status 联合为空')
  eq(filterEntries(TREE_ENTRIES, {}).map((e) => e.id), TREE_ENTRIES.map((e) => e.id), '无过滤条件 → 原序全量')
  eq(filterEntries(undefined, { cat: 'x' }), [], 'undefined 输入 → 空数组')
}

/* ============ 3. 关联 chips：三来源合并 + 四级兜底 ============ */

const CHIP_ENTRIES = [
  { id: 'char-lisi', name: '李四', type: 'character', content: '李四是王城的抄写员，日日笔耕。' },
  { id: 'loc-wangcheng', name: '王城', type: 'location', content: '王城的城墙修了三百年之久。' },
  { id: 'loc-bianjing', name: '边境领地', type: 'location', content: '边境领地常年起风，人烟稀少。' },
  { id: 'char-wangwu', name: '王五', type: 'character', content: '王五是个卖药的，走街串巷。' },
  { id: 'src-old', name: '旧稿.', type: 'source', content: '旧稿摘录，已经退役归档不用。' },
  {
    id: 'char-zhangsan',
    name: '张三',
    type: 'character',
    links: ['ghost-ref', '世界书/人物/李四.md'],
    relations: { locations: ['loc-bianjing'], characters: ['char-wangwu'], tags: ['边民'] },
    content: '他常去[[王城]]，翻过[[李四.md]]与[[旧稿.]]，还有[[ghost-ref]]。'
  }
]

function section3() {
  console.log('# 3. relationRefsOf / buildRelationChips / resolveEntryRef')
  const zhangsan = CHIP_ENTRIES[5]
  eq(
    relationRefsOf(zhangsan),
    ['ghost-ref', '世界书/人物/李四.md', 'loc-bianjing', 'char-wangwu', '王城', '李四.md', '旧稿.'],
    '三来源合并去重：links → relations 桶 → 正文 [[id]]（tags 桶排除）'
  )
  eq(relationRefsOf({ relations: { placeIds: ['loc-x'], tags: ['t'] } }), ['loc-x'], '旧 placeIds 桶并入，tags 桶排除')
  eq(relationRefsOf({ relations: [{ to: 'a' }, 'b', { type: 'rival' }] }), ['a', 'b'], '富关系数组：对象取 to、字符串原样、缺 to 丢弃')
  eq(relationRefsOf({}), [], '空输入 → 空引用')

  const chips = buildRelationChips(zhangsan, CHIP_ENTRIES)
  eq(chips.length, 7, '7 引用 → 7 枚 chips（空 ref 已在来源层丢弃）')
  eq(chips.map((chip) => chip.ref), ['ghost-ref', '世界书/人物/李四.md', 'loc-bianjing', 'char-wangwu', '王城', '李四.md', '旧稿.'], 'chips 保首现顺序')
  const byRef = new Map(chips.map((chip) => [chip.ref, chip]))
  ok(byRef.get('ghost-ref').resolved === false && byRef.get('ghost-ref').entry === null, '未解析显式 resolved=false / entry=null')
  eq(byRef.get('世界书/人物/李四.md').entry.id, 'char-lisi', '四级①全路径：世界书/人物/李四.md → char-lisi')
  eq(byRef.get('李四.md').entry.id, 'char-lisi', '四级②.md 尾段：李四.md → char-lisi')
  eq(byRef.get('王城').entry.id, 'loc-wangcheng', '四级③裸标题（含②同名尾段同解）：王城 → loc-wangcheng')
  eq(byRef.get('loc-bianjing').entry.id, 'loc-bianjing', '四级④id：loc-bianjing → loc-bianjing')
  eq(byRef.get('char-wangwu').entry.id, 'char-wangwu', '四级④id：char-wangwu → char-wangwu')
  eq(byRef.get('旧稿.').entry.id, 'src-old', '标题与文件尾段不同形（尾随点被 sanitize）：裸标题兜底 → src-old')

  eq(resolveEntryRef(CHIP_ENTRIES, '世界书/地理/王城.md').id, 'loc-wangcheng', 'resolveEntryRef：全路径直命中')
  eq(resolveEntryRef(CHIP_ENTRIES, '不存在'), null, 'resolveEntryRef：找不到 → null')
  eq(resolveEntryRef([], 'x'), null, '空 entries → null')

  eq(buildRelationChips(undefined, CHIP_ENTRIES), [], '无引用条目 → 空 chips')
}

/* ============ 4. 防漂移：与契约 buildWorldbookGraphFile 交叉验证 ============ */

function section4() {
  console.log('# 4. 与契约交叉验证 + buildGraph 一致')
  const graph = buildWorldbookGraphFile({ name: '测试书', entries: TREE_ENTRIES })
  const nodeById = new Map(graph.entries.map((node) => [node.id, node]))
  for (const entry of TREE_ENTRIES) {
    const node = nodeById.get(entry.id)
    ok(node, `契约图含 ${entry.id}`)
    eq(entryCatDirOf(entry), node.cat, `${entry.id} cat 一致（${node.cat}）`)
    eq(entryTagsOf(entry), node.tags, `${entry.id} tags 一致 [${node.tags.join(',')}]`)
    eq(entrySummaryOf(entry), node.summary, `${entry.id} summary 一致（${node.summary.slice(0, 10)}…）`)
    eq(entryStatusOf(entry), node.status, `${entry.id} status 一致（${node.status}）`)
  }
  eq(entrySummaryOf(TREE_ENTRIES[10]), '', '首段 <8 字 → 摘要为空（契约 firstPara 同口径）')

  const wb = { name: '测试书', entries: TREE_ENTRIES }
  eq(buildGraph(wb), buildWorldbookGraphFile(wb), 'buildGraph === 契约 buildWorldbookGraphFile（deepStrictEqual）')
  const wb2 = { name: 'chips书', entries: CHIP_ENTRIES }
  eq(buildGraph(wb2), buildWorldbookGraphFile(wb2), 'buildGraph 一致性（第二组 fixture）')

  // 配色表：六目录全有着色，未知回落
  for (const dir of CAT_DIRS) ok(typeof catColorOf(dir) === 'string' && catColorOf(dir).startsWith('#'), `配色 ${dir}`)
  eq(catColorOf('不存在'), '#8a8375', '未知分类回落 #8a8375')
}

/* ============ runner ============ */

const sections = [section1, section2, section3, section4]
try {
  for (const section of sections) section()
  console.log(`\nSMOKE OK: ${sections.length} sections / ${asserted} assertions / 0 failed`)
} catch (err) {
  console.error(`\nSMOKE FAILED after ${asserted} assertions: ${err.message}`)
  if (err.diff) console.error(err.diff)
  process.exit(1)
}
