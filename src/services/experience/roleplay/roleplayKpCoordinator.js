/**
 * KP 阶段协调循环（R01/R02，nightly-20260918）：有界主持周期。
 *
 * 复用来源：StoryForge src/lib/ttrpg/kp-coordinator.ts @ 1935dab（MIT）
 * `runTtrpgKpCycleV1` 的协调结构——每个 AI 动作是可恢复的持久 run、
 * 真人优先检查先于任何生成、预算 1–8（本项目默认 3）、循环守卫、
 * 单飞锁（上游 Web Locks+进程内 Set；本项目单浏览器单 store 实例用
 * WeakSet，跨标签页锁归 T07）。上游的 db/harness/viewer-projection 依赖
 * 闭包不移植，替换为 Pinax 状态与唯一生成链。
 *
 * Pinax 适配边界：
 * - 不新增第二条模型链：narration 经既有 sendAction hidden advance；
 *   director 的节拍指令走既有导演注通道（确定性合成自场景公开投影，
 *   不调模型）；companion 提案确定性白名单（R03 起模型候选经同一校验）。
 * - 真人选择/待回应/暂停/结局立即停；预算预扣（崩溃/取消方向安全）；
 *   绝不把无限续写当主持。
 * - 循环状态持久：kp-cycle run 记录每个 phase 步骤（G2b 合同），刷新后
 *   pendingRun 查找恢复同一 run 的未完成步，不重复已完成 AI 动作。
 */

import {
  beginRunStep,
  completeRunStep,
  createRunIdentity,
  createRunRecord,
  setRunStatus,
  RUN_TERMINAL_STATUSES
} from '../run/runContract.js'
import { beginHostStep, completeHostStep, createHostPlan } from './roleplayHost.js'
import { resolveCompanionProposal } from './roleplayCompanion.js'
import {
  ensureRoleplaySessionState,
  getRoleplayScenarioView
} from './roleplayWorkflow.js'
import { getRoleplayPendingForBranch } from './roleplayState.js'
import { ROLEPLAY_KP_TASK_ID, currentRoleplayRevisionSnapshot } from './roleplayRuns.js'
import { withExclusiveRunLock } from '../run/runLock.js'

export { ROLEPLAY_KP_TASK_ID }

// ROLEPLAY_KP_TASK_ID 从 roleplayRuns.js 导入（单一来源，见文件头复用边界）。
export const ROLEPLAY_KP_BUDGET_LIMITS = Object.freeze({ min: 1, max: 8, default: 3 })

export const ROLEPLAY_KP_STATUSES = Object.freeze([
  'human-turn',       // 本拍完成，等真人行动
  'human-response',   // 有待回应/待确认检定：真人优先，立即停
  'confirmation',     // 同伴提案等待真人采纳
  'paused',           // 主持被暂停
  'ended',            // 场景已结局
  'setup-required',   // 无进行中的场景
  'budget-limit',     // 本批预算耗尽，交还真人
  'busy',             // 已有主持循环/生成在飞
  'error'             // 生成失败（可显式重试，不自动续跑）
])

const kpInFlight = new WeakSet()

function normalizeBudget(requested) {
  const value = Number(requested)
  if (!Number.isFinite(value)) return ROLEPLAY_KP_BUDGET_LIMITS.default
  return Math.max(ROLEPLAY_KP_BUDGET_LIMITS.min, Math.min(ROLEPLAY_KP_BUDGET_LIMITS.max, Math.floor(value)))
}

function currentBranchId(store) {
  return store.activeBranchId || 'main'
}

/** pendingRun 查找（上游同名语义）：同分支非终态 kp run 复用，不新开。 */
export function findKpRunForBranch(state, branchId) {
  return (state?.runs || []).find((run) => (
    run.taskId === ROLEPLAY_KP_TASK_ID
    && (run.scope?.branchId || 'main') === String(branchId || 'main')
    && !RUN_TERMINAL_STATUSES.includes(run.status)
  )) || null
}

/**
 * 确定性节拍指令（director 阶段，0 预算）：从场景公开投影合成导演注，
 * 经既有导演注通道约束 narration。只描述可见状态与建议焦点，
 * 不泄露未发现线索/结局条件（与 CX15/G19 投影同一来源）。
 */
export function buildKpBeatDirective(store) {
  const view = getRoleplayScenarioView(store)
  if (!view || view.status !== 'active') return null
  const parts = [`当前场景：${view.currentScene?.name || '未知'}`]
  const clueCount = Array.isArray(view.availableSceneClueActions) ? view.availableSceneClueActions.length : 0
  if (clueCount > 0) parts.push(`本场景有 ${clueCount} 项可检查的线索`)
  const exits = Array.isArray(view.currentScene?.exits) ? view.currentScene.exits : []
  if (exits.length > 0) parts.push(`出口：${exits.map((exit) => exit.label).join('、')}`)
  parts.push('以有画面感而简洁的中文推进一拍：让后果清楚可感，结尾留给真人行动，不替真人决定。')
  return parts.join('；')
}

function kpRunStepSequence(run, prefix) {
  return (run?.steps || []).filter((step) => String(step.stepId || '').startsWith(prefix)).length
}

/** 供恢复视图/诊断使用的 kp run 摘要。 */
export function getRoleplayKpRunView(store) {
  const state = store.roleplaySession
  if (!state) return null
  const run = findKpRunForBranch(state, currentBranchId(store))
  return run
    ? {
        runId: run.runId,
        status: run.status,
        budget: run.budget ? { ...run.budget } : null,
        lastErrorCode: run.lastErrorCode,
        updatedAt: run.updatedAt
      }
    : null
}

/**
 * 有界主持周期：budget 默认最多 3 个 AI 动作（1–8）。返回统一状态
 * （R02 合同）：human-turn/human-response/confirmation/paused/ended/
 * setup-required/budget-limit/busy/error。
 */
export async function runRoleplayKpCycle(store, { maxAiActions = ROLEPLAY_KP_BUDGET_LIMITS.default, companionCandidateProvider = null, lockAdapter = null } = {}) {
  if (kpInFlight.has(store)) return { status: 'busy', aiActions: 0, runId: null }
  kpInFlight.add(store)
  try {
    // T07：跨标签独占锁——另一标签页不得重复消费同一会话的主持任务；
    // 无 Web Locks 环境由上方 WeakSet 单飞兜底（lockHeld=false 如实标注）。
    return await withExclusiveRunLock(
      `pinax-roleplay-kp:${store.currentSessionId || 'none'}`,
      () => executeKpCycle(store, { maxAiActions: normalizeBudget(maxAiActions), companionCandidateProvider }),
      { lockAdapter, onBusy: () => ({ status: 'busy', aiActions: 0, runId: null, busyReason: 'RUN_LOCK_HELD' }) }
    )
  } catch (error) {
    return { status: 'error', aiActions: 0, runId: null, errorCode: error.code || 'KP_CYCLE_FAILED' }
  } finally {
    kpInFlight.delete(store)
  }
}

async function executeKpCycle(store, { maxAiActions, companionCandidateProvider }) {
  let state = ensureRoleplaySessionState(store)
  const branchId = currentBranchId(store)
  const sessionId = store.currentSessionId
  const worldId = store.worldId

  // 预算合同复用 hostPlan（持久、暂停/恢复语义与 UI 既有按钮一致）。
  if (!state.hostPlan) state.hostPlan = createHostPlan({ maxSteps: maxAiActions })
  let plan = state.hostPlan

  // pendingRun 查找：恢复同一 kp run（刷新/中断后不重做已完成的 AI 动作）。
  let run = findKpRunForBranch(state, branchId)
  if (!run) {
    const identity = createRunIdentity({
      taskId: ROLEPLAY_KP_TASK_ID,
      scope: { bookId: store.worldId || null, sessionId: store.currentSessionId || '', branchId },
      resourceRevision: state.scenarioRun?.scenarioRevision || null
    })
    run = createRunRecord({ identity, budget: { maxAiActions: plan.maxSteps, usedAiActions: plan.stepsUsed } })
    state.runs = Array.isArray(state.runs) ? state.runs : []
    state.runs.push(run)
  }
  if (run.status === 'interrupted') setRunStatus(run, 'running')
  const runId = run.runId
  const sameScope = () => store.currentSessionId === sessionId && store.worldId === worldId && currentBranchId(store) === branchId
  const refreshLiveState = () => {
    if (!sameScope()) throw Object.assign(new Error('主持期间会话已切换'), { code: 'KP_SCOPE_CHANGED' })
    state = store.roleplaySession
    run = state?.runs?.find(item => item.runId === runId)
    plan = state?.hostPlan
    if (!run || !plan) throw Object.assign(new Error('主持运行记录已改变'), { code: 'KP_RUN_STALE' })
  }
  let aiActions = 0

  // 循环守卫（上游 3*max+6 同型）：任何异常路径都保证有限步退出。
  for (let guard = 0; guard < 3 * maxAiActions + 6; guard += 1) {
    refreshLiveState()
    // ── 真人优先/边界检查（先于任何生成，立即停） ──
    if (state.scenarioRun?.status === 'ended') {
      setRunStatus(run, 'completed')
      return { status: 'ended', aiActions, runId: run.runId }
    }
    if (!state.scenarioRun || state.scenarioRun.status !== 'active' || !state.scenario) {
      setRunStatus(run, 'awaiting-human')
      return { status: 'setup-required', aiActions, runId: run.runId }
    }
    if (plan.status === 'paused' || plan.status === 'ended') {
      setRunStatus(run, 'awaiting-human')
      return { status: plan.status === 'ended' ? 'ended' : 'paused', aiActions, runId: run.runId }
    }
    if (getRoleplayPendingForBranch(state, branchId)) {
      // 真人优先：待回应检定永远不代玩家消费。
      setRunStatus(run, 'awaiting-human')
      return { status: 'human-response', aiActions, runId: run.runId }
    }
    if (store.isLoading) {
      return { status: 'busy', aiActions, runId: run.runId }
    }
    if (plan.stepsUsed >= plan.maxSteps) {
      setRunStatus(run, 'awaiting-human')
      return { status: 'budget-limit', aiActions, runId: run.runId }
    }

    // ── director 阶段（确定性合成，0 预算） ──
    const sequence = kpRunStepSequence(run, 'narration:') + 1
    const beat = buildKpBeatDirective(store)
    if (!beat) {
      setRunStatus(run, 'awaiting-human')
      return { status: 'setup-required', aiActions, runId: run.runId }
    }
    const directorStepId = `director:${sequence}`
    beginRunStep(run, { stepId: directorStepId, input: { sequence } })
    completeRunStep(run, {
      stepId: directorStepId,
      status: 'succeeded',
      result: { beat },
      effectKey: `kp-director:${branchId}:${sequence}`
    })

    // ── narration 阶段（唯一 AI 动作，预算预扣） ──
    const narrationStepId = `narration:${sequence}`
    const stepId = `kp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const beginResult = beginRunStep(run, {
      stepId: narrationStepId,
      input: { sequence, beat }
    })
    const isResume = beginResult.reused === true
    beginHostStep(plan, { stepId })
    try {
      // Freeze budget and pending step before external work; failed storage
      // must stop the cycle rather than allowing a refresh to reset its cost.
      run.budget = { maxAiActions: plan.maxSteps, usedAiActions: plan.stepsUsed }
      persistKpState(store)
      const outcome = await store.sendAction('推进一拍', {
        hidden: true,
        source: 'roleplay-host',
        intent: 'advance',
        directorNote: beat
      })
      // sendAction can replace roleplaySession during rollback. Receipts must
      // follow the live state, as in B's rollback-safe coordinator.
      refreshLiveState()
      if (outcome === 'success') {
        completeRunStep(run, {
          stepId: narrationStepId,
          status: 'succeeded',
          result: { sequence, resumed: isResume },
          resultRef: store.lastCommittedTurnId ? `turn:${store.lastCommittedTurnId}` : null,
          effectKey: `kp-narration:${branchId}:${sequence}`,
          commitReceipt: store.lastCommittedTurnId
            ? { kind: 'turn-commit', turnId: store.lastCommittedTurnId, committedAt: Date.now() }
            : null,
          budgetCost: 1
        })
        run.budget = { maxAiActions: plan.maxSteps, usedAiActions: plan.stepsUsed }
        // 本拍确定性效果（资源结算等）后的 revision 快照：后续提案过期校验
        // 以每拍后的快照为准，而不是 run 创建时的冻结值。
        run.resourceRevision = currentRoleplayRevisionSnapshot(state) || run.resourceRevision
        aiActions += 1
      } else {
        completeRunStep(run, {
          stepId: narrationStepId,
          status: 'failed',
          errorCode: outcome === 'cancelled' ? 'NARRATIVE_AGENT_ABORTED' : 'KP_NARRATION_FAILED'
        })
        setRunStatus(run, 'awaiting-human', { errorCode: 'KP_NARRATION_FAILED' })
        return { status: 'error', aiActions, runId: run.runId, errorCode: outcome === 'cancelled' ? 'NARRATIVE_AGENT_ABORTED' : 'KP_NARRATION_FAILED' }
      }
    } catch (error) {
      refreshLiveState()
      completeRunStep(run, {
        stepId: narrationStepId,
        status: 'failed',
        errorCode: String(error?.code || 'KP_NARRATION_FAILED').slice(0, 80)
      })
      setRunStatus(run, 'awaiting-human', { errorCode: String(error?.code || 'KP_NARRATION_FAILED').slice(0, 80) })
      return { status: 'error', aiActions, runId: run.runId, errorCode: String(error?.code || 'KP_NARRATION_FAILED').slice(0, 80) }
    } finally {
      if (sameScope()) {
        refreshLiveState()
        completeHostStep(plan, { stepId })
        persistKpState(store)
      }
    }

    // ── companion 阶段：模型白名单候选（R03），确定性白名单是显式标注的
    // 降级路径。畸形/越权候选保留诊断后停下——绝不偷偷换成第一个动作
    // 并称"AI 决策"。 ──
    const view = getRoleplayScenarioView(store)
    if (state.companion?.enabled === true && view) {
      let modelCandidate = null
      if (typeof companionCandidateProvider === 'function') {
        try {
          modelCandidate = await companionCandidateProvider({ projection: view })
          refreshLiveState()
          if (modelCandidate == null) throw new Error('模型未返回候选')
        } catch (error) {
          refreshLiveState()
          setRunStatus(run, 'awaiting-human', { errorCode: 'KP_COMPANION_PROVIDER_FAILED' })
          persistKpState(store)
          return { status: 'error', aiActions, runId: run.runId, errorCode: 'KP_COMPANION_PROVIDER_FAILED', diagnostics: String(error?.message || error).slice(0, 200) }
        }
      }
      const resolved = resolveCompanionProposal({ projection: view, modelCandidate })
      if (resolved.ok) {
        const companionStepId = `companion:${sequence}`
        beginRunStep(run, { stepId: companionStepId, input: { sequence, source: resolved.source } })
        completeRunStep(run, {
          stepId: companionStepId,
          status: 'succeeded',
          result: resolved.proposal,
          // T08：候选身份写入 resultRef（receipt 只存 resultHash，不存结果对象），
          // 供采用时过期校验定位冻结提案。
          resultRef: `proposal:${resolved.proposal.kind}:${resolved.proposal.clueId || resolved.proposal.toSceneId}`,
          effectKey: `kp-companion:${branchId}:${sequence}`
        })
        if (state.companion) state.companion.lastProposal = resolved.proposal
        setRunStatus(run, 'awaiting-human')
        persistKpState(store)
        return { status: 'confirmation', aiActions, runId: run.runId, proposal: resolved.proposal, proposalSource: resolved.source }
      }
      if (resolved.reason !== 'COMPANION_NO_AVAILABLE_ACTION') {
        // 候选畸形/越权：记录失败步骤（诊断保留），显式停下交还真人。
        const companionStepId = `companion:${sequence}`
        beginRunStep(run, { stepId: companionStepId, input: { sequence, source: resolved.source || 'model' } })
        completeRunStep(run, {
          stepId: companionStepId,
          status: 'failed',
          errorCode: resolved.reason
        })
        setRunStatus(run, 'awaiting-human', { errorCode: resolved.reason })
        persistKpState(store)
        return { status: 'error', aiActions, runId: run.runId, errorCode: resolved.reason, diagnostics: resolved.detail }
      }
      // 无可用动作：不停止，也不杜撰提案。
    }

    persistKpState(store)
  }

  setRunStatus(run, 'awaiting-human')
  persistKpState(store)
  return { status: 'budget-limit', aiActions, runId: run.runId }
}

function persistKpState(store) {
  if (!store.currentSessionId) return
  const result = store.commitCurrentSessionNow()
  if (result === false || result?.ok === false) {
    throw Object.assign(new Error('主持状态保存失败，已停止'), { code: 'KP_PERSIST_FAILED' })
  }
}

/**
 * R02：统一主持状态投影（真人优先/暂停/结束/预算耗尽一个出口）。
 * UI 与诊断只读这个形态。
 */
export function getRoleplayKpStatusView(store) {
  const state = store.roleplaySession
  if (!state) return null
  const branchId = currentBranchId(store)
  const plan = state.hostPlan
  let status = 'setup-required'
  if (state.scenarioRun?.status === 'ended') status = 'ended'
  else if (state.scenarioRun?.status === 'paused') status = 'paused'
  else if (plan?.status === 'paused') status = 'paused'
  else if (plan?.status === 'ended') status = 'ended'
  else if (getRoleplayPendingForBranch(state, branchId)) status = 'human-response'
  else if (state.scenarioRun?.status === 'active') status = 'human-turn'
  const run = findKpRunForBranch(state, branchId)
  return {
    status,
    budget: plan ? { maxSteps: plan.maxSteps, stepsUsed: plan.stepsUsed, remaining: Math.max(0, plan.maxSteps - plan.stepsUsed) } : null,
    exhausted: Boolean(plan && plan.stepsUsed >= plan.maxSteps),
    run: run
      ? { runId: run.runId, status: run.status, lastErrorCode: run.lastErrorCode }
      : null,
    proposal: state.companion?.lastProposal || null
  }
}
