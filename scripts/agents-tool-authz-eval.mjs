#!/usr/bin/env node
/**
 * 工具执行授权验收矩阵（T02，plain node，不占 Vitest 预算）。
 *
 * 反例对应计划 §必须失败得正确的场景「权限」行：
 *   - 正文阶段调用规划工具（narrate 阶段 submit_narrative_beat_plan）
 *   - 规划专用步调用资料查询（plan 阶段 lookup）
 *   - 资料文本/调用参数伪造作用域（projectId/sessionId/… 身份键）
 *   - 未登记效果分类的工具混入允许名单
 * 另覆盖：legacy（未声明 phase）合同兼容——既有调用方（authoring rehearsal）
 * 行为不变；read-only registry 不变量。
 *
 * 运行：node scripts/agents-tool-authz-eval.mjs   （exit 0 = 全部通过）
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const authz = await import(path.join(root, 'src/services/agents/toolExecutionAuthorization.js'))
const beat = await import(path.join(root, 'shared/narrativeBeatPlanContract.js'))

let passed = 0
let failed = 0
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
  } else {
    failed += 1
    // eslint-disable-next-line no-console
    console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`)
  }
}

function callOf(name, args = {}) { return { id: `c_${name}`, name, arguments: args } }

function expectCode(fn, code) {
  try {
    fn()
    return { ok: false, got: 'no-throw' }
  } catch (error) {
    return { ok: error?.code === code, got: error?.code || error?.message }
  }
}

// ── 1. 效果分类表（read-only registry 不变量的基础） ──
{
  check('effect: 五个资料查询=read', ['world_lookup', 'geo_lookup', 'history_lookup', 'memory_lookup', 'politics_lookup'].every((n) => authz.classifyToolEffect(n) === 'read'))
  check('effect: 规划工具=plan-control', authz.classifyToolEffect(beat.NARRATIVE_BEAT_PLAN_TOOL) === 'plan-control')
  check('effect: 未登记=null（由允许名单兜底）', authz.classifyToolEffect('made_up_tool') === null)
}

// ── 2. 阶段矩阵：正文阶段禁规划；规划步禁查询 ──
{
  const planCall = callOf(beat.NARRATIVE_BEAT_PLAN_TOOL, { summary: 'x' })
  const r1 = expectCode(() => authz.assertToolExecutionAuthorization({ call: planCall, phase: 'narrate' }), 'TOOL_PHASE_FORBIDDEN')
  check('phase: 正文阶段调用规划工具在执行前拒绝', r1.ok, r1.got)

  const r2 = expectCode(() => authz.assertToolExecutionAuthorization({ call: callOf('world_lookup', { action: 'list' }), phase: 'plan' }), 'TOOL_PHASE_FORBIDDEN')
  check('phase: 规划专用步调用资料查询拒绝', r2.ok, r2.got)

  const okPlan = authz.assertToolExecutionAuthorization({ call: planCall, phase: 'plan' })
  check('phase: 规划步允许规划工具', okPlan.ok === true)
  const okRead = authz.assertToolExecutionAuthorization({ call: callOf('memory_lookup', { action: 'search', query: '灯' }), phase: 'narrate' })
  check('phase: 正文阶段允许资料查询', okRead.ok === true)
}

// ── 3. scope 伪造：参数携带作用域身份键一律拒绝（在阶段判定之前） ──
{
  for (const key of ['projectId', 'sessionId', 'worldId', 'branchId', 'scope']) {
    const r = expectCode(
      () => authz.assertToolExecutionAuthorization({ call: callOf('world_lookup', { action: 'list', [key]: 'forge' }), phase: 'narrate' }),
      'TOOL_SCOPE_FORGED'
    )
    check(`scope: 参数伪造 ${key} 拒绝`, r.ok, r.got)
  }
  // 大小写变体同样拒绝。
  const r = expectCode(
    () => authz.assertToolExecutionAuthorization({ call: callOf('geo_lookup', { action: 'list', ProjectId: 'forge' }), phase: 'narrate' }),
    'TOOL_SCOPE_FORGED'
  )
  check('scope: 身份键大小写变体拒绝', r.ok, r.got)
}

// ── 4. 效果分类缺失但混入允许名单的工具拒绝；允许名单生效 ──
{
  const r = expectCode(
    () => authz.assertToolExecutionAuthorization({ call: callOf('made_up_tool'), phase: null, allowedToolNames: ['made_up_tool'] }),
    'TOOL_EFFECT_FORBIDDEN'
  )
  check('effect: 未登记效果但列入名单的工具拒绝', r.ok, r.got)
  const denied = expectCode(
    () => authz.assertToolExecutionAuthorization({ call: callOf('world_lookup', { action: 'list' }), phase: null, allowedToolNames: ['memory_lookup'] }),
    'NARRATIVE_TOOL_NOT_AUTHORIZED'
  )
  check('allowlist: 名单外工具拒绝（legacy 合同保留）', denied.ok, denied.got)
}

// ── 5. legacy 兼容：未声明 phase 时既有合同不变（authoring rehearsal 路径） ──
{
  const ok1 = authz.assertToolExecutionAuthorization({ call: callOf(beat.NARRATIVE_BEAT_PLAN_TOOL, {}), phase: null })
  const ok2 = authz.assertToolExecutionAuthorization({ call: callOf('politics_lookup', { action: 'list' }), phase: null })
  check('legacy: 未声明 phase 时规划/查询都放行（名单内）', ok1.ok && ok2.ok)
}

// ── 6. registry 接线：越权返回类型化错误回执（不抛出），合法调用到达执行器 ──
{
  const { createNarrativeToolRegistry } = await import(path.join(root, 'src/services/agents/narrativeToolRegistry.js'))
  // 伪造最小索引：authz 边界不需要真实资源；被授权的查询会进执行器并返回
  // 索引缺失/执行错误——本节只断言「越权在执行器之前被拦」。
  const index = { revision: 'rev_t02', byId: new Map(), byDomain: new Map(), counts: {}, projectId: 'p1', sessionId: 's1' }
  const registry = createNarrativeToolRegistry({ index, projectId: 'p1', sessionId: 's1', allowedToolNames: null })

  const denied = await registry.execute(callOf(beat.NARRATIVE_BEAT_PLAN_TOOL, {}), { phase: 'narrate' })
  check('registry: narrate 阶段规划调用返回阶段拒绝回执', denied?.ok === false && denied?.error?.code === 'NARRATIVE_TOOL_PHASE_FORBIDDEN', JSON.stringify(denied?.error))

  const deniedPlan = await registry.execute(callOf('world_lookup', { action: 'list' }), { phase: 'plan' })
  check('registry: plan 阶段查询调用返回阶段拒绝回执', deniedPlan?.ok === false && deniedPlan?.error?.code === 'NARRATIVE_TOOL_PHASE_FORBIDDEN', JSON.stringify(deniedPlan?.error))

  const forged = await registry.execute(callOf('world_lookup', { action: 'list', sessionId: 'other' }), { phase: 'narrate' })
  check('registry: 伪造 scope 返回 TOOL_SCOPE_FORGED 回执', forged?.ok === false && forged?.error?.code === 'TOOL_SCOPE_FORGED', JSON.stringify(forged?.error))

  // 合法规划提交（plan 阶段）应到达 BeatPlan 特殊分支并成功返回。
  const allowed = await registry.execute(callOf(beat.NARRATIVE_BEAT_PLAN_TOOL, {
    responseObligation: '回应玩家的询问',
    causalSteps: [{ action: '检视灯下的痕迹' }],
    revealOrChange: '揭开值班日志的涂改',
    endCondition: '玩家决定下一步去向'
  }), { phase: 'plan' })
  check('registry: plan 阶段合法规划提交通过', allowed?.ok === true && allowed?.tool === beat.NARRATIVE_BEAT_PLAN_TOOL, JSON.stringify(allowed?.error))
}

// ── 7. 编排器接线断言（源级，防回归） ──
{
  const fs = await import('node:fs')
  const src = fs.readFileSync(path.join(root, 'src/services/agents/narrativeAgentOrchestrator.js'), 'utf8')
  check('orchestrator: 规划专用步以 phase=plan 执行', /executeToolWithTimeout\(registry, call, linkedAbort\.signal, undefined, \{ phase: 'plan' \}\)/.test(src))
  check('orchestrator: 主循环以 phase=write 执行', /phase: 'write'/.test(src))
}

// eslint-disable-next-line no-console
console.log(`\n=== agents-tool-authz-eval: ${passed} passed, ${failed} failed ===`)
process.exit(failed === 0 ? 0 : 1)
