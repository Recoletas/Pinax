#!/usr/bin/env node
/**
 * W5·B5 章回结算冒烟（零 npm 依赖，node 直跑；退出码 0=过）。
 *
 * 只测纯逻辑模块（组件不测）：
 *   1. 章账五件之 ①③：appendChapterCard（追加+幂等）与 appendHandoff（3-5 条+
 *      同章重结算原位替换）；extractHandoffSection=末节语义
 *   2. 五件之 ②：advanceCharacterState——【当前状态】改写 +【变动史】追加，
 *      背景/性格/外貌等静态段字节不动；无变动零写入
 *   3. 五件之 ④：updateForeshadowLedger 行级 upsert（fid 原位更新、状态归一
 *      open|paid|retired、表头缺失补骨架）
 *   4. 五件之 ⑤：recordWorldReveal 清单（去空/去重/原对象不动）
 *   5. settlementFromTurn 草案：本地确定性抽取（首句/提及/新名目），返回值即草案、
 *      零写入（不触碰任何 channel）；applyChapterSettlement 经注入 repository
 *      显式落库（五件逐件、单件失败不上抛）
 *   6. contextBuilder 底牌排除：status draft+底牌标记条目在任何激活路径
 *      （constant/history/bound/keyword/starter/linked）都不进上下文
 *   7. contextBuilder 章账末节 handoff：末节进 continuity、非末节历史不进；
 *      预算不足记 handoff-skipped；无章账条目零行为差异
 *
 * 运行：node scripts/worldbook-settlement-smoke.mjs（或 npm run smoke:worldbook-settlement）
 */
import assert from 'node:assert/strict'
import { buildWorldbookContext, matchWorldbookEntries } from '../src/services/worldbook/worldbookContextBuilder.js'
import {
  CHAPTER_LEDGER_ENTRY_NAME,
  FORESHADOW_LEDGER_ENTRY_NAME,
  HANDOFF_MAX_ITEMS,
  HANDOFF_MIN_ITEMS,
  advanceCharacterState,
  appendChapterCard,
  appendHandoff,
  applyChapterSettlement,
  chapterLedgerSkeleton,
  createSettlementChannel,
  extractHandoffSection,
  isChapterLedgerEntry,
  isCovertCardEntry,
  isForeshadowLedgerEntry,
  foreshadowLedgerSkeleton,
  recordWorldReveal,
  settlementFromTurn,
  updateForeshadowLedger
} from '../src/services/worldbook/settlementService.js'

let asserted = 0
function ok(value, message) {
  asserted += 1
  assert.ok(value, message)
}
function eq(actual, expected, message) {
  asserted += 1
  assert.deepStrictEqual(actual, expected, message)
}

/* ---------- 1. 章账：章卡追加 + 交接末节 ---------- */

console.log('# 1. appendChapterCard/appendHandoff：追加、幂等、3-5 条、末节=handoff')

const skeleton = chapterLedgerSkeleton()
ok(skeleton.includes('# 章账（逐章结算 = handoff）'), '章账骨架与 A2 骨架件同源')

const withCard = appendChapterCard(skeleton, {
  chapterTitle: '第1章 霜港',
  summary: '林照抵达霜港，盐引文书缺页。',
  hook: '悬念钩：灯下无影',
  newTerms: ['盐引', '潮盐行会']
})
ok(withCard.includes('## 第1章 霜港（章卡）'), '章卡以章节标题追加一节')
ok(withCard.includes('- 一句话：林照抵达霜港，盐引文书缺页。'), '章卡含一句话')
ok(withCard.includes('- 梗点/钩子：悬念钩：灯下无影'), '章卡含梗点/钩型')
ok(withCard.includes('- 新名目：盐引、潮盐行会'), '章卡含新名目')
ok(withCard.startsWith(skeleton.replace(/\n+$/, '')) || withCard.includes(skeleton.trim()), '追加不破坏既有账目')

const withCardAgain = appendChapterCard(withCard, { chapterTitle: '第1章 霜港', summary: '重复结算' })
eq(withCardAgain, withCard, '同名章节重复结算幂等（不重复追加）')

eq(appendChapterCard(withCard, { chapterTitle: '  ', summary: 'x' }), withCard, '空标题不追加')

const withHandoff = appendHandoff(withCard, [
  '旧馆的灯每晚亮起', '盐引文书缺失三页', '林照轻伤未愈'
], { chapterTitle: '第1章 霜港' })
ok(withHandoff.includes('## 交接 · 第1章 霜港（下一章 handoff）'), '交接成为独立一节')
ok(withHandoff.trim().endsWith('- 林照轻伤未愈'), '交接节是账目末节（kit：只读末节）')

eq(appendHandoff(withCard, ['只有一条', '只有两条'], { chapterTitle: '第1章' }), withCard, '交接不足 3 条不写入（伪 handoff 防线）')
eq(HANDOFF_MIN_ITEMS, 3, '交接下限常量=3（kit 语义锁定）')
const clampSource = Array.from({ length: 7 }, (_, i) => `条目${i + 1}`)
const clamped = appendHandoff(withCard, clampSource, { chapterTitle: '第2章' })
eq((clamped.match(/^- 条目\d+$/gm) || []).length, HANDOFF_MAX_ITEMS, '交接超过 5 条截前 5')
ok(clamped.includes('- 条目5') && !clamped.includes('- 条目6'), '截断保留前 5 条')

const replaced = appendHandoff(withHandoff, ['新事实一', '新事实二', '新事实三'], { chapterTitle: '第1章 霜港' })
ok(!replaced.includes('旧馆的灯每晚亮起'), '同章重结算：旧交接正文被原位替换')
ok(replaced.includes('新事实一') && replaced.includes('新事实三'), '替换后写入新交接')
eq((replaced.match(/^## 交接 · 第1章 霜港（下一章 handoff）$/gm) || []).length, 1, '不产生重复交接节')

eq(extractHandoffSection(withHandoff), '- 旧馆的灯每晚亮起\n- 盐引文书缺失三页\n- 林照轻伤未愈', '末节提取=交接正文（不含标题）')
ok(!extractHandoffSection(withHandoff).includes('一句话'), '非末节历史（章卡）不进末节提取')
eq(extractHandoffSection(''), '', '空账末节为空')

/* ---------- 2. 人物状态推进 ---------- */

console.log('# 2. advanceCharacterState：当前状态改写 + 变动史追加 + 静态段字节不动')

const staticPrefix = '【背景】北境盐路出身。\n\n【性格】外冷内热。\n\n【外貌】瘦高，左眉有疤。'
const charEntry = {
  id: 'char-lin',
  name: '林照',
  type: 'character',
  content: `${staticPrefix}\n\n【当前状态】\n伤势：无\n位置：霜港\n\n【变动史】\n- 第1章：知情 获知盐引异动\n`
}

const advanced = advanceCharacterState(charEntry, {
  injury: '轻伤未愈',
  location: '北岸旧馆',
  chapter: '第2章',
  note: '夜探旧馆'
})
ok(advanced.content.startsWith(staticPrefix), '背景/性格/外貌等静态段字节不动（手术只定位两个滚动段）')
ok(advanced.content.includes('伤势：轻伤未愈'), '【当前状态】伤势行改写')
ok(advanced.content.includes('位置：北岸旧馆'), '【当前状态】位置行改写')
ok(!advanced.content.includes('伤势：无'), '旧状态值被替换（非追加）')
ok(advanced.content.includes('- 第2章：伤势 轻伤未愈；位置 北岸旧馆（夜探旧馆）'), '【变动史】追加一条滚动记录')
ok(advanced.content.includes('- 第1章：知情 获知盐引异动'), '既有变动史保留（追加式）')
eq(advanced.id, 'char-lin', '返回新条目对象（原条目不动）')
eq(charEntry.content.includes('轻伤未愈'), false, '原条目 content 不被就地修改')

const reAdvanced = advanceCharacterState(advanced, {
  injury: '轻伤未愈',
  location: '北岸旧馆',
  chapter: '第2章',
  note: '夜探旧馆'
})
eq(reAdvanced.content, advanced.content, '同章同变动重放幂等（变动史不重复追加）')

const missingBlocks = advanceCharacterState({ id: 'c2', name: '无段角色', content: '【背景】出身南方。' }, {
  money: '盐引三张', chapter: '第3章'
})
ok(missingBlocks.content.startsWith('【背景】出身南方。'), '无滚动段条目：静态段仍不动')
ok(missingBlocks.content.includes('【当前状态】财物：盐引三张'), '缺【当前状态】段则文末新建')
ok(missingBlocks.content.includes('【变动史】- 第3章：财物 盐引三张'), '缺【变动史】段则文末新建')

eq(advanceCharacterState(charEntry, {}), charEntry, '无任何变动 → 原条目原样返回（零写入）')
eq(advanceCharacterState(charEntry, { note: '  ' }), charEntry, '纯空白变动视同无变动')

/* ---------- 3. 伏笔台账 upsert ---------- */

console.log('# 3. updateForeshadowLedger：fid 行级 upsert、状态归一、骨架补齐')

const ledger0 = foreshadowLedgerSkeleton()
const fb1 = updateForeshadowLedger(ledger0, { fid: 'F-001', content: '旧馆的灯', plantedAt: '第1章', dueBy: '第5章', status: 'open' })
ok(fb1.includes('| F-001 | 旧馆的灯 | 第1章 | 第5章 | open |'), '新 fid 追加一行（机器可读管道表）')

const fb2 = updateForeshadowLedger(fb1, { fid: 'F-001', content: '旧馆的灯', plantedAt: '第1章', dueBy: '第4章', status: 'paid' })
eq((fb2.match(/^\| F-001 \|/gm) || []).length, 1, '同 fid 原位更新（不重复成行）')
ok(fb2.includes('| F-001 | 旧馆的灯 | 第1章 | 第4章 | paid |'), '回收=改 status/dueBy 行')
ok(fb2.split('\n').filter((line) => line.startsWith('|')).length === fb1.split('\n').filter((line) => line.startsWith('|')).length, '行数不变（原位替换）')

const fb3 = updateForeshadowLedger(fb2, { fid: 'F-002', content: '缺页的盐引', plantedAt: '第2章', status: 'dropped' })
ok(fb3.includes('| F-002 | 缺页的盐引 | 第2章 |  | open |'), '非法状态归一为 open（kit 状态机）')

const fb4 = updateForeshadowLedger(fb3, { fid: 'F|003', content: '带竖线内容' })
ok(fb4.includes('| F／003 | 带竖线内容 |  |  | open |'), '单元格内竖线转义（表格不破）')

const fb5 = updateForeshadowLedger('# 自由记录\n\n随手写的台账\n', { fid: 'F-009', content: '骨架缺失补齐' })
ok(fb5.includes('| fid | 内容 | 埋点 | 预定回收 | 状态 |'), '表头缺失时补齐骨架表头')
ok(fb5.includes('| F-009 | 骨架缺失补齐 |  |  | open |'), '补表头后照常落行')

eq(updateForeshadowLedger(ledger0, { fid: '  ', content: 'x' }), ledger0, '空 fid 不落行')
eq(updateForeshadowLedger(ledger0, { fid: 'F-000', status: 'retired' }), ledger0 + '| F-000 |  |  |  | retired |\n', 'retired 合法状态直写')

/* ---------- 4. 世界揭示清单 ---------- */

console.log('# 4. recordWorldReveal：清单登记（去空/去重/原对象不动）')

const settlement4 = { worldReveals: [{ text: '盐引由潮盐行会垄断', adopted: false }] }
const reveals = recordWorldReveal(settlement4, ['旧馆建于前朝', ' 盐引由潮盐行会垄断 ', '', '旧馆建于前朝'])
eq(reveals.map((item) => item.text), ['盐引由潮盐行会垄断', '旧馆建于前朝'], '去空、折叠空白、按文本去重（含既有项）')
eq(reveals[1].adopted, false, '新项 adopted:false（采纳=显式写入动作）')
eq(settlement4.worldReveals.length, 1, '原 settlement 对象不被改动（纯函数）')
eq(recordWorldReveal(null, ['x'])[0].text, 'x', '无既有清单时从零登记')

/* ---------- 5. 草案 + 显式落库（repository 注入） ---------- */

console.log('# 5. settlementFromTurn 草案（零写入）+ applyChapterSettlement（逐件显式）')

const wbEntries = [
  { id: 'char-lin', name: '林照', type: 'character', keys: ['林照'] },
  { id: 'loc-gang', name: '霜港', type: 'location', keys: ['霜港'] },
  { id: 'org-chao', name: '潮盐行会', type: 'organization' }
]
const turnText = '林照走进霜港的旧馆，《盐引》文书缺了三页，SaltMarch 的密谋浮出水面。潮盐行会的灯还亮着。'
const draft = settlementFromTurn({ chapterTitle: '第2章 旧馆', text: turnText, entries: wbEntries })
eq(draft.chapterCard.summary, '林照走进霜港的旧馆，《盐引》文书缺了三页，SaltMarch 的密谋浮出水面。', '章卡一句话=首句')
eq(draft.mentions.map((m) => m.entryId), ['char-lin', 'loc-gang', 'org-chao'], '人物提及=确定性子串命中（name/keys）')
eq(draft.chapterCard.newTerms, ['盐引', 'SaltMarch'], '新名目=引号名目+拉丁专名，剔除已知词表')
eq(draft.handoff, [], '草案不代写交接（必须作者亲笔 3-5 条）')
eq(draft.foreshadow, [], '草案不代写伏笔')
eq(draft.characterStates.length, 3, '提及角色带入状态草案行（全空待作者填）')
eq(draft.characterStates[0].deltas, { injury: '', money: '', knowledge: '', relations: '', location: '', note: '' }, '状态草案维度=伤/钱/知情/关系/位置')

// 草案零写入：settlementFromTurn 不接 channel；重复调用结果稳定（generatedAt 除外）
const draftAgain = settlementFromTurn({ chapterTitle: '第2章 旧馆', text: turnText, entries: wbEntries })
const { generatedAt: _a, ...draftCore } = draft
const { generatedAt: _b, ...draftAgainCore } = draftAgain
eq(draftAgainCore, draftCore, '草案确定性：同输入同草案（返回值即草案，无副作用）')

function makeChannel(seedEntries) {
  const entries = seedEntries.map((entry) => ({ ...entry }))
  let seq = 0
  return {
    entries,
    listEntries: () => entries,
    async addEntry(payload) {
      const entry = { ...payload, id: `new-${seq += 1}` }
      entries.push(entry)
      return entry
    },
    async updateEntry(entryId, updates) {
      const entry = entries.find((item) => item.id === entryId)
      if (!entry) throw new Error('条目不存在')
      Object.assign(entry, updates)
      return entry
    }
  }
}

const channel = makeChannel([{ id: 'char-lin', name: '林照', type: 'character', content: staticPrefix }])
const settlement5 = {
  chapterTitle: '第2章 旧馆',
  chapterCard: { summary: '林照夜探旧馆。', hook: '灯亮之谜', newTerms: ['盐引'] },
  handoff: ['旧馆的灯每晚亮起', '盐引缺三页', '林照轻伤未愈'],
  characterStates: [{ entryId: 'char-lin', name: '林照', deltas: { injury: '轻伤未愈', chapter: '第2章' } }],
  foreshadow: [{ fid: 'F-001', content: '旧馆的灯', plantedAt: '第2章', status: 'open' }],
  worldReveals: [{ text: '盐引由潮盐行会垄断', name: '盐引制度', adopted: false }]
}

;(async () => {
  const { results } = await applyChapterSettlement(createSettlementChannel({
    listEntries: channel.listEntries,
    addEntry: channel.addEntry,
    updateEntry: channel.updateEntry
  }), settlement5)
  ok(results.chapterCard?.ok && !results.chapterCard.skipped, '件① 章卡落库')
  ok(results.handoff?.ok && !results.handoff.skipped, '件③ 交接落库')
  ok(results.characterStates?.ok && results.characterStates.applied.length === 1, '件② 人物状态落库')
  ok(results.foreshadow?.ok, '件④ 伏笔台账落库')
  ok(results.worldReveals?.ok && results.worldReveals.applied.length === 1, '件⑤ 世界揭示采纳为设定条目')

  const ledgerEntry = channel.entries.find((entry) => isChapterLedgerEntry(entry))
  ok(ledgerEntry, `章账以结算条目形态创建（${CHAPTER_LEDGER_ENTRY_NAME}）`)
  eq(ledgerEntry.type, 'event', '章账条目 type=event → A3 落盘到 编年/ 域')
  ok(ledgerEntry.content.includes('## 第2章 旧馆（章卡）'), '章账含本章章卡节')
  ok(extractHandoffSection(ledgerEntry.content).includes('- 旧馆的灯每晚亮起'), '章账末节=交接（handoff 语义）')
  const charAfter = channel.entries.find((entry) => entry.id === 'char-lin')
  ok(charAfter.content.includes('伤势：轻伤未愈'), '人物条目当前状态经 updateEntry 保存接缝改写')
  const foreshadowEntry = channel.entries.find((entry) => isForeshadowLedgerEntry(entry))
  ok(foreshadowEntry && foreshadowEntry.content.includes('| F-001 | 旧馆的灯 | 第2章 |  | open |'), `伏笔台账以条目形态创建（${FORESHADOW_LEDGER_ENTRY_NAME}）`)
  const revealEntry = channel.entries.find((entry) => entry.name === '盐引制度')
  eq(revealEntry?.type, 'lore', '世界揭示采纳为设定（lore）条目')

  // 重放：章卡幂等跳过；交接原位替换；状态重放零写入；揭示 adopted 后不重复采纳
  settlement5.worldReveals[0].adopted = true
  const replay = await applyChapterSettlement(createSettlementChannel({
    listEntries: channel.listEntries,
    addEntry: channel.addEntry,
    updateEntry: channel.updateEntry
  }), settlement5)
  eq(replay.results.chapterCard.skipped, true, '同章章卡重放跳过（幂等）')
  eq(replay.results.characterStates.applied.length, 0, '状态重放零写入')
  eq(replay.results.worldReveals.applied.length, 0, '已采纳揭示不重复建条目')
  const ledgerAfterReplay = channel.entries.find((entry) => isChapterLedgerEntry(entry))
  eq((ledgerAfterReplay.content.match(/^## 交接 · 第2章 旧馆（下一章 handoff）$/gm) || []).length, 1, '交接重放不产生重复节')

  // 单件失败不上抛：状态行指向不存在条目 → 逐件收集 error
  const broken = makeChannel([])
  const brokenRun = await applyChapterSettlement(createSettlementChannel({
    listEntries: broken.listEntries,
    addEntry: broken.addEntry,
    updateEntry: () => { throw new Error('boom') }
  }), {
    chapterTitle: '第3章',
    handoff: ['a', 'b', 'c'],
    characterStates: [{ entryId: 'ghost', name: '幽灵', deltas: { injury: 'x' } }]
  })
  eq(brokenRun.results.characterStates.ok, false, '件② 失败被收集（不上抛）')
  ok(String(brokenRun.results.characterStates.error).includes('幽灵'), '错误带条目名（可定位）')
  ok(brokenRun.results.handoff.ok, '单件失败不影响其他件（交接照常落账）')

  /* ---------- 6. contextBuilder：底牌排除（多激活路径） ---------- */

  console.log('# 6. 底牌排除：draft+底牌标记在任何激活路径都不进上下文')

  const covertCard = {
    id: 'covert-1',
    name: '暗线底牌（作者专用·永不入正文）',
    type: 'general',
    status: 'draft',
    cat: ['底牌'],
    keys: ['盐引真伪'],
    content: '底牌内容：盐引是伪造的。',
    injection: { mode: 'constant' }
  }
  ok(isCovertCardEntry(covertCard), '底牌判定：status draft + cat 含底牌')
  ok(isCovertCardEntry({ status: 'draft', tags: ['底牌', '暗线'] }), '骨架形态（tags 标记、无 cat）同样被判定')
  ok(!isCovertCardEntry({ status: 'active', cat: ['底牌'] }), '非 draft 不拦（状态机放行 retired/active）')
  ok(!isCovertCardEntry({ status: 'draft', name: '旧馆草稿' }), '普通 draft 条目不误伤')

  const paths = [
    ['constant 常驻', { worldbook: covertWorldbook({ mode: 'constant' }), chatHistory: [] }],
    ['keyword 关键词', { worldbook: covertWorldbook({ mode: 'selective' }), chatHistory: [{ role: 'user', content: '盐引真伪如何' }] }],
    ['history 历史绑定', { worldbook: covertWorldbook({ mode: 'selective' }), chatHistory: [], historyEntryIds: ['covert-1'] }],
    ['bound 地点绑定', { worldbook: covertWorldbookBound(), chatHistory: [], runtimeState: { placeId: 'loc-a' } }],
    ['starter 开局', { worldbook: covertWorldbook({ mode: 'selective' }), chatHistory: [], includeStarterEntries: true }],
    ['linked 一跳关联', { worldbook: covertWorldbookLinked(), chatHistory: [{ role: 'user', content: '命中条目出现了' }] }]
  ]
  function covertWorldbook(injection) {
    return { id: 'wb-covert', name: '底牌世界书', entries: [{ ...covertCard, injection }] }
  }
  function covertWorldbookBound() {
    return {
      id: 'wb-covert-bound',
      name: '底牌世界书',
      entries: [{ ...covertCard, injection: { mode: 'selective' }, relations: [{ to: 'loc-a', type: '地点归属', weight: 2 }] }]
    }
  }
  function covertWorldbookLinked() {
    return {
      id: 'wb-covert-linked',
      name: '底牌世界书',
      entries: [
        { id: 'hit', name: '命中条目', type: 'general', keys: ['命中条目'], content: '命中内容。', links: ['covert-1'] },
        { ...covertCard }
      ]
    }
  }
  for (const [label, options] of paths) {
    const matched = matchWorldbookEntries(options)
    ok(!matched.some((entry) => entry.id === 'covert-1'), `${label}：底牌不进 matchedEntries`)
    const context = buildWorldbookContext({ ...options, tokenBudget: 2000 })
    ok(!String(context.messages[0]?.content || '').includes('底牌内容'), `${label}：底牌正文不进注入消息`)
  }

  // 普通 draft 条目（无底牌标记）不受排除影响——draft 是合法工作态
  const draftContext = buildWorldbookContext({
    worldbook: {
      id: 'wb-draft-ok',
      name: '草稿世界书',
      entries: [{ id: 'draft-loc', name: '旧馆', type: 'location', status: 'draft', keys: ['旧馆'], content: '旧馆内容。' }]
    },
    chatHistory: [{ role: 'user', content: '旧馆' }]
  })
  ok(draftContext.matchedEntries.some((entry) => entry.id === 'draft-loc'), '普通 draft 条目照常激活（排除只针对底牌标记）')

  /* ---------- 7. contextBuilder：章账末节 handoff 注入 ---------- */

  console.log('# 7. 章账末节 handoff：末节进 continuity、历史不进、预算与缺省护栏')

  const ledgerContent = `${skeleton.replace(/\n+$/, '')}

## 第1章 霜港（章卡）

- 一句话：林照抵达霜港。

## 交接 · 第1章（下一章 handoff）

- 旧馆的灯每晚亮起
- 盐引文书缺失三页
- 林照轻伤未愈
`
  const handoffWorldbook = () => ({
    id: 'wb-ledger',
    name: '章账世界书',
    entries: [
      { id: 'hit-1', name: '林照', type: 'character', keys: ['林照'], content: '林照的条目。' },
      { id: 'ledger-1', name: CHAPTER_LEDGER_ENTRY_NAME, type: 'event', keys: [], content: ledgerContent }
    ]
  })
  ok(isChapterLedgerEntry({ name: CHAPTER_LEDGER_ENTRY_NAME }), '章账结算条目判定（按名）')
  ok(isChapterLedgerEntry({ name: '随便', extra: { auxRole: 'chapter-ledger' } }), '章账结算条目判定（auxRole 双保险）')

  const handoffContext = buildWorldbookContext({
    worldbook: handoffWorldbook(),
    chatHistory: [{ role: 'user', content: '林照' }],
    tokenBudget: 2000
  })
  eq(handoffContext.matchedEntries.map((entry) => entry.id), ['hit-1'], '章账条目本体不进命中集（只以末节形态出现）')
  ok(handoffContext.messages[0].content.includes('【上一章交接 · 章账末节】'), 'handoff 以 continuity 块附带注入')
  ok(handoffContext.messages[0].content.includes('旧馆的灯每晚亮起'), '末节内容进上下文')
  ok(!handoffContext.messages[0].content.includes('林照抵达霜港'), '非末节历史（章卡等）不进上下文')
  const handoffPart = handoffContext.contextLedger.parts.find((part) => part.purpose === 'worldbook-handoff')
  ok(handoffPart && handoffPart.included === true, 'contextLedger 记录 handoff 块（included=true）')
  ok(!handoffContext.warnings.some((warning) => String(warning).startsWith('handoff-skipped')), '预算充足无跳过警告')

  const tightContext = buildWorldbookContext({
    worldbook: handoffWorldbook(),
    chatHistory: [{ role: 'user', content: '林照' }],
    tokenBudget: 40
  })
  ok(tightContext.warnings.includes('handoff-skipped:budget'), '预算不足：handoff 整块跳过并记警告')
  ok(!tightContext.messages[0].content.includes('旧馆的灯每晚亮起'), '预算不足：末节不进消息（不计预算外）')
  const skippedPart = tightContext.contextLedger.parts.find((part) => part.purpose === 'worldbook-handoff-skipped')
  ok(skippedPart && skippedPart.included === false, 'contextLedger 记录跳过（included=false）')

  const noLedger = buildWorldbookContext({
    worldbook: { id: 'wb-ledger', name: '章账世界书', entries: handoffWorldbook().entries.filter((entry) => entry.id !== 'ledger-1') },
    chatHistory: [{ role: 'user', content: '林照' }],
    tokenBudget: 2000
  })
  ok(!noLedger.messages[0].content.includes('章账末节'), '无章账条目 → 无 handoff 块（数据存在才生效）')
  eq(noLedger.matchedEntries.map((entry) => entry.id), ['hit-1'], '无章账条目 → 命中集不受影响')
  eq(
    noLedger.messages[0].content.split('⚠️')[0],
    handoffContext.messages[0].content.split('【上一章交接 · 章账末节】')[0],
    'handoff 之外的注入内容与无账基线逐字节一致（纯附带块，零其他改动）'
  )

  /* ---------- 8. 揭示采纳条目不回灌底牌语义（防回归） ---------- */

  console.log('# 8. 回归护栏：结算产物与底牌排除互不干扰')

  const mixedContext = buildWorldbookContext({
    worldbook: {
      id: 'wb-mixed',
      name: '混合世界书',
      entries: [
        { id: 'hit-1', name: '林照', type: 'character', keys: ['林照'], content: '林照的条目。' },
        { id: 'covert-1', name: '暗线底牌', type: 'general', status: 'draft', cat: ['底牌'], content: '底牌内容：x。' },
        { id: 'ledger-1', name: CHAPTER_LEDGER_ENTRY_NAME, type: 'event', keys: [], content: ledgerContent }
      ]
    },
    chatHistory: [{ role: 'user', content: '林照' }],
    tokenBudget: 2000
  })
  eq(mixedContext.matchedEntries.map((entry) => entry.id), ['hit-1'], '底牌与章账同时在场：命中集仍只有普通条目')
  ok(mixedContext.messages[0].content.includes('【上一章交接 · 章账末节】'), 'handoff 注入与底牌排除并存')
  ok(!mixedContext.messages[0].content.includes('底牌内容'), '底牌正文始终不出现')

  console.log(`\n${asserted} assertions passed`)
  process.exit(0)
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
