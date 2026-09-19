/* eslint-disable no-console */
import { chromium } from 'playwright'

// src 模块链是无扩展名相对导入（Vite 专用），因此本 eval 在真实 dev server
// 页面里运行断言（与 memory 系列 smoke 同一模式）。
const BASE_URL = process.env.PINAX_TOOL_GUARDS_EVAL_URL || 'http://127.0.0.1:5179'

// T02/T03（2026-09-18 夜间 A 线）：工具执行处统一核验的反例矩阵（Node 纯
// 模块链，无浏览器依赖；真实 registry/合同/索引代码，无 mock 接口）。
//
// T02 —— task/phase/scope/revision/effect 在执行处核验，越权在执行前拒绝：
//   1) 正文阶段（phase:'write'）伪造规划工具 → 执行处 NARRATIVE_TOOL_PHASE_FORBIDDEN
// 2) 规划阶段（phase:'plan'）伪造资料工具 → 同上（对称门）
//   3) 规划阶段合法规划调用 → 通过（不误伤）
//   4) 无 phase（legacy 调用方合同）→ 行为不变
//   5) 目录未授权工具 → NARRATIVE_TOOL_NOT_AUTHORIZED（执行前）
//   6) 游标 revision 过期 → NARRATIVE_CURSOR_STALE（执行前）
// T03 —— 参数 schema/额外字段/结果大小：
//   7) 参数伪造 scope 字段（projectId/sessionId）→ 白名单归一化丢弃，结果不含
//   8) 超长 query → NARRATIVE_TOOL_QUERY_TOO_LONG
//   9) 超限 limit → NARRATIVE_TOOL_LIMIT_INVALID
//  10) 结果有界 → items ≤ maxItems 且 chars ≤ maxResultChars

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(BASE_URL)
  await page.waitForSelector('.authoring-welcome')

  const summary = await page.evaluate(async () => {
    const { NARRATIVE_TOOL_LIMITS, createNarrativeCursor } = await import('/shared/narrativeAgentContract.js')
    const { NARRATIVE_BEAT_PLAN_TOOL } = await import('/shared/narrativeBeatPlanContract.js')
    const { createNarrativeResourceIndex } = await import('/src/services/agents/narrativeResourceIndex.js')
    const { createNarrativeToolRegistry } = await import('/src/services/agents/narrativeToolRegistry.js')
    const assert = { equal: (a, b, m) => { if (a !== b) throw new Error(m || `${a} != ${b}`) }, ok: (v, m) => { if (!v) throw new Error(m || 'expected truthy') } }

    const worldbook = {
  id: 'wb-guards',
  name: '守卫测试世界',
  worldDescription: '用于工具守卫反例验证的最小世界。',
  entries: Array.from({ length: 10 }, (_, index) => ({
    id: `entry-${index + 1}`,
    title: `条目 ${index + 1}`,
    description: `第 ${index + 1} 条设定的较长描述，用于撑起结果体积与截断行为。`,
    keywords: [`关键词${index + 1}`]
  }))
}
const index = createNarrativeResourceIndex({
  projectId: 'wb-guards',
  sessionId: 'session-guards',
  worldbook,
  memories: []
})
assert.ok(index.counts.world >= 1, '索引应含 world 域资源')

const registry = createNarrativeToolRegistry({
  index,
  projectId: 'wb-guards',
  sessionId: 'session-guards'
})

const planCall = {
  id: 'call-plan-1',
  name: NARRATIVE_BEAT_PLAN_TOOL,
  arguments: { mode: 'advance', responseObligation: '回应褚岩的质问', causalSteps: ['灯塔守卫承认灯已熄'], revealOrChange: '揭示灯塔已熄', endCondition: '守卫当众承认灯已熄' }
}

// 1) 正文阶段伪造规划调用 → 执行处拒绝
const forged = await registry.execute({ ...planCall, id: 'call-forge-write' }, { phase: 'write' })
assert.equal(forged.ok, false, '正文阶段规划调用必须被拒')
assert.equal(forged.error.code, 'NARRATIVE_TOOL_PHASE_FORBIDDEN')
assert.ok(!forged.plan, '被拒调用不得产生 plan 结果')

// 2) 规划阶段伪造资料调用 → 执行处拒绝
const forgedRead = await registry.execute(
  { id: 'call-forge-plan', name: 'world_lookup', arguments: { action: 'search', query: '灯塔' } },
  { phase: 'plan' }
)
assert.equal(forgedRead.ok, false, '规划阶段资料调用必须被拒')
assert.equal(forgedRead.error.code, 'NARRATIVE_TOOL_PHASE_FORBIDDEN')

// 3) 规划阶段合法规划调用 → 通过
const legitPlan = await registry.execute(planCall, { phase: 'plan' })
assert.equal(legitPlan.ok, true, `合法规划调用应通过：${JSON.stringify(legitPlan.error || {})}`)
assert.ok(legitPlan.planRevision, '规划结果应带 planRevision')

// 4) legacy（无 phase）行为不变：beat-plan 仍可作为内部控制调用执行
const legacy = await registry.execute({ ...planCall, id: 'call-legacy' })
assert.equal(legacy.ok, true, 'legacy 无 phase 调用方合同不得被破坏')

// 5) 目录未授权工具 → 执行前拒绝（allowlist 只含 world_lookup）
const restrictedIndex = createNarrativeResourceIndex({
  projectId: 'wb-guards',
  sessionId: 'session-guards',
  worldbook,
  memories: [{ id: 'm1', content: '褚岩记得灯塔的灯号。', scope: 'project', scopeId: 'wb-guards', status: 'confirmed' }]
})
const restricted = createNarrativeToolRegistry({
  index: restrictedIndex,
  projectId: 'wb-guards',
  sessionId: 'session-guards',
  allowedToolNames: ['world_lookup']
})
const unauthorized = await restricted.execute(
  { id: 'call-unauth', name: 'memory_lookup', arguments: { action: 'search', query: '灯塔' } },
  { phase: 'write' }
)
assert.equal(unauthorized.ok, false, '未授权工具必须被拒')
assert.equal(unauthorized.error.code, 'NARRATIVE_TOOL_NOT_AUTHORIZED')

// 6) 游标 revision 过期 → 执行前拒绝
const staleCursor = createNarrativeCursor({ revision: 'rev-OLD', domain: 'world', sortKey: 'a', itemId: 'x' })
const stale = await registry.execute(
  { id: 'call-stale', name: 'world_lookup', arguments: { action: 'search', query: '灯塔', cursor: staleCursor } },
  { phase: 'write' }
)
assert.equal(stale.ok, false, '过期游标必须被拒')
assert.equal(stale.error.code, 'NARRATIVE_CURSOR_STALE')

// 7) 参数伪造 scope 身份字段 → 白名单归一化丢弃，结果不回显
const forgedScope = await registry.execute(
  { id: 'call-scope', name: 'world_lookup', arguments: { action: 'search', query: '灯塔', projectId: 'other-book', sessionId: 'other-session', limit: 2 } },
  { phase: 'write' }
)
assert.equal(forgedScope.ok, false, '作用域伪造在执行前拒绝')
assert.equal(forgedScope.error.code, 'TOOL_SCOPE_FORGED')
assert.ok(!JSON.stringify(forgedScope).includes('other-book'), '伪造 projectId 不得进入结果')

// 8) 超长 query → 拒绝
const tooLong = await registry.execute(
  { id: 'call-long', name: 'world_lookup', arguments: { action: 'search', query: '灯'.repeat(NARRATIVE_TOOL_LIMITS.maxQueryChars + 1) } },
  { phase: 'write' }
)
assert.equal(tooLong.ok, false)
assert.equal(tooLong.error.code, 'NARRATIVE_TOOL_QUERY_TOO_LONG')

// 9) 超限 limit → 拒绝
const tooMany = await registry.execute(
  { id: 'call-limit', name: 'world_lookup', arguments: { action: 'search', query: '灯塔', limit: NARRATIVE_TOOL_LIMITS.maxItems + 1 } },
  { phase: 'write' }
)
assert.equal(tooMany.ok, false)
assert.equal(tooMany.error.code, 'NARRATIVE_TOOL_LIMIT_INVALID')

// 10) 结果有界：全量搜索不超 items/chars 上限
const bounded = await registry.execute(
  { id: 'call-bounded', name: 'world_lookup', arguments: { action: 'search', query: '设定' } },
  { phase: 'write' }
)
assert.equal(bounded.ok, true)
assert.ok(bounded.items.length > 0, '搜索应命中条目（非空才有界可证）')
assert.ok(bounded.items.length <= NARRATIVE_TOOL_LIMITS.maxItems, `items 应 ≤ ${NARRATIVE_TOOL_LIMITS.maxItems}`)
assert.ok(bounded.chars <= NARRATIVE_TOOL_LIMITS.maxResultChars, `chars 应 ≤ ${NARRATIVE_TOOL_LIMITS.maxResultChars}`)

    return { phaseGate: forged.error.code, legacyOk: legacy.ok, boundedItems: bounded.items.length, boundedChars: bounded.chars }
  })

  console.log('[agent-tool-guards-eval] ok: 10/10 counterexamples passed', JSON.stringify(summary))
  if (pageErrors.length) {
    console.error('[agent-tool-guards-eval] page errors:', pageErrors)
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
