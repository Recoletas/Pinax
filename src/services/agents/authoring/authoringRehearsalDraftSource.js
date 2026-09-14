// A06：选路转试稿的来源冻结。点击“写成试稿”的瞬间捕获路线身份、步前缀、
// 状态指纹与目标；异步生成/adopt 期间一律使用该快照核对，绝不重新读取
// “此刻的 rehearsal.steps”拼进旧 route ID。纯数据、可序列化、深冻结。

import { consequenceFingerprint, rehearsalPathText } from '../../../../shared/authoringRehearsalConsequenceContract.js'

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value
  for (const child of Object.values(value)) freezeDeep(child)
  return Object.freeze(value)
}

// source 记录生成时的完整来源：C 的生成入口在发起请求前调用 createDraftSource，
// 收到结果后用 isRehearsalDraftSourceCurrent 核对再落稿。
export function buildRehearsalDraftSource({ run, route, routeState }) {
  if (!run || !route) return null
  const steps = Array.isArray(route.steps) ? route.steps : []
  const source = {
    kind: 'authoring-rehearsal-draft-source',
    version: 1,
    routeId: route.id,
    stepIds: steps.map(step => step.id),
    conditionGeneration: run.conditionGeneration ?? 0,
    pathText: rehearsalPathText(steps),
    prefixFingerprint: consequenceFingerprint('draft-prefix', steps.map(step => [step.id, step.response, step.change])),
    stateFingerprint: routeState?.stateFingerprint || '',
    // 冻结的目标落点：编辑/采纳沿用既有 Ghost 目标版本事务，来源可核对
    target: run.target ? JSON.parse(JSON.stringify(run.target)) : null,
    createdAt: Date.now()
  }
  return freezeDeep(source)
}

// 异步回来后核对：同一路线仍存在、步前缀未被推进或回退、条件代次一致。
// 不匹配 → 该稿不能落到这条路上，交作者重开快照，不能静默拼接。
export function isRehearsalDraftSourceCurrent(source, { route, routeState, conditionGeneration }) {
  if (!source || source.kind !== 'authoring-rehearsal-draft-source' || !route) return false
  if (source.conditionGeneration !== conditionGeneration) return false
  const steps = Array.isArray(route.steps) ? route.steps : []
  if (steps.length !== source.stepIds.length) return false
  if (steps.some((step, index) => step.id !== source.stepIds[index])) return false
  const prefixFingerprint = consequenceFingerprint('draft-prefix', steps.map(step => [step.id, step.response, step.change]))
  if (prefixFingerprint !== source.prefixFingerprint) return false
  if (routeState?.stateFingerprint && source.stateFingerprint && routeState.stateFingerprint !== source.stateFingerprint) return false
  return true
}
