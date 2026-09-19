/* eslint-disable no-console */
import assert from 'node:assert/strict'
import {
  TEMPORAL_KINDS,
  planSingleValueTimeline
} from '../src/services/memory/ledger/temporalCoordinator.js'

// M01/M02（2026-09-18 夜间 A 线）：Utopia temporal 引擎移植的反例矩阵
// （纯函数模块，Node 直跑）。计划验收：输出新旧区间和冲突原因；迟到与
// 顺序输入结果一致；已知/未知终点；同日冲突；多值不得误关闭旧事实。

const row = (id, objectKey, extra = {}) => ({ id, objectKey, from: null, to: null, anchorAt: null, endDerived: false, authority: 'author', ...extra })
const planKey = plan => JSON.stringify({
  closes: [...plan.closes].sort((a, b) => a.id.localeCompare(b.id)),
  conflicts: [...plan.conflicts].sort((a, b) => (a.oldId + a.newId + a.reason).localeCompare(b.oldId + b.newId + b.reason))
})

// 1) 顺序无关：同一行集合，任意到达顺序 → 同一份计划
{
  const a = row('v1', '旧港务局长', { from: 10 })
  const b = row('v2', '新港务局长', { from: 30 })
  const c = row('v3', '第三任局长', { from: 50 })
  const planA = planSingleValueTimeline({ rows: [a, b], incoming: c })
  const planB = planSingleValueTimeline({ rows: [b, c], incoming: a })
  const planC = planSingleValueTimeline({ rows: [c, a], incoming: b })
  assert.equal(planKey(planA), planKey(planB), '顺序 A/B 计划必须一致')
  assert.equal(planKey(planA), planKey(planC), '顺序 A/C 计划必须一致')
  assert.ok(planA.closes.some(close => close.id === 'v1' && close.proposedEnd.kind === 'at' && close.proposedEnd.at === 30), 'v1 应闭合在 v2 开始（最近的不同值后任）')
  assert.ok(planA.closes.some(close => close.id === 'v2' && close.proposedEnd.at === 50), 'v2 应闭合在 v3 开始')
}

// 2) 迟到补录：新到行比现有后任更早时，前任闭合点取最近的不同值后任
{
  const first = row('m1', '局长甲', { from: 10 })
  const third = row('m3', '局长丙', { from: 50 })
  const base = planSingleValueTimeline({ rows: [first], incoming: third })
  assert.ok(base.closes.some(close => close.id === 'm1' && close.proposedEnd.at === 50))
  const late = row('m2', '局长乙', { from: 30 })
  const withLate = planSingleValueTimeline({ rows: [first, third], incoming: late })
  assert.ok(withLate.closes.some(close => close.id === 'm1' && close.proposedEnd.at === 30), '迟到行插入后，m1 应改闭合在 m2 开始（重算而非拼接）')
  assert.ok(withLate.closes.some(close => close.id === 'm2' && close.proposedEnd.at === 50), 'm2 自己止于 m3 开始')
  assert.ok(!withLate.closes.some(close => close.id === 'm3'), 'm3 开着，不产生闭合')
}

// 3) 显式终点不动：作者写明结束时间的行不由引擎重算
{
  const explicit = row('e1', '旧盟约', { from: 1, to: 20 })
  const next = row('e2', '新盟约', { from: 25 })
  const plan = planSingleValueTimeline({ rows: [explicit], incoming: next })
  assert.ok(!plan.closes.some(close => close.id === 'e1'), '显式终点的行不得被引擎改写')
}

// 4) 同日冲突：同一刻开始且双方那一刻都成立 → 交人
{
  const seated = row('s1', '继任者', { from: 30 })
  const plan = planSingleValueTimeline({ rows: [seated], incoming: row('s2', '挑战者', { from: 30 }) })
  assert.ok(plan.conflicts.some(conflict => conflict.reason === 'simultaneous'), `应有 simultaneous 冲突：${JSON.stringify(plan.conflicts)}`)
  assert.ok(!plan.closes.length, 'simultaneous 时不得硬闭合')
}

// 5) 缺时间双开：一边说不出时间 → no-time 冲突，不替人关
{
  const open = row('t1', '现任队长', { from: 5 })
  const plan = planSingleValueTimeline({ rows: [open], incoming: row('t2', '自称队长', {}) })
  assert.ok(plan.conflicts.some(conflict => conflict.reason === 'no-time'), `应有 no-time 冲突：${JSON.stringify(plan.conflicts)}`)
  assert.ok(!plan.closes.length)
}

// 6) 低置信 analogue：非作者权威的后任不得改写前任历史 → needs-author
{
  const confirmed = row('c1', '正统旗主', { from: 10 })
  const plan = planSingleValueTimeline({ rows: [confirmed], incoming: row('c2', '传闻旗主', { from: 20, authority: 'derived' }) })
  assert.ok(plan.conflicts.some(conflict => conflict.reason === 'needs-author'), `应有 needs-author：${JSON.stringify(plan.conflicts)}`)
  assert.ok(!plan.closes.some(close => close.id === 'c1'), '低置信后任不得自动闭合前任')
}

// 7) 同值不算接替：同一 objectKey 的补录（如换证据重述）不产生闭合/冲突
{
  const kept = row('k1', '城主', { from: 10 })
  const plan = planSingleValueTimeline({ rows: [kept], incoming: row('k2', '城主', { from: 40 }) })
  assert.equal(plan.closes.length, 0, '同值行不得互相闭合')
  assert.equal(plan.conflicts.length, 0, '同值行不得记冲突')
}

// 8) 未知终点形状：无起点的后任只带证据锚点 → 前任闭合为 unknown-end 并带锚
{
  const current = row('u1', '在任船医', { from: 10 })
  const plan = planSingleValueTimeline({ rows: [current], incoming: row('u2', '新船医', { anchorAt: 45 }) })
  const close = plan.closes.find(close => close.id === 'u1')
  assert.ok(close, 'u1 应产生闭合提案')
  assert.equal(close.proposedEnd.kind, 'unknown-end', '无起点的接替写成"结束了，不知哪天"')
  assert.equal(close.proposedEnd.anchor, 45, '锚在后任自带日期的证据上')
  assert.equal(close.reason, 'superseded-unknown-end')
  assert.equal(close.from, 10, '闭合提案必须带旧区间起点（新旧区间输出）')
}

// 9) 多值关系：分类合同排除，绝不自动闭合旧事实
{
  const ally = row('mv1', '北方同盟', { from: 1 })
  const plan = planSingleValueTimeline({ rows: [ally], incoming: row('mv2', '南方同盟', { from: 30 }), temporalKind: TEMPORAL_KINDS.MULTI_VALUE_RELATION })
  assert.equal(plan.closes.length, 0, '多值关系不得误关闭旧事实')
  assert.equal(plan.conflicts.length, 0)
  assert.equal(plan.skipped.reason, 'multi-valued')
}

// 10) 事件：分类合同排除，事件区间只接受显式更正
{
  const event = row('ev1', '加冕典礼', { from: 100, to: 100 })
  const plan = planSingleValueTimeline({ rows: [event], incoming: row('ev2', '继位典礼', { from: 120 }), temporalKind: TEMPORAL_KINDS.EVENT })
  assert.equal(plan.closes.length, 0)
  assert.equal(plan.skipped.reason, 'event')
}

console.log('[memory-temporal-coordination-eval] ok: 10/10 counterexamples passed')
