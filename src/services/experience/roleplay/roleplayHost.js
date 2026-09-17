/**
 * 有界主持计划（CX25/CX28/CX29）：把"推进一拍"的自动主持限制在显式预算内。
 * 确定性调度——每批最多 maxSteps 步；真人选择（pending/确认）永远优先，
 * 预算耗尽立即交还；暂停/恢复/刷新（归一化往返）全部保留剩余预算。
 * 预算在 begin 时预扣（崩溃/取消方向安全：不会因异常而无限续跑）。
 * 不新增第二条模型链：主持步只经既有 sendAction 的 hidden advance 通道。
 */

export const ROLEPLAY_HOST_PLAN_VERSION = 1
export const HOST_PLAN_STATUSES = Object.freeze(['awaiting-player', 'advancing', 'paused', 'ended'])
export const HOST_STEP_LIMITS = Object.freeze({ min: 0, max: 8, default: 3 })

function hostError(code, message) {
  return Object.assign(new Error(message), { code })
}

export function createHostPlan({ maxSteps = HOST_STEP_LIMITS.default } = {}) {
  const requested = Number(maxSteps)
  const bounded = Number.isFinite(requested)
    ? Math.max(HOST_STEP_LIMITS.min, Math.min(HOST_STEP_LIMITS.max, Math.floor(requested)))
    : HOST_STEP_LIMITS.default
  return {
    version: ROLEPLAY_HOST_PLAN_VERSION,
    status: 'awaiting-player',
    maxSteps: bounded,
    stepsUsed: 0,
    currentStepId: null
  }
}

export function normalizeHostPlan(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (Number(raw.version) !== ROLEPLAY_HOST_PLAN_VERSION) return null
  const status = HOST_PLAN_STATUSES.includes(raw.status) ? raw.status : 'paused'
  return {
    version: ROLEPLAY_HOST_PLAN_VERSION,
    status,
    maxSteps: Math.max(HOST_STEP_LIMITS.min, Math.min(HOST_STEP_LIMITS.max, Number(raw.maxSteps) || HOST_STEP_LIMITS.default)),
    stepsUsed: Math.max(0, Math.min(HOST_STEP_LIMITS.max * 10, Number(raw.stepsUsed) || 0)),
    currentStepId: raw.currentStepId ? String(raw.currentStepId) : null
  }
}

/**
 * 开始一步：预算预扣。预算耗尽 / 非等待态 / 已有进行中步 → 类型化拒绝。
 * 同 stepId 重复 begin 幂等（无副作用）。
 */
export function beginHostStep(plan, { stepId } = {}) {
  const id = String(stepId || '').trim()
  if (!id) throw hostError('ROLEPLAY_HOST_STEP_INVALID', '主持步缺少身份')
  if (plan.currentStepId === id) return { begun: false, duplicate: true }
  if (plan.status === 'advancing') {
    throw hostError('ROLEPLAY_HOST_STEP_IN_FLIGHT', '上一步主持还没结束')
  }
  if (plan.status === 'ended') {
    throw hostError('ROLEPLAY_HOST_ENDED', '主持已结束')
  }
  if (plan.status === 'paused') {
    throw hostError('ROLEPLAY_HOST_PAUSED', '主持已暂停，请先恢复')
  }
  if (plan.stepsUsed >= plan.maxSteps) {
    throw hostError('ROLEPLAY_HOST_BUDGET_EXHAUSTED', `本批主持预算（${plan.maxSteps} 步）已用完，交还给你行动`)
  }
  plan.status = 'advancing'
  plan.currentStepId = id
  plan.stepsUsed += 1
  return { begun: true, remaining: plan.maxSteps - plan.stepsUsed }
}

/** 结束一步（幂等）：回到 awaiting-player。预算不返还（预扣语义）。 */
export function completeHostStep(plan, { stepId } = {}) {
  if (plan.currentStepId !== String(stepId || '')) return { completed: false }
  plan.currentStepId = null
  plan.status = plan.status === 'advancing' ? 'awaiting-player' : plan.status
  return { completed: true }
}

export function pauseHostPlan(plan) {
  if (plan.status === 'advancing') {
    throw hostError('ROLEPLAY_HOST_STEP_IN_FLIGHT', '有进行中的主持步，不能暂停')
  }
  if (plan.status === 'awaiting-player') plan.status = 'paused'
  return plan
}

export function resumeHostPlan(plan) {
  if (plan.status === 'paused') plan.status = 'awaiting-player'
  return plan
}

export function endHostPlan(plan) {
  plan.status = 'ended'
  plan.currentStepId = null
  return plan
}
