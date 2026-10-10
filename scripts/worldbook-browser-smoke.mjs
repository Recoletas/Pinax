#!/usr/bin/env node
/**
 * 统一条目浏览器 / 人物多维表格模型冒烟（W2·B1 + W3-A）——零依赖，`node scripts/worldbook-browser-smoke.mjs` 直跑。
 *
 * 覆盖 src/services/worldbook/entryBrowserModel.js 与 entryTableColumns.js（纯逻辑，无 Vue 依赖）：
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
 *   6. W2-A-2 图谱下发面：filterEntries 档位轴（tier 委托注入端 entryTierOf，显式 tier 覆盖
 *      kind 推导）、visibleIdsOf（无过滤=null / 有过滤=Set 含空集）、hitIdsOf（命中∪扩展）
 *   7. W3-A 人物多维表格列模型（entryTableColumns）：行集=character 条目、列=七模板字段按标签
 *      去重并集（功能位跨 functionPosition/roleSlot/自由键三落点）、未建档行不猜模板也不谎报
 *      必填缺项、分组轴委托 entryTierOf/entryStatusOf（防第二套档位/状态规则）、格子显示口径
 *      「已存字段优先＋与正文不一致出标记」（contentValueOf/cellOutOfSync）
 *   8. W3-A-2 表格收口：表种行集（tableEntries 的 characters/all 两档，机器台账三件=章账/伏笔台账/
 *      底牌两边都排除）、混排列发现（mixedFieldColumns：模板并集打头＋正文读得出值的【标签】续列，
 *      空标签不成列）、setLabeledBlock 正文块手术（改/建/摘/零写入四径，其余字节不动）、
 *      伏笔台账行三件套（parse/update/remove 在同一份 content 上闭环＋骨架表头与 LABELS 常量同源钉）
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
  hitIdsOf,
  relationRefsOf,
  resolveEntryRef,
  visibleIdsOf
} from '../src/services/worldbook/entryBrowserModel.js'
import { entryTierOf } from '../src/services/worldbook/worldbookContextBuilder.js'
import {
  STATUS_ORDER,
  TIER_ORDER,
  UNBOUND_TEMPLATE_ID,
  cellOutOfSync,
  cellValueOf,
  characterEntries,
  contentValueOf,
  fieldColumns,
  fieldOf,
  groupEntries,
  hasProfile,
  isCharacterEntry,
  isMachineLedgerEntry,
  missingLabelsOf,
  mixedFieldColumns,
  rowTemplateId,
  tableEntries
} from '../src/services/worldbook/entryTableColumns.js'
import {
  FORESHADOW_LEDGER_ENTRY_NAME,
  FORESHADOW_LEDGER_LABELS,
  foreshadowLedgerEntryDraft,
  foreshadowLedgerSkeleton,
  isForeshadowLedgerEntry,
  parseForeshadowLedger,
  removeForeshadowLedgerRow,
  setLabeledBlock,
  updateForeshadowLedger
} from '../src/services/worldbook/settlementService.js'

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

/* ============ 5. 档位过滤 + 下发图谱的可见/命中集合（W2-A-2） ============ */

function section5() {
  console.log('# 5. filterEntries(tier) / visibleIdsOf / hitIdsOf')
  // 档位规则单源注入端：character/location/organization→support，event/lore/source→background
  eq(
    filterEntries(TREE_ENTRIES, { tier: 'support' }).map((e) => e.id),
    ['char-zhangsan', 'char-lisi', 'char-wangwu', 'loc-bianjing', 'loc-wangcheng', 'org-xuncha'],
    'tier=support 6 条且保原序'
  )
  eq(filterEntries(TREE_ENTRIES, { tier: 'core' }), [], 'fixture 无 core 档 → 空')
  eq(filterEntries(TREE_ENTRIES, { tier: 'background' }).length, 5, 'tier=background 5 条（event×2/lore/source×2）')
  // 显式 entry.tier 覆盖 kind 推导（与注入端口径一致）：把已有 event 提档为 core
  const overridden = TREE_ENTRIES.map((entry) => (entry.id === 'event-founding' ? { ...entry, tier: 'core' } : entry))
  eq(filterEntries(overridden, { tier: 'core' }).map((e) => e.id), ['event-founding'], '显式 tier=core 覆盖 kind 推导（event 提档）')
  eq(filterEntries(overridden, { tier: 'background' }).length, 4, '被提档的 event 不再落 background')
  eq(filterEntries(TREE_ENTRIES, { tier: 'weird' }), [], '未知档位值 → 空集（不静默当全部）')
  eq(filterEntries(TREE_ENTRIES, { cat: '人物', tier: 'support' }).map((e) => e.id), ['char-zhangsan', 'char-lisi', 'char-wangwu'], 'cat+tier 联合')
  eq(filterEntries(TREE_ENTRIES, { status: 'draft', tier: 'background' }).map((e) => e.id), ['event-feast'], 'status+tier 联合')

  // visibleIdsOf：无过滤 = null（图谱按全量报总数），有过滤 = Set（含空集）
  eq(visibleIdsOf(TREE_ENTRIES, {}), null, '无过滤轴 → null')
  eq(visibleIdsOf(TREE_ENTRIES, { cat: '全部' }), null, "cat='全部' 不算过滤 → null")
  eq([...visibleIdsOf(TREE_ENTRIES, { cat: '人物' })], ['char-zhangsan', 'char-lisi', 'char-wangwu'], 'cat 过滤 → id 集合')
  eq(visibleIdsOf(TREE_ENTRIES, { cat: '人物', status: 'draft' }).size, 0, '联合过滤为空 → 空 Set（不是 null）')
  eq(visibleIdsOf(TREE_ENTRIES, { tier: 'core' }).size, 0, 'tier 轴已启用即出 Set（0 条 = 空集，不回退成全量）')
  eq([...visibleIdsOf(undefined, { status: 'active' })], [], 'undefined 输入 + 过滤 → 空 Set')

  // hitIdsOf：kit 命中 + 一跳扩展并集（去重、无 id 丢弃、空/null → null）
  eq(hitIdsOf(null), null, '无检索结果 → null')
  eq(hitIdsOf({ hits: [], expansion: [] }), null, '零命中 → null')
  eq(
    [...hitIdsOf({ hits: [{ id: 'char-zhangsan' }, { id: '' }], expansion: [{ id: 'loc-wangcheng' }, { id: 'char-zhangsan' }] })],
    ['char-zhangsan', 'loc-wangcheng'],
    '命中∪扩展去重，空 id 丢弃'
  )
  eq(hitIdsOf({ hits: [{ id: 'a' }] }), new Set(['a']), '仅 hits 也成集合（图谱据此描环）')
}

/* ============ 6. 人物多维表格列模型（W3-A） ============ */

// 五行：主角（已建档缺弧线）/主要配角（异键 functionPosition）/NPC（异键 roleSlot）/
// 未建档纯正文【标签】/一条非人物（表格行集必须排除）
const TABLE_ENTRIES = [
  { id: 't-lead', name: '沈砚', type: 'character', tier: 'core', profile: { template: 'protagonist', values: { background: '旧军户之后', personality: '认死理' } }, content: '【背景】旧军户之后\n\n【性格】认死理' },
  { id: 't-support', name: '柳三娘', kind: 'character', status: 'draft', profile: { template: 'majorSupporting', values: { functionPosition: '线人', personality: '嘴快' } }, content: '【功能位】线人\n\n【性格】嘴快' },
  { id: 't-npc', name: '店小二', type: 'character', profile: { template: 'npc', values: { roleSlot: '报信', knowledgeScope: '只认得常客' } } },
  { id: 't-raw', name: '无名刀客', type: 'character', content: '【功能位】暗线\n\n【一句话标签】雨夜里不说话的那位' },
  { id: 't-place', name: '王城', type: 'location', content: '王城的城墙修了三百年。' }
]
const TABLE_WORLD = { entries: TABLE_ENTRIES }

function section6() {
  console.log('# 6. entryTableColumns（人物多维表格列模型）')

  // 列集：七模板字段按标签去重并集，跨模板异键（functionPosition/roleSlot）归并进同一列
  const columns = fieldColumns()
  eq(columns.slice(0, 4), ['背景', '性格', '外貌', '当前弧线'], '列序 = 模板声明序（背景/性格/外貌/当前弧线打头）')
  eq(columns.filter((label) => label === '功能位').length, 1, '功能位三模板异键只出一列')
  eq(new Set(columns).size, columns.length, '列标签无重复')
  ok(columns.includes('知识边界') && columns.includes('势力目标'), '专属字段（知识边界/势力目标）进并集')

  // 行集：只有人物条目
  eq(characterEntries(TABLE_WORLD).map((e) => e.id), ['t-lead', 't-support', 't-npc', 't-raw'], '行=character 条目，非人物（location）排除')
  eq(characterEntries(undefined), [], 'undefined 世界书 → 空行集')
  eq(isCharacterEntry({ kind: 'Character' }), true, 'kind 大小写不敏感')
  eq(isCharacterEntry({ type: ' character ' }), true, 'type 带空白仍算人物')
  eq(isCharacterEntry({}), false, '无 kind/type → 不是人物')

  // 建档判定：未建档行不替作者猜模板，也不谎报必填缺项
  eq(hasProfile(TABLE_ENTRIES[0]), true, '有 profile.template → 已建档')
  eq(hasProfile(TABLE_ENTRIES[3]), false, '只有正文【标签】→ 未建档')
  eq(rowTemplateId(TABLE_ENTRIES[3]), UNBOUND_TEMPLATE_ID, '未建档行模板 = UNBOUND 哨兵')
  eq(missingLabelsOf(TABLE_ENTRIES[0]), ['当前弧线'], '已建档主角缺当前弧线 → 必填缺项如实报')
  eq(missingLabelsOf(TABLE_ENTRIES[3]), [], '未建档行必填缺项为空（无模板无从谈缺项）')

  // 标签→落点键逐行解析，格子值跨键取
  eq(fieldOf(TABLE_ENTRIES[1], '功能位'), { key: 'functionPosition', multiline: true }, '配角线 功能位→functionPosition')
  eq(fieldOf(TABLE_ENTRIES[2], '功能位'), { key: 'roleSlot', multiline: true }, 'NPC 线 功能位→roleSlot')
  eq(fieldOf(TABLE_ENTRIES[3], '功能位'), { key: '功能位', multiline: true }, '未建档行 功能位→标签本身作自由键')
  eq(cellValueOf(TABLE_ENTRIES[1], '功能位'), '线人', '配角行取 functionPosition 值')
  eq(cellValueOf(TABLE_ENTRIES[2], '功能位'), '报信', 'NPC 行取 roleSlot 值（同一列不同键）')
  eq(cellValueOf(TABLE_ENTRIES[3], '一句话标签'), '雨夜里不说话的那位', '未建档行从正文【标签】反解')
  eq(cellValueOf(TABLE_ENTRIES[0], '秘密'), '', '无值字段读作空串（界面自己显示占位词）')

  // 分组轴委托单源：档位走注入端 entryTierOf，状态走 entryBrowserModel.entryStatusOf
  const rows = characterEntries(TABLE_WORLD)
  eq(groupEntries(rows, '').map((g) => [g.id, g.rows.length]), [['', 4]], '不分组 → 单组全量')
  eq(groupEntries(rows, 'template').map((g) => g.id), ['protagonist', 'majorSupporting', 'npc', UNBOUND_TEMPLATE_ID], '模板分组按声明序，未建档最后')
  eq(groupEntries(rows, 'tier').map((g) => [g.id, g.rows.map((e) => e.id)]), [['core', ['t-lead']], ['support', ['t-support', 't-npc', 't-raw']]], '档位分组：显式 tier 覆盖 + character 推导 support')
  eq(groupEntries(rows, 'tier').map((g) => g.id), [...new Set(rows.map(entryTierOf))], '档位桶 === entryTierOf 逐行判定（无第二套规则）')
  eq(groupEntries(rows, 'status').map((g) => [g.id, g.rows.length]), [['draft', 1], ['active', 3]], '状态分组委托 entryStatusOf（定序草稿在前）')
  eq(groupEntries([], 'template'), [], '空行集 → 零桶')
  eq([TIER_ORDER, STATUS_ORDER], [['core', 'support', 'background'], ['draft', 'active', 'retired']], '分桶定序常量与浏览器轴同序')

  // 显示口径：格子按「已存字段优先、正文兜底」渲染（表格没有常驻草稿，不能让旧正文顶回作者刚敲的值），
  // 代价是这种行必须显式标出「与正文不一致」——注入读的仍是正文
  const shadowed = { id: 't-shadow', name: '赵九', type: 'character', profile: { template: 'npc', values: { roleSlot: '暗桩', knowledgeScope: '' } }, content: '【功能位】店小二\n\n【知识边界】只认得常客' }
  eq(cellValueOf(shadowed, '功能位'), '暗桩', '已存字段优先于正文同名标签')
  eq(contentValueOf(shadowed, '功能位'), '店小二', 'contentValueOf 只看正文，不看已存字段')
  eq(cellOutOfSync(shadowed, '功能位'), true, '字段与正文不一致 → 差异标记')
  eq(cellValueOf(shadowed, '知识边界'), '', '已存空值也优先（作者清空这一格不被正文顶回）')
  eq(cellOutOfSync(shadowed, '知识边界'), true, '正文有、字段空 → 同样标记')
  eq(cellOutOfSync(shadowed, '登场范围'), false, '两边都空 → 不作差异')
  eq(missingLabelsOf(shadowed), ['知识边界'], '清空必填项如实进缺项列')
}

/* ============ 7. W3-A-2 表格收口：表种行集 / 混排列发现 / 正文块手术 / 伏笔台账行 ============ */

// 机器台账三件（章账 / 伏笔台账 / 底牌）：混排表里必须查无此条，否则作者能在表里删掉结算链的真相
const LEDGER_WORLD = {
  entries: [
    ...TABLE_ENTRIES,
    { id: 'm-chapter', name: '章账（结算）', type: 'general', content: '# 章账' },
    { id: 'm-foreshadow', name: '伏笔台账（结算）', type: 'general', extra: { auxRole: 'foreshadow-ledger' }, content: foreshadowLedgerSkeleton() },
    { id: 'm-covert', name: '暗线底牌', type: 'general', status: 'draft', tags: ['底牌', '暗线'], content: '不许注入' },
    { id: 'm-plain', name: '界力', type: 'general', content: '【一句话标签】天地间的规矩\n\n【来历】老一辈口耳相传' }
  ]
}

function section7() {
  console.log('# 7. W3-A-2 表格收口（表种 / 混排 / 正文块手术 / 伏笔台账）')

  // 表种行集：人物表与 v1 一致，混排收所有词条，机器台账三件两边都不出现
  eq(tableEntries(TABLE_WORLD, 'characters').map((e) => e.id), ['t-lead', 't-support', 't-npc', 't-raw'], '人物表行集 = character 条目（与 v1 同）')
  eq(tableEntries(TABLE_WORLD, 'all').map((e) => e.id), ['t-lead', 't-support', 't-npc', 't-raw', 't-place'], '混排行集 = 全部词条（含非人物）')
  eq(tableEntries(LEDGER_WORLD, 'all').map((e) => e.id), ['t-lead', 't-support', 't-npc', 't-raw', 't-place', 'm-plain'], '混排排除章账/伏笔台账/底牌三件机器条目')
  eq(tableEntries(LEDGER_WORLD, 'characters').map((e) => e.id), ['t-lead', 't-support', 't-npc', 't-raw'], '人物表同样排除机器台账（即便它们不是人物也不靠这层兜底）')
  eq(tableEntries(undefined, 'all'), [], '无世界书 → 空行集')
  eq(isMachineLedgerEntry(LEDGER_WORLD.entries.find((e) => e.id === 'm-foreshadow')), true, '伏笔台账按 auxRole 判定命中')
  eq(isMachineLedgerEntry({ id: 'm-plain', name: '界力', type: 'general' }), false, '普通设定条目不误伤')

  // 混排列发现：七模板并集打头（列序不动），正文【标签】里能读出值的自由标签续在后面的列
  const mixed = mixedFieldColumns(tableEntries(LEDGER_WORLD, 'all'))
  eq(mixed.slice(0, fieldColumns().length), fieldColumns(), '混排列的前缀 = 七模板字段并集（原列序不动）')
  ok(mixed.includes('一句话标签') && mixed.includes('来历'), '正文里读得出值的【标签】自发现成列')
  eq(mixed.filter((label) => label === '一句话标签').length, 1, '同一标签跨多条正文只出一列')
  eq(mixedFieldColumns([]), fieldColumns(), '空行集 = 模板并集（不凭空造列）')
  const voiceOnly = { id: 'v', name: '说书人', type: 'character', content: '【常用词】列位请了\n\n【禁用词】\n\n正文一段。' }
  ok(!mixedFieldColumns([voiceOnly]).includes('禁用词'), '正文里空的标签不成列（界面不会多一列全空）')

  // 正文块手术：未建档行按标签写回，只动这一块，其余字节原样
  const raw = '【背景】旧军户之后\n\n【性格】认死理\n'
  eq(setLabeledBlock(raw, '背景', '盐商之子'), '【背景】盐商之子\n\n【性格】认死理\n', '改已有块：只换块值，别的块一个字节不动')
  eq(setLabeledBlock(raw, '功能位', '暗线'), '【背景】旧军户之后\n\n【性格】认死理\n\n【功能位】暗线\n', '无该块：文末新建，不重排别人的块')
  eq(setLabeledBlock(raw, '背景', ''), '【性格】认死理\n', '清空：整块摘除，不留空壳')
  eq(setLabeledBlock(raw, '来历', ''), raw, '无该块且新值为空 → 原文（零写入语义）')
  eq(setLabeledBlock(raw, '', 'x'), raw, '空标签名 → 原文')
  eq(setLabeledBlock('【背景】甲\r\n\r\n【性格】乙\r\n', '背景', '丙'), '【背景】丙\n\n【性格】乙\n', 'CRLF 先归一再动刀')

  // 伏笔台账：骨架表头与列名常量同源，parse/upsert/remove 三件套在同一份正文上闭环
  const skeleton = foreshadowLedgerSkeleton()
  eq(skeleton.split('\n').find((line) => line.startsWith('|')).split('|').slice(1, -1).map((c) => c.trim()), FORESHADOW_LEDGER_LABELS, '骨架表头逐列 = FORESHADOW_LEDGER_LABELS（改骨架必同步此处）')
  eq(parseForeshadowLedger(skeleton), [], '骨架只有表头与分隔行 → 零行')
  const oneRow = updateForeshadowLedger(skeleton, { fid: 'F01', content: '雨夜借的伞', plantedAt: '第3章', dueBy: '第9章' })
  eq(parseForeshadowLedger(oneRow), [{ fid: 'F01', content: '雨夜借的伞', plantedAt: '第3章', dueBy: '第9章', status: 'open' }], '新增行落表尾，status 缺省 open')
  const paidRow = updateForeshadowLedger(oneRow, { fid: 'F01', content: '雨夜借的伞', plantedAt: '第3章', dueBy: '第12章', status: 'paid' })
  eq(parseForeshadowLedger(paidRow).length, 1, '同 fid 原位替换，行数不增')
  eq(parseForeshadowLedger(paidRow)[0], { fid: 'F01', content: '雨夜借的伞', plantedAt: '第3章', dueBy: '第12章', status: 'paid' }, '回收=改 status/dueBy，历史行不分裂')
  eq(parseForeshadowLedger(updateForeshadowLedger(skeleton, { fid: 'F02', status: 'maybe' }))[0].status, 'open', '非法状态归一回 open（与 upsert 同口径）')
  eq(parseForeshadowLedger(updateForeshadowLedger(skeleton, { fid: '', content: '没编号' })), [], 'fid 为空 → 整次写入作废')
  eq(updateForeshadowLedger(skeleton, { fid: 'F|03', content: 'a|b' }).includes('F／03'), true, '竖线转全角，表格行不被值里的 | 撑破')
  const twoRows = updateForeshadowLedger(paidRow, { fid: 'F02', content: '半块玉佩', plantedAt: '第5章', dueBy: '第20章' })
  eq(parseForeshadowLedger(twoRows).map((r) => r.fid), ['F01', 'F02'], '多行按落盘顺序读回')
  eq(parseForeshadowLedger(removeForeshadowLedgerRow(twoRows, 'F01')).map((r) => r.fid), ['F02'], '删行只摘那一行')
  eq(removeForeshadowLedgerRow(twoRows, 'F99'), twoRows, '无命中 fid → 原文（零写入语义）')
  eq(removeForeshadowLedgerRow(twoRows, ''), twoRows, '空 fid → 原文')
  ok(removeForeshadowLedgerRow(twoRows, 'F02').includes('| fid |'), '删到只剩表头也不动表头')

  // 台账建档载荷：与结算落库同一条目（名称/auxRole 双通道），建完即被识别为机器条目
  const draft = foreshadowLedgerEntryDraft()
  eq([draft.name, draft.type, draft.extra.auxRole], [FORESHADOW_LEDGER_ENTRY_NAME, 'general', 'foreshadow-ledger'], '台账载荷 = 结算链同一条目形状')
  eq(draft.content, skeleton, '新台账从骨架起步（与伏笔/台账.md 契约件一致）')
  eq(isForeshadowLedgerEntry(draft), true, '载荷即被 isForeshadowLedgerEntry 认出（建表后混排仍排除它）')
}

/* ============ runner ============ */

const sections = [section1, section2, section3, section4, section5, section6, section7]
try {
  for (const section of sections) section()
  console.log(`\nSMOKE OK: ${sections.length} sections / ${asserted} assertions / 0 failed`)
} catch (err) {
  console.error(`\nSMOKE FAILED after ${asserted} assertions: ${err.message}`)
  if (err.diff) console.error(err.diff)
  process.exit(1)
}
