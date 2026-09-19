/**
 * 跑团回合的持久 run 账目（G2b/G3，nightly-20260918）。
 *
 * 每个已确认行动对应一个可恢复 run（taskId=experience.roleplay.kp-turn），
 * 步骤与副作用全部落 StepReceipt：confirm/resolve（骰点）/scenario-outcome/
 * resource-cost/narration。恢复语义：
 * - 已 succeeded 的副作用步骤按 effectKey 幂等（重试绝不重骰/重复扣资源/
 *   重复落账），合同层在 runContract.completeRunStep 强制同 effectKey 唯一。
 * - 刷新/崩溃后载入：非终态 run 扫描为 interrupted（载入时刻不可能有
 *   in-flight 生成），UI 展示真实恢复动作（同 actionId 重发叙述，不自动）。
 * - 预算/资源 revision 冻结进 RunIdentity.resourceRevision（场景 revision
 *   + 资源 revision 合成）；恢复前不一致 → 过期拒绝。
 *
 * 持久化位置：session.roleplay.runs（随会话同一次 durable 写入落盘）。
 * 非终态 run 绝不裁剪（对齐 pendingByBranch 背压合同）；终态按 LRU 保留
 * 最近 ROLEPLAY_RUN_LIMIT 条。run 记账失败降级为既有无 run 行为（不阻塞
 * 生产结算链），但绝不写假回执。
 */

import {
  beginRunStep,
  buildRunSummaryV1,
  classifyRunStepFailure,
  completeRunStep,
  createRunIdentity,
  createRunRecord,
  findRunStep,
  parseRunRecordV1,
  setRunStatus,
  RUN_TERMINAL_STATUSES
} from '../run/runContract.js'
import { getResourceRevision } from './roleplayResources.js'

export const ROLEPLAY_RUN_TASK_ID = 'experience.roleplay.kp-turn'
export const ROLEPLAY_RUN_LIMIT = 50
// KP 主持周期 run 的任务身份（与 roleplayKpCoordinator 共用，避免反向依赖）。
export const ROLEPLAY_KP_TASK_ID = 'experience.roleplay.kp-cycle'

export function normalizeRoleplayRunRecords(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map(parseRunRecordV1).filter(Boolean)
}

/** 终态 LRU 裁剪；非终态（含 interrupted/unknown）全量保留。 */
export function trimRoleplayRuns(state) {
  const runs = state?.runs
  if (!Array.isArray(runs)) return
  let terminal = runs.filter((run) => RUN_TERMINAL_STATUSES.includes(run.status))
  if (runs.length <= ROLEPLAY_RUN_LIMIT || terminal.length === 0) return
  terminal.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))
  const keepTerminal = new Set(terminal.slice(0, Math.max(0, ROLEPLAY_RUN_LIMIT - (runs.length - terminal.length))).map((run) => run.runId))
  state.runs = runs.filter((run) => !RUN_TERMINAL_STATUSES.includes(run.status) || keepTerminal.has(run.runId))
}

function turnResourceRevision(state) {
  const scenarioRevision = state?.scenarioRun?.scenarioRevision || state?.scenario?.revision || null
  const resourceRevision = state?.resources ? getResourceRevision(state.resources) : null
  return [scenarioRevision ? `scenario:${scenarioRevision}` : null, resourceRevision != null ? `resources:${resourceRevision}` : null]
    .filter(Boolean).join('|') || null
}

function findRunByAction(state, actionId) {
  return (state?.runs || []).find((run) => run.runId === String(actionId || '')) || null
}

/** 当前资源/场景 revision 快照（KP 每拍后刷新 run 快照，避免提案被误判过期）。 */
export function currentRoleplayRevisionSnapshot(state) {
  return turnResourceRevision(state)
}

/**
 * 确认 durable 后建 run：'confirm' 步骤即记 succeeded（commitReceipt=会话
 * durable 落盘）。同 runId 重复调用幂等。失败降级返回 null（不阻塞结算）。
 */
export function createTurnRun(store, state, action) {
  try {
    const existing = findRunByAction(state, action.actionId)
    if (existing) return existing
    const identity = createRunIdentity({
      taskId: ROLEPLAY_RUN_TASK_ID,
      scope: {
        bookId: store.worldId || null,
        sessionId: store.currentSessionId || '',
        branchId: action.branchId || 'main'
      },
      resourceRevision: turnResourceRevision(state)
    })
    // runId 直接用 actionId：与回执 receiptId 同一身份，恢复入口可互相引用。
    identity.runId = action.actionId
    const run = createRunRecord({ identity })
    state.runs = Array.isArray(state.runs) ? state.runs : []
    state.runs.push(run)
    beginRunStep(run, { stepId: 'confirm', input: { actionId: action.actionId, attribute: action.attribute, modifier: action.modifier } })
    completeRunStep(run, {
      stepId: 'confirm',
      status: 'succeeded',
      result: { confirmedAt: action.confirmedAt || null },
      resultRef: `action:${action.actionId}`,
      effectKey: `confirm:${action.actionId}`,
      commitReceipt: { kind: 'session-durable', committedAt: Date.now() }
    })
    if (action.status === 'resolved') recordTurnRunResolution(state, action)
    trimRoleplayRuns(state)
    return run
  } catch {
    return null
  }
}

/**
 * 骰点/场景/资源步骤记账（幂等）：在 durable 之后调用。骰点 effectKey=
 * dice:<actionId>；场景/资源结算沿用各自 actionId 幂等键。
 */
export function recordTurnRunResolution(state, action) {
  const run = findRunByAction(state, action.actionId)
  if (!run) return
  try {
    beginRunStep(run, { stepId: 'resolve', input: { actionId: action.actionId } })
    completeRunStep(run, {
      stepId: 'resolve',
      status: 'succeeded',
      result: action.resolution
        ? { dice: action.resolution.dice, modifier: action.resolution.modifier, total: action.resolution.total, outcome: action.resolution.outcome }
        : null,
      resultRef: `action:${action.actionId}#resolution`,
      effectKey: `dice:${action.actionId}`,
      commitReceipt: { kind: 'session-durable', committedAt: Date.now() }
    })
    if (action.intentHint?.startsWith('scenario-clue:')) {
      const clueId = action.intentHint.slice('scenario-clue:'.length).trim()
      beginRunStep(run, { stepId: 'scenario-outcome', input: { actionId: action.actionId, clueId } })
      completeRunStep(run, {
        stepId: 'scenario-outcome',
        status: 'succeeded',
        result: { clueId, outcome: action.resolution?.outcome || 'failure' },
        effectKey: `outcome:${action.actionId}`,
        commitReceipt: { kind: 'session-durable', committedAt: Date.now() }
      })
    }
    beginRunStep(run, { stepId: 'narration', input: { actionId: action.actionId } })
    // 本 run 自身确定性效果已应用后的资源快照：恢复校验以“快照之后是否被
    // 其它路径改动”为准，而不是把本 run 的扣减误判为过期。
    run.resourceRevision = turnResourceRevision(state)
  } catch { /* 记账失败不阻塞生成链；已有步骤回执仍然有效 */ }
}

/** 叙述回合提交后（coordinator 事务内）：narration 步骤 succeeded，run 完成。 */
export function completeTurnRunNarration(state, action, { turnId } = {}) {
  const run = findRunByAction(state, action.actionId)
  if (!run) return
  try {
    completeRunStep(run, {
      stepId: 'narration',
      status: 'succeeded',
      result: { turnId: turnId || null },
      resultRef: `turn:${turnId || ''}`,
      commitReceipt: { kind: 'turn-commit', turnId: turnId || null, committedAt: Date.now() }
    })
    setRunStatus(run, 'completed')
    trimRoleplayRuns(state)
  } catch { /* 幂等复用路径（同 turnId）不报错；异结果由合同层拒绝 */ }
}

/** 叙述失败：经 T04 分类落步骤状态（429/超时/中止=可重试 failed；不确定写=unknown）。 */
export function failTurnRunNarration(state, action, errorCode) {
  const run = findRunByAction(state, action.actionId)
  if (!run) return
  try {
    const classified = classifyRunStepFailure({ errorCode })
    const step = findRunStep(run, 'narration')
    if (step && step.status !== 'succeeded') {
      completeRunStep(run, {
        stepId: 'narration',
        status: classified.status,
        errorCode: classified.code
      })
    }
    run.lastErrorCode = classified.code.slice(0, 80)
  } catch { /* 诊断字段尽力而为 */ }
}

/** 放弃 pending：显式取消对应 run（终态，保留诊断，不删除）。 */
export function cancelTurnRun(state, actionId) {
  const run = findRunByAction(state, actionId)
  if (!run || RUN_TERMINAL_STATUSES.includes(run.status)) return
  try {
    setRunStatus(run, 'cancelled', { errorCode: 'ROLEPLAY_CANCELLED' })
  } catch { /* 已终态则忽略 */ }
}

/**
 * 叙述请求统一前置（requestRoleplayNarration 唯一模型链入口）：
 * interrupted → running；narration 步骤 failed/pending → 正常推进
 * （failed 在 begin 时 attempt+1）。run 缺失（旧会话）→ 补建最小账目。
 */
export function prepareTurnRunForNarration(store, state, action) {
  if (!state || !action) return
  try {
    let run = findRunByAction(state, action.actionId)
    if (!run) {
      run = createTurnRun(store, state, action)
      if (!run) return
    }
    if (run.status === 'interrupted') setRunStatus(run, 'running')
    beginRunStep(run, { stepId: 'narration', input: { actionId: action.actionId } })
  } catch { /* 记账失败不阻塞生成链 */ }
}

/**
 * 载入扫描（只在会话载入路径调用，不在保存路径）：载入时刻不可能有
 * in-flight 生成，非终态 running 一律 interrupted；awaiting-human/unknown
 * 语义保留。返回被扫描为 interrupted 的 runId 列表（供诊断/回执）。
 */
export function markRoleplayRunsInterruptedOnLoad(state, { now = Date.now() } = {}) {
  if (!state || !Array.isArray(state.runs)) return []
  const interrupted = []
  for (const run of state.runs) {
    if (run.status === 'running') {
      try {
        setRunStatus(run, 'interrupted', { errorCode: 'RUN_LOAD_SCAN', now })
        interrupted.push(run.runId)
      } catch { /* 已终态则忽略 */ }
    }
  }
  return interrupted
}

/** 恢复面板投影：当前会话全部非终态 run（跨分支），附每项真实恢复语义。 */
export function buildRoleplayRunRecoveryViews(state) {
  if (!state || !Array.isArray(state.runs)) return []
  const currentRevision = turnResourceRevision(state)
  return state.runs
    .filter((run) => !RUN_TERMINAL_STATUSES.includes(run.status))
    .map((run) => ({
      ...buildRunSummaryV1(run),
      branchId: run.scope?.branchId || 'main',
      actionId: run.runId,
      stale: Boolean(run.resourceRevision) && run.resourceRevision !== currentRevision
    }))
}

/**
 * T08：候选采用前的过期校验——KP 确认停冻结的提案，若资源/场景 revision
 * 已被其它路径改变 → 过期，给出具体冻结/当前值（调用方硬拒绝采用）。
 */
export function checkCompanionProposalFresh(state, proposal) {
  if (!proposal) return { fresh: true }
  const proposalTarget = proposal.kind === 'move' ? proposal.toSceneId : proposal.clueId
  const proposalRef = `proposal:${proposal.kind}:${proposalTarget}`
  const run = (state?.runs || []).find((item) => (
    item.taskId === ROLEPLAY_KP_TASK_ID
    && !RUN_TERMINAL_STATUSES.includes(item.status)
    && (item.steps || []).some((step) => (
      step.stepId.startsWith('companion:')
      && step.status === 'succeeded'
      && step.resultRef === proposalRef
    ))
  ))
  if (!run || !run.resourceRevision) return { fresh: true }
  const current = turnResourceRevision(state)
  if (current === run.resourceRevision) return { fresh: true }
  return {
    fresh: false,
    frozenRevision: run.resourceRevision,
    currentRevision: current || '无',
    reason: '提案产生后资源/场景状态已被其它操作改动'
  }
}
