#!/usr/bin/env node
/**
 * W3·B2/B3 条目编辑面冒烟（零 npm 依赖，node 直跑；退出码 0=过）。
 *
 * 只测纯逻辑模块（组件不测）：
 *   1. profile 七模板 + 声口横切：字段集/必填判定/renderToContent「【字段名】…」投影
 *   2. 双层 links 同步（entryRelations.applyRelationRows）：增/删/改后 links 纯 id 层
 *      与 relations 富关系层一致；旧对象分组升级不丢 tags
 *   3. 共现归纳建议（coOccurrenceEdgesForEntry）：正文标题出现次数 min(n,3) 权重，
 *      已关联目标不重复建议
 *   4. 注入一跳扩展（relationNeighborWeights + buildWorldbookContext）：weight 降序
 *      top-3、去重、排除已命中；低预算截断（超限跳过，预算不被挤爆）
 *   5. 改名触发词替换（entryProfileTemplates.renameEntryKeys）：旧名替换不追加；
 *      「新角色」占位残留仅在 keys 全等于旧占位名时清理
 *   6. 防漂移：applyRelationRows 产物经 shared/worldbookFileContract.js 序列化→
 *      解析往返，双层关系无损（B3 写库 → A1 文件同构）
 *
 * 运行：node scripts/worldbook-editing-smoke.mjs（或 npm run smoke:worldbook-editing）
 */
import assert from 'node:assert/strict'
import { parseWorldbookEntryFile, serializeWorldbookEntryFile } from '../shared/worldbookFileContract.js'
import { buildWorldbookContext } from '../src/services/worldbook/worldbookContextBuilder.js'
import {
  RELATION_TYPE_VALUES,
  applyRelationRows,
  coOccurrenceEdgesForEntry,
  normalizeEntryRelations,
  relationNeighborWeights,
  relationRowsFromEntry
} from '../src/services/worldbook/entryRelations.js'
import {
  DEFAULT_PROFILE_TEMPLATE_ID,
  ENTRY_PROFILE_TEMPLATES,
  isPlaceholderEntryName,
  missingRequiredLabels,
  parseLabeledBlocks,
  profileFromEntry,
  renameEntryKeys,
  getProfileTemplate
} from '../src/services/worldbook/entryProfileTemplates.js'

let asserted = 0
function ok(value, message) {
  asserted += 1
  assert.ok(value, message)
}
function eq(actual, expected, message) {
  asserted += 1
  assert.deepStrictEqual(actual, expected, message)
}

/* ---------- 1. profile 七模板 + 声口横切 ---------- */

console.log('# 1. entryProfileTemplates：七模板字段集 / 必填 / renderToContent 投影')

eq(ENTRY_PROFILE_TEMPLATES.length, 7, '恰好七个卡型模板（主角/主要配角/次要配角/NPC/路人/反派/势力人物）')
eq(
  ENTRY_PROFILE_TEMPLATES.map((template) => template.id),
  ['protagonist', 'majorSupporting', 'minorSupporting', 'npc', 'extra', 'villain', 'factionFigure'],
  '模板 id 集合与 §4.1 表一致'
)
ok(ENTRY_PROFILE_TEMPLATES.every((template) => Array.isArray(template.fields) && template.fields.length > 0), '每个模板都有字段集')
ok(ENTRY_PROFILE_TEMPLATES.every((template) => typeof template.renderToContent === 'function'), '每个模板都有 renderToContent')

// 必填口径（§4.1 最后一列）
const requiredOf = (id) => getProfileTemplate(id).fields.filter((field) => field.required).map((field) => field.key)
eq(requiredOf('protagonist'), ['background', 'personality', 'currentArc'], '主角必填=背景/性格/弧线')
eq(requiredOf('majorSupporting'), ['personality', 'functionPosition'], '主要配角必填=性格/功能位')
eq(requiredOf('minorSupporting'), ['functionPosition'], '次要配角必填=功能位')
eq(requiredOf('npc'), ['roleSlot', 'knowledgeScope'], 'NPC 必填=功能位/知识边界')
eq(requiredOf('extra'), ['oneLineTag'], '路人必填=一句话标签')
eq(requiredOf('villain'), ['threatLadder', 'ideology'], '反派必填=位阶/动机')
eq(requiredOf('factionFigure'), ['orgLink'], '势力人物必填=所属势力')

const blankProtagonist = { template: 'protagonist', values: {}, speech: { enabled: false } }
eq(
  missingRequiredLabels(blankProtagonist),
  ['背景', '性格', '当前弧线'],
  '必填缺失返回字段标签（供编辑面徽标）'
)

const profile = {
  template: 'villain',
  values: {
    background: '北境盐路的私盐头目',
    threatLadder: '三阶',
    ideology: '秩序由掌握供给的人定义',
    onstageRule: ''
  },
  speech: {
    enabled: true,
    speechStyle: '短句，多用盐与秤的比喻',
    vocabularyCommon: ['秤', '成色'],
    vocabularyForbidden: ['请'],
    samples: ['称一称你的诚意。', '成色不足。'],
    greeting: '又来称盐？'
  }
}
const villainTemplate = getProfileTemplate('villain')
const rendered = villainTemplate.renderToContent(profile)
for (const fragment of [
  '【背景】北境盐路的私盐头目',
  '【威胁位阶】三阶',
  '【动机信念】秩序由掌握供给的人定义',
  '【说话方式】短句，多用盐与秤的比喻',
  '【常用词】秤、成色',
  '【禁用词】请',
  '【示例台词】称一称你的诚意。\n成色不足。',
  '【登场问候】又来称盐？'
]) ok(rendered.includes(fragment), `投影含「${fragment.slice(0, 12)}…」块`)
ok(!rendered.includes('【登场规则】'), '空字段不投影（登场规则留空）')
ok(rendered.indexOf('【背景】') < rendered.indexOf('【威胁位阶】'), '字段按模板声明顺序投影')

const blankRendered = villainTemplate.renderToContent({ template: 'villain', values: {}, speech: { enabled: false } })
eq(blankRendered, '', '全空 profile 投影为空串（content 不被空投影覆盖）')

// 反解：parseLabeledBlocks/profileFromEntry 回填
eq(parseLabeledBlocks('【背景】A\n\n【性格】B\n续行'), [['背景', 'A'], ['性格', 'B\n续行']], '【标签】块反解（多行值保留）')
const seeded = profileFromEntry({ content: rendered }, 'villain')
eq(seeded.values.threatLadder, '三阶', 'profileFromEntry 从投影正文反解字段值')
eq(seeded.speech.vocabularyCommon, ['秤', '成色'], '声口常用词从正文反解（受 UI 编辑流双向使用）')

ok(getProfileTemplate('不存在的模板').id === DEFAULT_PROFILE_TEMPLATE_ID, '未知模板 id 回落默认模板')

/* ---------- 2. 双层 links 同步 ---------- */

console.log('# 2. entryRelations.applyRelationRows：双层同步（增/删/改一致 + 旧桶升级不丢 tags）')

const entryBase = { id: 'char-lin', name: '林照', tags: ['主角'], relations: { tags: ['结构化设定'], locations: ['loc-a'], characters: ['char-zh'] } }

// 增：从旧对象分组播种 → 加一条 10 枚举关系 → 两层同时出现
const rowsSeed = relationRowsFromEntry(entryBase)
eq(rowsSeed.map((row) => row.to), ['loc-a', 'char-zh'], '旧对象分组播种为编辑行（locations/characters 桶）')
eq(rowsSeed[0].type, 'location', 'locations 桶 → type=location（契约同口径）')

const rowsAdded = [...rowsSeed.map((row) => ({ ...row })), { to: 'char-mo', type: '敌对', stance: '负', covert: true, weight: 5, src: 'declared' }]
const appliedAdded = applyRelationRows(entryBase, rowsAdded)
eq(appliedAdded.links, ['loc-a', 'char-zh', 'char-mo'], 'links=全部 to 去重数组（新增同步进纯 id 层）')
eq(
  appliedAdded.relations,
  [
    { to: 'loc-a', type: 'location', stance: '', covert: false, weight: 2, src: 'declared' },
    { to: 'char-zh', type: 'character', stance: '', covert: false, weight: 2, src: 'declared' },
    { to: 'char-mo', type: '敌对', stance: '负', covert: true, weight: 5, src: 'declared' }
  ],
  'relations=富对象数组（新边含类型/立场/暗线/权重）'
)
eq(appliedAdded.tags, ['主角', '结构化设定'], '旧 relations.tags 桶升 tags 层，不丢失')

// 删：去掉一条 → 两层同时消失
const rowsRemoved = rowsAdded.filter((row) => row.to !== 'loc-a')
const appliedRemoved = applyRelationRows(entryBase, rowsRemoved)
eq(appliedRemoved.links, ['char-zh', 'char-mo'], '删除关系后 links 同步删除')
ok(!appliedRemoved.relations.some((edge) => edge.to === 'loc-a'), '删除关系后 relations 同步删除')

// 改：改类型/权重 → 两层一致
const rowsChanged = rowsAdded.map((row) => (row.to === 'char-mo' ? { ...row, type: '债务', weight: 3 } : row))
const appliedChanged = applyRelationRows(entryBase, rowsChanged)
eq(appliedChanged.relations.find((edge) => edge.to === 'char-mo').type, '债务', '改类型同步进富关系层')
eq(appliedChanged.links, ['loc-a', 'char-zh', 'char-mo'], '改类型不影响 links 目标集')

// 防御：空 to / 自引用 / 重复 to
const appliedGuard = applyRelationRows(entryBase, [
  { to: '  ', type: '敌对' },
  { to: 'char-lin', type: '敌对' },
  { to: 'char-mo', type: '敌对' },
  { to: 'char-mo', type: '债务' }
])
eq(appliedGuard.links, ['char-mo'], '空 to/自引用丢弃、重复 to 取首现（kit 每对目标一条边）')

// 富关系数组形状下 bound 绑定路径不空转（A4 回归不破）
const arrayShaped = { id: 'char-arr', relations: [{ to: 'loc-b', type: '地点归属', weight: 2 }, { to: 'char-x', type: 'character', weight: 2 }] }
eq(normalizeEntryRelations(arrayShaped), { locations: ['loc-b'], characters: ['char-x'] }, '数组形状 relations：地点归属/character 仍喂 bound 绑定路径')
eq(
  normalizeEntryRelations({ relations: { locations: ['loc-a'], placeIds: ['loc-old'] } }),
  { locations: ['loc-a'], characters: [] },
  '对象分组形状：locations 优先、placeIds 回落（W1 行为不变）'
)

ok(RELATION_TYPE_VALUES.length === 10, '关系类型恰 10 枚举')
eq(
  RELATION_TYPE_VALUES,
  ['亲属', '师承', '主从', '同僚', '敌对', '情感', '债务', '秘密知情', '地点归属', '势力成员'],
  '10 枚举值与 §4.2 一致'
)

/* ---------- 3. 共现归纳建议 ---------- */

console.log('# 3. entryRelations.coOccurrenceEdgesForEntry：min(n,3) 权重、只进复核清单')

const wbEntries = [
  { id: 'char-lin', name: '林照', content: '林照常去钟楼。钟楼！钟楼的钟声。' },
  { id: 'loc-tower', name: '钟楼', content: '钟楼立在北岸。' },
  { id: 'org-salt', name: '潮盐行会', content: '潮盐行会控制供给。' },
  { id: 'loc-a', name: '旧馆', content: '旧馆已封。' }
]
// char-lin 的正文里「钟楼」出现 3 次 → weight=min(3,3)=3；「潮盐行会」0 次；「旧馆」0 次
const suggestions = coOccurrenceEdgesForEntry(wbEntries[0], wbEntries)
eq(suggestions.map((s) => s.to), ['loc-tower'], '只建议正文出现过的目标条目')
eq(suggestions[0].count, 3, '证据计数=标题出现次数')
eq(suggestions[0].weight, 3, '权重=min(n,3)')
eq(suggestions[0].src, 'co-occurrence', '建议边标记 src=co-occurrence')

// 已在关系层/links 层里的目标不重复建议
const withExisting = { ...wbEntries[0], relations: [{ to: 'loc-tower', type: '地点归属', weight: 2 }], links: ['org-salt'] }
eq(coOccurrenceEdgesForEntry(withExisting, wbEntries).map((s) => s.to), [], '已关联目标不再建议（双层都算已关联）')

const shortTitle = coOccurrenceEdgesForEntry({ id: 'x', name: '林照', content: '北北北北' }, [
  { id: 'y', name: '北', content: '' }
])
eq(shortTitle, [], '标题长度 <2 不参与共现（防单字误伤）')

/* ---------- 4. 注入一跳扩展 ---------- */

console.log('# 4. relationNeighborWeights + buildWorldbookContext：weight 降序 top-3、去重、低预算截断')

const graphEntries = [
  { id: 'hit-1', name: '命中一', type: 'character', keys: ['命中一'], content: '命中一的内容。', relations: [{ to: 'far-9', type: '敌对', weight: 9 }, { to: 'mid-5', type: '同僚', weight: 5 }] },
  { id: 'hit-2', name: '命中二', type: 'character', keys: ['命中二'], content: '命中二的内容。', links: ['mid-5', 'low-1', 'mid-5'] },
  { id: 'far-9', name: '远邻九', type: 'location', content: '远邻九的内容。' },
  { id: 'mid-5', name: '中邻五', type: 'location', content: '中邻五的内容。' },
  { id: 'low-1', name: '低邻一', type: 'item', content: '低邻一的内容。' },
  { id: 'noise', name: '无关条目', type: 'general', content: '无关内容。', keys: ['不触发'] }
]
const matched = [
  { id: 'hit-1', relations: graphEntries[0].relations },
  { id: 'hit-2', links: graphEntries[1].links }
]
// mid-5 被两条命中共享：去重保序，weight=max(5,2)=5
eq(
  relationNeighborWeights(matched, graphEntries, { limit: 3 }).map((n) => n.id),
  ['far-9', 'mid-5', 'low-1'],
  '邻居按 weight 降序 top-3、跨命中去重（mid-5 归并）'
)
eq(
  relationNeighborWeights(matched, graphEntries, { limit: 2 }).map((n) => n.id),
  ['far-9', 'mid-5'],
  'limit 截断生效'
)
ok(relationNeighborWeights([], graphEntries, { limit: 3 }).length === 0, '无命中 → 无邻居')

// 端到端：buildWorldbookContext 注入一跳（matchReason='linked' 垫底、正文附带）
const context = buildWorldbookContext({
  worldbook: { id: 'wb-1', name: '一跳世界书', entries: graphEntries },
  chatHistory: [{ role: 'user', content: '命中一和命中二都出现了' }],
  tokenBudget: 2000
})
const matchedIds = context.matchedEntries.map((entry) => entry.id)
ok(matchedIds.includes('far-9') && matchedIds.includes('mid-5') && matchedIds.includes('low-1'), '一跳邻居进入 matchedEntries')
eq(matchedIds.slice(-3), ['far-9', 'mid-5', 'low-1'], 'linked 条目排序垫底（主命中优先占预算）')
ok(context.matchedEntries.filter((entry) => entry.matchReason === 'linked').every((entry) => entry.matchedKeysLabel === '关联条目'), 'linked 条目标注 matchReason/label')
ok(context.messages[0].content.includes('◇ 【远邻九】'), 'linked 条目以关联标记附带注入')
ok(!context.matchedEntries.some((entry) => entry.id === 'noise'), '未命中且无关联的条目不进上下文')

// 预算截断：预算 100 → linked 单条上限 max(80, 100×20%)=80 token，超限跳过且主条目不受挤占
const longContent = '远'.repeat(400)
const tightContext = buildWorldbookContext({
  worldbook: {
    id: 'wb-2',
    name: '紧预算世界书',
    entries: [
      { id: 'hit', name: '命中条目', type: 'character', keys: ['命中'], content: '命中内容。', links: ['linked-big', 'linked-small'] },
      { id: 'linked-big', name: '超限关联', type: 'general', content: longContent },
      { id: 'linked-small', name: '小巧关联', type: 'general', content: '小内容。' }
    ]
  },
  chatHistory: [{ role: 'user', content: '命中' }],
  tokenBudget: 120
})
const tightMatched = tightContext.matchedEntries.map((entry) => entry.id)
ok(tightMatched.includes('hit') && tightMatched.includes('linked-big') && tightMatched.includes('linked-small'), '一跳扩展照常产出 matchedEntries（预算在注入端裁决）')
ok(tightContext.messages[0].content.includes('小巧关联'), '预算内的关联条目被注入')
ok(!tightContext.messages[0].content.includes(longContent), '超低预算上限的关联条目不注入（不计预算外）')
ok(tightContext.warnings.some((warning) => String(warning).startsWith('linked-skipped:超限关联')), '超限关联条目记 linked-skipped 警告')
ok(tightContext.warnings.some((warning) => warning === 'truncated:命中条目' || tightContext.messages[0].content.includes('命中条目')), '主条目不受一跳挤占（先注入）')
const ledgerLinked = tightContext.contextLedger.parts.find((part) => part.entryId === 'linked-big')
ok(ledgerLinked && ledgerLinked.included === false && ledgerLinked.purpose === 'worldbook-entry-skipped-linked', 'contextLedger 记录被跳过的关联条目（included=false）')

// 无 relations/links 的世界书零变化（回归护栏）
const plainContext = buildWorldbookContext({
  worldbook: {
    name: '朴素世界书',
    entries: [
      { id: 'a', name: '常驻', type: 'rule', content: '规则', injection: { mode: 'constant' } },
      { id: 'b', name: '触发', type: 'general', content: '内容', keys: ['目标'] }
    ]
  },
  chatHistory: [{ role: 'user', content: '目标出现了' }]
})
eq(plainContext.matchedEntries.map((entry) => entry.id), ['a', 'b'], '无 relations/links：命中集与既有行为逐条一致（W3 前回归护栏）')

/* ---------- 5. 改名触发词替换 ---------- */

console.log('# 5. entryProfiles.renameEntryKeys：旧名替换不追加 + 占位残留保守清理')

eq(renameEntryKeys({ keys: ['旧名', '守门人'], previousName: '旧名', nextName: '林照' }), ['林照', '守门人'], '改名=旧名替换为实名（修复前会追加成 [实名,旧名,守门人]）')
eq(renameEntryKeys({ keys: ['新角色'], previousName: '新角色', nextName: '林照' }), ['林照'], '创建占位名 → 实名：整表替换')
eq(renameEntryKeys({ keys: ['新角色', '守门人'], previousName: '新角色', nextName: '林照' }), ['林照', '守门人'], '占位名+别名：替换占位、保留别名')
eq(renameEntryKeys({ keys: ['别名'], previousName: '旧名', nextName: '林照' }), ['林照', '别名'], 'keys 无旧名：实名插首（保证实名始终是触发词）')
eq(renameEntryKeys({ keys: ['林照', '新角色'], previousName: '林照', nextName: '林照' }), ['林照', '新角色'], '历史残留（keys≠全占位）不动——保守清理不误删作者别名')
eq(renameEntryKeys({ keys: ['新角色'], previousName: '林照', nextName: '林照' }), ['林照'], 'keys 全等于旧占位名且旧名已是实名：一次性清理为实名')
eq(renameEntryKeys({ keys: [' 林照 ', '', '林照', '守门人'], previousName: '林照', nextName: '林照' }), ['林照', '守门人'], '去空白、去重（旧实现同口径）')
eq(renameEntryKeys({ keys: ['旧名'], previousName: '旧名', nextName: '' }), ['旧名'], '空实名不改 keys（上游面板已拦截空名，不会走到这里）')
ok(isPlaceholderEntryName('新角色') && isPlaceholderEntryName('New character') && !isPlaceholderEntryName('林照'), '占位名判定覆盖中英两种创建缺省')

/* ---------- 6. 防漂移：双层关系经文件契约往返无损 ---------- */

console.log('# 6. 与 shared/worldbookFileContract 往返：B3 写库 → A1 文件同构')

const fileEntry = {
  id: 'char-lin',
  name: '林照',
  type: 'character',
  keys: ['林照'],
  content: '林照的内容。',
  ...appliedAdded
}
const parsed = parseWorldbookEntryFile(serializeWorldbookEntryFile(fileEntry))
ok(parsed.ok, `文件往返解析成功（${parsed.ok ? '' : parsed.error?.message}）`)
eq(parsed.entry.relations, appliedAdded.relations, 'relations 富关系数组往返无损')
// 契约语义：解析侧 links = fm.links − relations.to。编辑面写回的 links 与
// relations.to 完全重合 → 纯层被富层吸收（边集等价）；再序列化 fm.links 仍由
// links ∪ relations.to 合成回原集，kit 看到的声明边不变。
eq(parsed.entry.links, [], '解析侧纯层为空（links 全部由富关系层承接，契约减法语义）')
eq(
  [...new Set([...parsed.entry.links, ...parsed.entry.relations.map((edge) => edge.to)])],
  appliedAdded.links,
  '边目标全集往返一致（fm.links=links ∪ relations.to 合成无损）'
)
eq(parsed.entry.tags, appliedAdded.tags, 'tags 层往返无损')

console.log(`\n${asserted} assertions passed`)
process.exit(0)
