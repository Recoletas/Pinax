/**
 * 工具执行授权（T02，nightly-20260918 B 线）：在执行处核验 phase/scope/effect，
 * 越权请求在执行器运行前拒绝——权限不能只靠"从 prompt 隐藏工具"。
 *
 * 复用来源（硬规则：先复用后自研）：
 * - StoryForge src/lib/agent/tool-registry.ts @ 1935dab（MIT）：per-tool 参数
 *   闭集（argRules allowed/required）、read-only 工具分级与执行前参数校验的
 *   结构照此移植；上游的运行授权绑定在 run 合同 executionBindings（decision-harness
 *   已读），Pinax 的对应物是本模块的阶段×工具矩阵 + registry 构造期 scope。
 * - 上游无 phase 概念（阶段由 run 合同步骤承载）；Pinax 的编排器单 registry
 *   跨阶段复用（plan 专用步 + 主循环共用），因此阶段矩阵在本模块内建。
 *
 * 分类（effect）：
 *   read         —— 资料查询（world/geo/history/memory/politics lookup）
 *   plan-control —— 内部规划提交（submit_narrative_beat_plan，Q3：不查索引、
 *                   不计入 grounding evidence）
 *   write        —— 本 registry 一律拒绝注册/执行（写路径只经
 *                   agentResultTransaction 的 effectPolicy 白名单，T 边界）
 *
 * 阶段（phase）：
 *   plan    —— 仅允许 plan-control（规划专用步）
 *   narrate —— 仅允许 read（正文/循环阶段；规划工具在此显式拒绝）
 *   未声明   —— legacy 兼容：允许名单 + plan-control/read（编排器接线前的既有合同）
 *
 * scope：调用参数携带作用域身份键（projectId/sessionId/worldId/branchId/scope）
 * 一律拒绝——作用域在 registry 构造期冻结，参数伪造即注入企图。
 */

import { NARRATIVE_BEAT_PLAN_TOOL } from '../../../shared/narrativeBeatPlanContract.js'

export const TOOL_EXECUTION_PHASES = Object.freeze(['plan', 'narrate'])

export const TOOL_EFFECT_CLASSES = Object.freeze({
  world_lookup: 'read',
  geo_lookup: 'read',
  history_lookup: 'read',
  memory_lookup: 'read',
  politics_lookup: 'read',
  [NARRATIVE_BEAT_PLAN_TOOL]: 'plan-control'
})

// 作用域身份键：调用参数中出现即拒绝（scope 在构造期冻结，不允许经参数申明）。
const FORBIDDEN_SCOPE_KEYS = Object.freeze(['projectid', 'sessionid', 'worldid', 'branchid', 'scope', 'bookid'])

export function classifyToolEffect(name) {
  return TOOL_EFFECT_CLASSES[String(name || '')] || null
}

function authzError(code, message) {
  return Object.assign(new Error(message), { code })
}

export function assertToolExecutionAuthorization({ call, phase = null, allowedToolNames = null } = {}) {
  const name = String(call?.name || '').trim()
  if (!name) throw authzError('NARRATIVE_TOOL_CALL_INVALID', '工具调用缺少名称')
  const effect = classifyToolEffect(name)
  if (!effect) {
    // 未登记工具：不是本 registry 的授权范畴（未知工具由 registry 兜底），
    // 但若出现在允许名单里也只可能是 read/plan-control 之外的新类别——拒绝。
    if (Array.isArray(allowedToolNames) && allowedToolNames.includes(name)) {
      throw authzError('TOOL_EFFECT_FORBIDDEN', `工具 ${name} 未登记效果分类，拒绝执行`)
    }
    return { ok: true, effect: null }
  }
  if (effect === 'write') {
    throw authzError('TOOL_EFFECT_FORBIDDEN', `工具 ${name} 是写效果，本 registry 只承载读与规划控制`)
  }
  const args = call?.arguments
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    const forged = Object.keys(args).filter((key) => FORBIDDEN_SCOPE_KEYS.includes(String(key).toLowerCase()))
    if (forged.length) {
      throw authzError('TOOL_SCOPE_FORGED', `工具参数携带作用域身份键（${forged.join(', ')}），已拒绝`)
    }
  }
  if (phase === 'plan' && effect !== 'plan-control') {
    throw authzError('TOOL_PHASE_FORBIDDEN', '规划阶段只允许提交规划，不允许资料查询')
  }
  if (phase === 'narrate' && effect !== 'read') {
    if (effect === 'plan-control') {
      throw authzError('TOOL_PHASE_FORBIDDEN', '规划工具不允许在正文/循环阶段调用')
    }
    throw authzError('TOOL_PHASE_FORBIDDEN', `工具 ${name} 不允许在当前阶段执行`)
  }
  if (Array.isArray(allowedToolNames) && !allowedToolNames.includes(name)) {
    throw authzError('NARRATIVE_TOOL_NOT_AUTHORIZED', `当前资料索引未授权工具：${name}`)
  }
  return { ok: true, effect }
}

/** registry.execute 的接线形态：越权 → 类型化工具错误结果（不抛出，走错误回执链）。 */
export function toolExecutionAuthorizationError(call, error, createNarrativeToolErrorFn) {
  return createNarrativeToolErrorFn(call, error.code, error.message)
}

export { authzError as toolAuthorizationError }
