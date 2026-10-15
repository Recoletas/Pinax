#!/usr/bin/env node
// W1-A4 关系地基修复回归冒烟（零依赖，node 直跑；退出 0 = 过）。
// 用法：node scripts/worldbook-relations-smoke.mjs
//
// 修复前后对照：
// - 修复前：worldbookContextBuilder.js 的 bound 激活路径只认
//   `relations.placeIds / relations.characterIds`（旧命名，全仓没有任何条目
//   写入端写这两个字段，只有运行态 scene 用），而 store 写入端
//   （src/stores/worldStore.js ~867-872、src/services/worldbook/worldbookDraftAssets.js
//   ~188-193）写的是 `relations.locations / relations.characters`。
//   因此下面「绑定了地点 A 的条目在场景地点=A 时命中」等断言在修复前必失败：
//   store 生成的条目永远进不了 matchReason='bound'，地点/角色绑定路径一直空转。
// - 修复后：读取端统一走 src/services/worldbook/entryRelations.js 纯函数 ——
//   优先 locations/characters，回落 placeIds/characterIds（兼容历史/手写数据）。
//   worldbookContextBuilder.js 的 bound 块改调 entryBoundMatchLabel，
//   与本冒烟共用同一判定实现（非复制品）。
//
// 注意：本冒烟只 import entryRelations.js（worldbookContextBuilder.js 依赖
// composable，node 直跑会挂）；判定逻辑已整体抽入该纯函数模块，覆盖即真实路径。
import {
  normalizeEntryRelations,
  entryMatchesSceneLocation,
  entryMentionsCharacter,
  entryBoundMatchLabel
} from '../src/services/worldbook/entryRelations.js'

let passed = 0
let failed = 0

function assert(name, actual, expected) {
  const ok = Object.is(actual, expected)
  if (ok) {
    passed += 1
    console.log(`  ok  ${name}`)
  } else {
    failed += 1
    console.error(`FAIL  ${name}\n      expected: ${String(expected)}\n      actual:   ${String(actual)}`)
  }
}

function assertDeep(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    passed += 1
    console.log(`  ok  ${name}`)
  } else {
    failed += 1
    console.error(`FAIL  ${name}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`)
  }
}

// ---- store 侧真实形状（worldStore.js 写入端：relations.{tags,locations,characters,events}）
const storeShapedEntry = {
  id: 'entry-char-1',
  name: '林照',
  type: 'character',
  content: '...',
  relations: {
    tags: ['结构化设定'],
    locations: ['loc-a', 'loc-a', '', '  '],
    characters: ['char-b'],
    events: []
  }
}
// ---- 旧命名 / 历史数据形状（修复前注入端唯一认的形状）
const legacyShapedEntry = {
  id: 'entry-char-2',
  name: '旧数据条目',
  type: 'character',
  content: '...',
  relations: {
    placeIds: ['loc-a'],
    characterIds: ['char-b']
  }
}

console.log('# 1. normalizeEntryRelations：两种命名归一化结果一致')
assertDeep(
  'store 命名 locations/characters 归一化',
  normalizeEntryRelations(storeShapedEntry),
  { locations: ['loc-a'], characters: ['char-b'] }
)
assertDeep(
  '旧命名 placeIds/characterIds 归一化（回落兼容）',
  normalizeEntryRelations(legacyShapedEntry),
  { locations: ['loc-a'], characters: ['char-b'] }
)
assertDeep(
  '两种命名归一化结果相同',
  normalizeEntryRelations(storeShapedEntry),
  normalizeEntryRelations(legacyShapedEntry)
)
assertDeep(
  '去重/滤空/字符串化',
  normalizeEntryRelations({ relations: { locations: [' loc-a ', '', 'loc-a', 42, null] } }),
  { locations: ['loc-a', '42'], characters: [] }
)
assertDeep(
  '优先 locations、不与 placeIds 混合',
  normalizeEntryRelations({ relations: { locations: ['loc-new'], placeIds: ['loc-old'] } }),
  { locations: ['loc-new'], characters: [] }
)
assertDeep(
  'locations 为空时回落 placeIds',
  normalizeEntryRelations({ relations: { locations: [], placeIds: ['loc-old'] } }),
  { locations: ['loc-old'], characters: [] }
)
assertDeep(
  '无 relations / 非对象安全',
  normalizeEntryRelations({ id: 'x' }),
  { locations: [], characters: [] }
)

console.log('# 2. 场景地点判定：绑定地点 A 的条目在场景地点=A 时命中（修复前必失败的主断言）')
assert(
  'store 命名条目：场景地点=[loc-a] 命中',
  entryMatchesSceneLocation(storeShapedEntry, ['loc-a']),
  true
)
assert(
  'store 命名条目：场景地点=其他地点 不命中',
  entryMatchesSceneLocation(storeShapedEntry, ['loc-z']),
  false
)
assert(
  '旧命名条目：场景地点=[loc-a] 命中（回落兼容）',
  entryMatchesSceneLocation(legacyShapedEntry, ['loc-a']),
  true
)
assert(
  '场景地点集合为空 不命中',
  entryMatchesSceneLocation(storeShapedEntry, []),
  false
)
assert(
  'Set 入参与数组等价',
  entryMatchesSceneLocation(storeShapedEntry, new Set(['loc-a'])),
  true
)

console.log('# 3. 角色判定：绑定角色 B 的条目在说话/在场角色=B 时命中')
assert(
  'store 命名条目：说话角色=[char-b] 命中',
  entryMentionsCharacter(storeShapedEntry, ['char-b']),
  true
)
assert(
  'store 命名条目：说话角色=他人 不命中',
  entryMentionsCharacter(storeShapedEntry, ['char-other']),
  false
)
assert(
  '旧命名条目：说话角色=[char-b] 命中（回落兼容）',
  entryMentionsCharacter(legacyShapedEntry, ['char-b']),
  true
)

console.log('# 4. bound 总判定：标签与优先级（与 contextBuilder 输出逐字一致）')
assert(
  '地点绑定（store 命名 → 场景地点激活，修复前空转路径）',
  entryBoundMatchLabel(storeShapedEntry, { placeIds: ['loc-a'] }),
  '地点绑定'
)
assert(
  '角色绑定（说话角色激活）',
  entryBoundMatchLabel(storeShapedEntry, { characterIds: ['char-b'] }),
  '角色绑定'
)
assert(
  '来源绑定（metadata.sourceRef）',
  entryBoundMatchLabel({ metadata: { sourceRef: 'S3' } }, { sourceRefs: ['S3'] }),
  '来源绑定'
)
assert(
  '来源绑定（relations.sourceRef 回落）',
  entryBoundMatchLabel({ relations: { sourceRef: 'S5' } }, { sourceRefs: ['S5'] }),
  '来源绑定'
)
assert(
  '优先级：地点 > 角色',
  entryBoundMatchLabel(storeShapedEntry, { placeIds: ['loc-a'], characterIds: ['char-b'] }),
  '地点绑定'
)
assert(
  '优先级：角色 > 来源',
  entryBoundMatchLabel(
    { relations: { characters: ['char-b'], sourceRef: 'S3' } },
    { characterIds: ['char-b'], sourceRefs: ['S3'] }
  ),
  '角色绑定'
)
assert(
  '无绑定上下文 → null（不激活）',
  entryBoundMatchLabel(storeShapedEntry, {}),
  null
)

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
