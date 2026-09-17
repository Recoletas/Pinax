/**
 * Roleplay 工作流服务：确认 → 一次性结算 → 持久回执 → 既有叙述链。
 *
 * 边界（与任务书 §6 一致）：
 * - experienceTurnCoordinator 仍是唯一回合提交 owner；本模块只在回合外
 *   冻结动作与骰点，并经既有 sendAction 单链请求叙述（不旁路第二条请求）。
 * - 骰点先 durable 落盘再请求模型；未持久化不发送（R18 gate）。
 * - 重试叙述复用同一 actionId 与骰点，绝不重掷；放弃是显式取消。
 * - 资源不自动扣减（轻规则）；receipt 不旁路写 gameStore 状态。
 */

import {
  cancelRoleplayAction,
  compareRoleplayActionPayload,
  createConfirmedRoleplayAction,
  createRoleplayActionId,
  markRoleplayActionCommitted,
  applyResolution
} from './roleplayActionContract.js'
import {
  checkRoleplayOutboxCapacity,
  checkRoleplayPendingCapacity,
  createEmptyRoleplaySessionState,
  getRoleplayPendingForBranch,
  loadRoleplayStateForSession,
  normalizeRoleplaySessionState,
  ROLEPLAY_PENDING_CAPACITY
} from './roleplayState.js'
import {
  buildCheckRowProjection,
  buildResolutionDirective,
  buildTurnReceiptV1,
  findConflictingReceipt
} from './roleplayProjection.js'
import {
  drainRoleplayArchiveOutbox,
  queueRoleplayArchive
} from './roleplayHistoryAdapter.js'
import { createCryptoUint32Source, parseDiceExpression, sampleDiceFromUint32 } from './third-party/storyforgeDice.js'
import { ROLEPLAY_RULE_2D6, describeRuleText } from './roleplayRules.js'
import {
  applyScenarioOutcome,
  buildScenarioPublicProjection,
  createScenarioRun,
  maybeApplyEnding,
  moveScenarioRun,
  normalizeScenario
} from './roleplayScenario.js'
import {
  applyOutcomeResourceCost,
  buildResourceProjection,
  createResourceState,
  grantItem,
  useItem as applyItemUse
} from './roleplayResources.js'
import { beginHostStep, completeHostStep, createHostPlan, pauseHostPlan, resumeHostPlan } from './roleplayHost.js'
import { buildRecordSourceRef, exportAdventureRecord } from './roleplayRecords.js'
import {
  buildCompanionKnowledgeContext,
  createCompanion,
  createCompanionProposal,
  validateProposalAgainstProjection
} from './roleplayCompanion.js'
import { buildActorCardProjection, createActor, setActorOverride } from './roleplayActor.js'

function roleplayError(code, message) {
  return Object.assign(new Error(message), { code })
}

function currentBranchId(store) {
  return store.activeBranchId || 'main'
}

/** 惰性初始化会话级 roleplay 状态（保持 null = 旧会话自由叙事语义）。 */
export function ensureRoleplaySessionState(store) {
  if (!store.roleplaySession) {
    store.roleplaySession = createEmptyRoleplaySessionState()
  }
  return store.roleplaySession
}

// ── 玩家行动者（CX19）：稳定 actorRef + 属性 override（来源可区分） ──

/** 惰性创建行动者（actorRef 绑定会话身份；名字取当前写作角色）。 */
export function ensureRoleplayActor(store) {
  const state = ensureRoleplaySessionState(store)
  if (!state.actor) {
    state.actor = createActor({
      sessionId: store.currentSessionId || '',
      name: store.writingCharacter?.name || store.playerCharacter?.name || '玩家'
    })
  }
  return state.actor
}

export function setRoleplayActorOverride(store, { attribute, modifier } = {}) {
  const actor = ensureRoleplayActor(store)
  setActorOverride(actor, { attribute, modifier })
  persistRoleplayState(store)
  return actor
}

/** 角色卡只读投影（UI 与追溯共用）。 */
export function getRoleplayActorCard(store) {
  const actor = store.roleplaySession?.actor
  return actor ? buildActorCardProjection(actor) : null
}

/**
 * 持久化 roleplay 状态。requireDurable=true 时强制立即写盘并返回真实结果，
 * 供"骰点先落盘"门禁使用；失败只报失败，绝不返回假成功。
 */
export function persistRoleplayState(store, { requireDurable = false } = {}) {
  store.saveCurrentSession()
  if (!requireDurable) return { ok: true }
  const ok = store.flushSaveSessions()
  return ok ? { ok: true } : { ok: false, reason: 'ROLEPLAY_PERSIST_FAILED' }
}

/** 起团设置：模式（free/rules）+ 本场目标 + 行动者。不迁移旧会话默认值。 */
export function setRoleplaySessionSetup(store, { mode, goal = '', actorRef = null } = {}) {
  if (mode !== 'free' && mode !== 'rules') {
    throw roleplayError('ROLEPLAY_MODE_INVALID', '模式只能是 自由叙事 或 轻规则 2d6')
  }
  // CX05：该会话存在未知/未来版本的 roleplay 数据——保持只读，拒绝有损覆盖。
  if (store.roleplayFutureRaw) {
    throw roleplayError(
      'ROLEPLAY_FUTURE_STATE_READONLY',
      '本会话包含更新版本创建的跑团数据，当前版本只读展示；不能修改模式或状态，以免丢失新数据'
    )
  }
  const state = ensureRoleplaySessionState(store)
  state.mode = mode
  state.goal = String(goal || '').trim().slice(0, 200)
  if (actorRef && typeof actorRef === 'object') {
    state.actorRef = {
      kind: actorRef.kind === 'character' ? 'character' : 'unspecified',
      name: String(actorRef.name || '').slice(0, 80),
      entryId: actorRef.entryId ? String(actorRef.entryId).slice(0, 120) : null
    }
  } else {
    state.actorRef = null
  }
  state.modeDecidedAt = Date.now()
  persistRoleplayState(store)
  return state
}

function rollDiceForAction(action, { nextUint32 } = {}) {
  const expression = parseDiceExpression(action.ruleSnapshot.expression || ROLEPLAY_RULE_2D6.expression)
  // 表达式数量被规则限定为 2d6；若 ruleSnapshot 被篡改为其它表达式，
  // parse 结果与规则不一致时拒绝，而不是照骰。
  if (expression.normalized !== ROLEPLAY_RULE_2D6.expression) {
    throw roleplayError('ROLEPLAY_EXPRESSION_MISMATCH', '行动的骰式与冻结规则不一致')
  }
  return sampleDiceFromUint32({
    count: expression.count,
    sides: expression.sides,
    nextUint32: nextUint32 || createCryptoUint32Source()
  })
}

/**
 * 确认并一次性结算（confirm → durable → roll → durable）。
 * 幂等：当前分支已有 pending 且 payload 相同 → 复用（不重复掷骰）；
 * payload 不同 → 冲突拒绝。任何一步持久化失败都不产生骰点副作用外溢。
 */
export async function confirmRoleplayAction(store, {
  rawInput,
  attribute,
  modifier = 0,
  modifierSource = 'manual',
  intentHint = '',
  nextUint32 = null
} = {}) {
  if (!store.currentSessionId) {
    throw roleplayError('ROLEPLAY_SESSION_MISSING', '没有活动会话，不能确认检定')
  }
  const state = ensureRoleplaySessionState(store)
  if (state.mode !== 'rules') {
    throw roleplayError('ROLEPLAY_MODE_NOT_RULES', '本场不是轻规则模式，不能检定')
  }
  if (store.isLoading) {
    throw roleplayError('ROLEPLAY_BUSY', '上一轮回应还在生成中')
  }
  const branchId = currentBranchId(store)
  const existing = getRoleplayPendingForBranch(state, branchId)
  // CX04：pending 容量在创建时背压——第 7 个分支的确认被拒绝并给出真实原因，
  // 已掷骰待回应的旧分支动作绝不静默淘汰。
  if (!existing) {
    const capacity = checkRoleplayPendingCapacity(state, branchId)
    if (!capacity.ok) {
      const message = `已有 ${ROLEPLAY_PENDING_CAPACITY} 个分支存在未完成的检定，请先重试或放弃它们，再开新分支的检定`
      store.lastError = message
      throw roleplayError('ROLEPLAY_PENDING_CAPACITY', message)
    }
    // CX02：归档队列满 → 新行动被明确背压（已提交故事与队列保留，不受影响）。
    if (!checkRoleplayOutboxCapacity(state).ok) {
      const message = '历史归档队列已满（未归档回执过多），暂不能确认新检定；已有故事与队列不受影响，等待归档排空'
      store.lastError = message
      throw roleplayError('ROLEPLAY_OUTBOX_CAPACITY', message)
    }
  }

  let action
  try {
    action = createConfirmedRoleplayAction({
      sessionId: store.currentSessionId,
      branchId,
      worldbookId: store.worldId || null,
      rawInput,
      attribute,
      modifier,
      modifierSource,
      intentHint
    })
  } catch (error) {
    store.lastError = error.message
    throw error
  }

  if (existing) {
    const verdict = compareRoleplayActionPayload(existing, action)
    if (verdict === 'identical') {
      // 双击/重发：复用既有行动。已结算且 durable → 直接重发叙述；否则走恢复。
      if (existing.status === 'resolved') {
        return requestRoleplayNarration(store, { actionId: existing.actionId })
      }
      return resumeRoleplayPending(store, { actionId: existing.actionId, nextUint32 })
    }
    store.lastError = '当前分支已有一次进行中的检定，请先重试或放弃它'
    throw roleplayError('ROLEPLAY_PENDING_CONFLICT', '当前分支已有一次进行中的检定，请先重试或放弃它')
  }

  // 1) confirmed 先 durable —— 失败则零骰点、零模型。
  state.pendingByBranch[branchId] = action
  const persisted = persistRoleplayState(store, { requireDurable: true })
  if (!persisted.ok) {
    delete state.pendingByBranch[branchId]
    store.lastError = '确认保存失败（存储可能已满），检定未开始，输入已保留'
    throw roleplayError('ROLEPLAY_PERSIST_FAILED', '确认保存失败（存储可能已满），检定未开始，输入已保留')
  }

  return resolvePendingAction(store, { actionId: action.actionId, nextUint32 })
}

/** 对 confirmed 的 pending 掷骰并 durable 提交；已有内存结算则复用不重掷。 */
export async function resolvePendingAction(store, { actionId, nextUint32 = null } = {}) {
  const state = ensureRoleplaySessionState(store)
  const branchId = currentBranchId(store)
  const action = getRoleplayPendingForBranch(state, branchId)
  if (!action || action.actionId !== actionId) {
    throw roleplayError('ROLEPLAY_PENDING_MISSING', '没有待结算的检定')
  }
  if (action.status === 'resolved') {
    return requestRoleplayNarration(store, { actionId })
  }
  if (action.status !== 'confirmed') {
    throw roleplayError('ROLEPLAY_RESOLVE_INVALID_STATE', '检定状态不允许结算')
  }

  if (!action.resolution) {
    // 2) 骰点（内存中先结算，再 durable）
    let rolled
    try {
      rolled = rollDiceForAction(action, { nextUint32 })
    } catch (error) {
      store.lastError = error.message
      throw error
    }
    applyResolution(action, { dice: rolled.dice, rngTrace: rolled.trace })
  }

  // 3) 结算 durable —— 失败不启动生成；行动保留 confirmed+内存结算，可重试保存。
  const persisted = persistRoleplayState(store, { requireDurable: true })
  if (!persisted.ok) {
    store.lastError = '骰点已生成但未能保存，叙事未开始；请重试保存'
    throw roleplayError('ROLEPLAY_RESOLUTION_NOT_DURABLE', '骰点已生成但未能保存，叙事未开始；请重试保存')
  }

  // CX16：durable 之后应用确定性场景效果（线索发现/失败前进/结局判定），
  // 幂等（同 actionId 只应用一次）；叙述是否成功不改变机械结果。
  applyScenarioOutcomeForAction(store, action)

  // CX22：资源结算后果（冻结规则 v1：部分成功 灯油-1 / 失败前进 活力-2），
  // 每 actionId 一次；重试叙述不再扣。
  if (!state.resources) state.resources = createResourceState()
  applyOutcomeResourceCost(state.resources, {
    actionId: action.actionId,
    outcome: action.resolution?.outcome,
    branchId: currentBranchId(store)
  })

  return requestRoleplayNarration(store, { actionId })
}

/**
 * 请求主持叙述：唯一模型链 = 既有 sendAction。
 * 约束文本走导演注通道；行动身份经 options.roleplayActionId 传给 coordinator。
 */
export async function requestRoleplayNarration(store, { actionId } = {}) {
  const state = ensureRoleplaySessionState(store)
  const branchId = currentBranchId(store)
  const action = getRoleplayPendingForBranch(state, branchId)
  if (!action || (actionId && action.actionId !== actionId)) {
    throw roleplayError('ROLEPLAY_PENDING_MISSING', '没有等待回应的检定')
  }
  if (action.status !== 'resolved') {
    throw roleplayError('ROLEPLAY_NOT_RESOLVED', '检定尚未结算，不能请求叙述')
  }
  if (action.sessionId !== store.currentSessionId) {
    throw roleplayError('ROLEPLAY_SCOPE_MISMATCH', '检定属于其它会话，已拒绝')
  }
  if (store.isLoading) {
    throw roleplayError('ROLEPLAY_BUSY', '上一轮回应还在生成中')
  }

  const userNote = String(store.pendingDirectorNote || '').trim()
  const directive = buildResolutionDirective(action)
  const directorNote = userNote
    ? `${directive} 导演注：${userNote}`.slice(0, 395)
    : directive

  return store.sendAction(action.rawInput, {
    source: 'roleplay',
    roleplayActionId: action.actionId,
    directorNote
  })
}

/** 显式重试叙述：同 actionId、同骰点；只累计 retryCount。 */
export async function retryRoleplayNarration(store) {
  const state = ensureRoleplaySessionState(store)
  const action = getRoleplayPendingForBranch(state, currentBranchId(store))
  if (!action || action.status !== 'resolved') {
    throw roleplayError('ROLEPLAY_PENDING_MISSING', '没有可重试的检定')
  }
  action.retryCount = Math.min(99, action.retryCount + 1)
  return requestRoleplayNarration(store, { actionId: action.actionId })
}

/** 放弃当前分支 pending：显式取消，保留为诊断，不产生正式回合。 */
export function cancelRoleplayPending(store) {
  const state = ensureRoleplaySessionState(store)
  const branchId = currentBranchId(store)
  const action = getRoleplayPendingForBranch(state, branchId)
  if (!action) return false
  cancelRoleplayAction(action)
  delete state.pendingByBranch[branchId]
  persistRoleplayState(store)
  return true
}

/** 放弃已结算但未 durable 的骰点仅是丢弃内存态；已 durable 的用 cancelRoleplayPending。 */

/**
 * 发送门禁（gameStore.sendAction 顶部调用）：存在可叙述 pending 时，
 * 只放行它的叙述请求；其它发送明确拒绝，避免"骰点悬空、正文绕过结果"。
 */
export function assertRoleplaySendAllowed(store, options = {}) {
  const state = store.roleplaySession
  if (!state || state.mode !== 'rules') return
  // CX17/G20：结局已达成 → 停止后续行动请求，显式交还真人（开始新冒险或放弃本场）。
  if (state.scenarioRun?.status === 'ended') {
    const message = '本场冒险已结局：请查看结局，开始新冒险或放弃本场后继续自由行动'
    store.lastError = message
    throw roleplayError('ROLEPLAY_SCENARIO_ENDED', message)
  }
  const pending = getRoleplayPendingForBranch(state, currentBranchId(store))
  if (!pending) return
  if (options.roleplayActionId && options.roleplayActionId === pending.actionId) return
  const message = pending.status === 'resolved'
    ? '已检定、等待回应：请先「重试回应」或「放弃本次检定」'
    : '有未完成的检定确认，请先完成或放弃'
  store.lastError = message
  throw roleplayError('ROLEPLAY_PENDING_BLOCKS_SEND', message)
}

// ── coordinator 回调（由 experienceTurnCoordinator 在事务内调用） ──

/**
 * 叙述开始时绑定：校验 pending 与请求身份一致，把检定行投影挂到
 * 本回合 user 消息上（随消息持久化、随分支可见）。
 * 重生成/重试叙述（无 pending，但 user 消息带已提交检定行）返回
 * renarration 绑定，复用旧骰点约束；找不到任何绑定时返回 null（自由叙事）。
 */
export function bindRoleplayNarration(store, { roleplayActionId, userMessageId }) {
  const state = store.roleplaySession
  if (!state || state.mode !== 'rules') return null
  const pending = getRoleplayPendingForBranch(state, currentBranchId(store))
  const userMessage = userMessageId
    ? (store.messages || []).find((message) => message?.id === userMessageId)
    : null

  if (pending) {
    if (!roleplayActionId || roleplayActionId !== pending.actionId) {
      // assertRoleplaySendAllowed 已在 sendAction 入口拦截；此处是事务内兜底。
      throw roleplayError('ROLEPLAY_PENDING_BLOCKS_SEND', '存在进行中的检定，普通发送被拒绝')
    }
    if (pending.status !== 'resolved' || pending.sessionId !== store.currentSessionId) {
      throw roleplayError('ROLEPLAY_SCOPE_MISMATCH', '检定状态不允许叙述')
    }
    if (userMessage) {
      userMessage.roleplayCheck = buildCheckRowProjection(pending)
    }
    return { pending: true, action: pending }
  }

  // 重生成/再次叙述：消息上已有已提交检定行 → 同一骰点约束继续生效。
  const checkRow = userMessage?.roleplayCheck
  if (checkRow && checkRow.status === 'committed' && checkRow.sessionId === store.currentSessionId) {
    return { pending: false, actionId: checkRow.actionId, checkRow }
  }
  return null
}

/**
 * 回合成功提交后落账：action → committed、receipt 入账（幂等，同 ID 异 hash 拒绝）、
 * 骰点行投影刷新、入 outbox（此处绝不归档）。全部同步完成后由 coordinator 的
 * commitCurrentSessionNow 统一落盘。
 */
export function commitRoleplayNarration(store, { action, turnRecord }) {
  const state = ensureRoleplaySessionState(store)
  const branchId = currentBranchId(store)
  // 会话身份在生成期间被切换/删除：迟到提交丢弃，不污染新会话。
  if (action.sessionId !== store.currentSessionId) return null

  const receipt = buildTurnReceiptV1(action, {
    turnId: turnRecord.id,
    parentTurnId: turnRecord.parentTurnId,
    store
  })
  const conflict = findConflictingReceipt(state.receipts, receipt)
  if (conflict) {
    throw roleplayError('ROLEPLAY_RECEIPT_CONFLICT', '同一行动身份出现不同回执内容，已拒绝')
  }

  markRoleplayActionCommitted(action, { narrationTurnId: turnRecord.id })
  const existingIndex = state.receipts.findIndex((item) => item.receiptId === receipt.receiptId)
  if (existingIndex >= 0) state.receipts[existingIndex] = receipt
  else state.receipts.push(receipt)
  if (state.receipts.length > 200) state.receipts.splice(0, state.receipts.length - 200)

  delete state.pendingByBranch[branchId]

  // 刷新消息上的检定行（status → committed），与回合同一次落盘。
  const userMessageId = turnRecord.userMessageIds?.[0]
  const userMessage = userMessageId
    ? (store.messages || []).find((message) => message?.id === userMessageId)
    : null
  if (userMessage) userMessage.roleplayCheck = buildCheckRowProjection(action)

  // CX03：入队携带冻结 scope（与回执一致），载荷自包含；容量满时如实背压——
  // 已提交回合不受影响（正文/骰点已落账），但新确认会被阻断直到队列排空。
  const archiveQueued = queueRoleplayArchive(state, {
    action,
    receipt,
    scope: receipt.scope
  })
  if (!archiveQueued.ok && archiveQueued.reason === 'ROLEPLAY_OUTBOX_CAPACITY') {
    store.lastError = '历史归档队列已满（未归档回执过多），新检定暂不可确认；已有故事与队列不受影响'
  }
  return receipt
}

/** Only called AFTER the coordinator's durable commit. Never save a different session. */
export async function archiveDurableRoleplayTurns(store) {
  const state = store.roleplaySession
  const sessionId = store.currentSessionId
  if (!state || !sessionId) return
  try {
    const summary = await drainRoleplayArchiveOutbox(state)
    if (summary.attempted > 0 && store.currentSessionId === sessionId && store.roleplaySession === state) {
      persistRoleplayState(store, { requireDurable: true })
    }
  } catch { /* durable outbox can be replayed; ledger receipt IDs are idempotent */ }
}

/** 叙述失败/取消：pending 保持 resolved（骰点不变），记诊断，等待显式重试。 */
export function failRoleplayNarration(store, { action, errorCode }) {
  action = store.roleplaySession?.pendingByBranch?.[action?.branchId] || action
  if (!action || action.status !== 'resolved') return
  action.retryCount = Math.min(99, action.retryCount + 1)
  action.lastErrorCode = String(errorCode || 'NARRATIVE_FAILED').slice(0, 80)
  persistRoleplayState(store)
}

/**
 * 重叙述不产生新的规则结算。保留原回执的回合/分支/时间与证据，
 * 新叙述通过消息上的 actionId 引用原结算；不可改写已归档的不可变载荷。
 */
export function commitRoleplayRenarration(store, { binding }) {
  const state = ensureRoleplaySessionState(store)
  if (actionSessionChanged(store, binding)) return null
  const receipt = state.receipts.find((item) => item.receiptId === binding.actionId)
  if (!receipt) return null
  return receipt
}

function actionSessionChanged(store, binding) {
  const checkRow = binding?.checkRow
  return !checkRow || checkRow.sessionId !== store.currentSessionId
}

/** 恢复 pending（刷新/重载后）：confirmed+内存结算 → 重存；confirmed → 掷骰。 */
export async function resumeRoleplayPending(store, { actionId, nextUint32 = null } = {}) {
  const state = ensureRoleplaySessionState(store)
  const action = getRoleplayPendingForBranch(state, currentBranchId(store))
  if (!action || (actionId && action.actionId !== actionId)) {
    throw roleplayError('ROLEPLAY_PENDING_MISSING', '没有可恢复的检定')
  }
  if (action.status === 'resolved') {
    return requestRoleplayNarration(store, { actionId: action.actionId })
  }
  if (action.status !== 'confirmed') {
    throw roleplayError('ROLEPLAY_RESUME_INVALID_STATE', '检定状态不可恢复')
  }
  return resolvePendingAction(store, { actionId: action.actionId, nextUint32 })
}

/** 供组件读取的确认行规则明文（单一来源）。 */
export function roleplayRuleSummary(modifier = 0) {
  return describeRuleText({ modifier })
}

export { createRoleplayActionId, normalizeRoleplaySessionState, loadRoleplayStateForSession }

// ── 场景编排（CX13–CX18）：运行源冻结、进入/移动/暂停、线索检定与结局 ──

const SCENARIO_CLUE_HINT_PREFIX = 'scenario-clue:'

/**
 * 开始冒险：normalize 并把场景体冻结进会话状态；此后外部定义变更不影响
 * 本场运行（XC-G33）。要求已选择轻规则模式（线索检定依赖 2d6 结算）。
 */
export function startRoleplayScenario(store, { scenario } = {}) {
  const normalized = normalizeScenario(scenario)
  if (!normalized) {
    throw roleplayError('ROLEPLAY_SCENARIO_INVALID', '场景定义无效')
  }
  if (store.roleplayFutureRaw) {
    throw roleplayError('ROLEPLAY_FUTURE_STATE_READONLY', '本会话包含更新版本的跑团数据，只读展示，不能开始新冒险')
  }
  const state = ensureRoleplaySessionState(store)
  if (state.mode !== 'rules') {
    throw roleplayError('ROLEPLAY_MODE_NOT_RULES', '开始场景冒险前，请先在模式条选择「轻规则 2d6」')
  }
  if (state.scenarioRun?.status === 'active') {
    throw roleplayError('ROLEPLAY_SCENARIO_ACTIVE', '已有一场冒险在进行中')
  }
  state.scenario = normalized
  state.scenarioRun = createScenarioRun(normalized)
  persistRoleplayState(store)
  return state.scenarioRun
}

/** 线索检定走同一 pending/结算通道（CX16）：场景内可用行动 → 确认 → 一次性结算。 */
export async function confirmRoleplayClueCheck(store, { clueId, nextUint32 = null } = {}) {
  const state = ensureRoleplaySessionState(store)
  const scenario = state.scenario
  const run = state.scenarioRun
  if (!scenario || !run) {
    throw roleplayError('ROLEPLAY_SCENARIO_MISSING', '没有进行中的场景冒险')
  }
  if (run.status !== 'active') {
    throw roleplayError('ROLEPLAY_SCENARIO_NOT_ACTIVE', run.status === 'ended' ? '本场冒险已结束' : '本场冒险已暂停')
  }
  const clue = scenario.clues.find((item) => item.id === clueId)
  if (!clue || run.clues[clueId] !== 'available' || clue.locationSceneId !== run.currentSceneId) {
    throw roleplayError('ROLEPLAY_CLUE_NOT_AVAILABLE', '该线索在当前场景不可检查')
  }
  // CX19：场景线索的修正以冻结场景定义为准（来源 'manual-adjust' 语义下
  // 由场景锚定）；actor override 只影响通用确认面板的默认值。
  return confirmRoleplayAction(store, {
    rawInput: clue.actionText,
    attribute: clue.attribute,
    modifier: clue.modifier,
    modifierSource: 'manual-adjust',
    intentHint: `${SCENARIO_CLUE_HINT_PREFIX}${clueId}`,
    nextUint32
  })
}

/** 检定结算后应用确定性场景效果（在 durable 落盘之后、叙述请求之前）。 */
function applyScenarioOutcomeForAction(store, action) {
  const state = store.roleplaySession
  const hint = String(action?.intentHint || '')
  if (!state?.scenarioRun || !state.scenario || !hint.startsWith(SCENARIO_CLUE_HINT_PREFIX)) return
  const clueId = hint.slice(SCENARIO_CLUE_HINT_PREFIX.length).trim()
  if (!clueId) return
  applyScenarioOutcome(state.scenarioRun, state.scenario, {
    actionId: action.actionId,
    clueId,
    outcome: action.resolution?.outcome || 'failure',
    branchId: action.branchId || currentBranchId(store)
  })
  // CX23：发现带奖励的线索 → 幂等授予白名单消耗品（同 actionId 不重复给）。
  const clue = state.scenario.clues.find((item) => item.id === clueId)
  if (clue?.grantsItem && state.scenarioRun.clues[clueId] === 'discovered') {
    if (!state.resources) state.resources = createResourceState()
    grantItem(state.resources, { itemId: clue.grantsItem, sourceActionId: action.actionId })
  }
}

/** 场景移动（CX14）：重复进入不重复发奖励；移动可能直接达成结局（确定性条件）。 */
export function moveRoleplayScene(store, { toSceneId } = {}) {
  const state = ensureRoleplaySessionState(store)
  if (!state.scenario || !state.scenarioRun) {
    throw roleplayError('ROLEPLAY_SCENARIO_MISSING', '没有进行中的场景冒险')
  }
  moveScenarioRun(state.scenarioRun, state.scenario, { toSceneId })
  maybeApplyEnding(state.scenarioRun, state.scenario)
  persistRoleplayState(store)
  return state.scenarioRun
}

export function pauseRoleplayScenario(store) {
  const state = ensureRoleplaySessionState(store)
  if (state.scenarioRun?.status === 'active') {
    state.scenarioRun.status = 'paused'
    persistRoleplayState(store)
  }
  return state.scenarioRun
}

export function resumeRoleplayScenario(store) {
  const state = ensureRoleplaySessionState(store)
  if (state.scenarioRun?.status === 'paused') {
    state.scenarioRun.status = 'active'
    persistRoleplayState(store)
  }
  return state.scenarioRun
}

/** 放弃本场：清空运行实例与冻结体（不删除已提交的回合与归档记录）。 */
export function abandonRoleplayScenario(store) {
  const state = ensureRoleplaySessionState(store)
  state.scenario = null
  state.scenarioRun = null
  persistRoleplayState(store)
  return null
}

/** 玩家公开投影（CX15/G19）：UI 与模型都只读这个形态。 */
export function getRoleplayScenarioView(store) {
  const state = store.roleplaySession
  if (!state?.scenarioRun || !state.scenario) return null
  return buildScenarioPublicProjection(state.scenarioRun, state.scenario)
}

// ── 资源账（CX19–CX24）：确定性白名单资源与消耗品 ──

/** 开始冒险时初始化资源账（rules 模式下首次结算也会惰性初始化）。 */
export function getRoleplayResourceView(store) {
  const state = store.roleplaySession
  if (!state?.resources) return null
  return buildResourceProjection(state.resources, { branchId: currentBranchId(store) })
}

/** 使用消耗品（CX23）：一次性，重复点击拒绝；效果走同一资源事务。 */
export function useRoleplayItem(store, { itemId } = {}) {
  const state = ensureRoleplaySessionState(store)
  if (!state.resources) state.resources = createResourceState()
  const result = applyItemUse(state.resources, { itemId })
  if (result.ok) persistRoleplayState(store)
  return result
}

// ── 有界主持（CX25/CX27/CX28/CX29）：预算制单步推进，经既有 hidden advance 通道 ──

/**
 * 推进一拍：预算预扣（异常/取消方向安全），叙述走唯一生产链
 * （sendAction hidden advance）。pending 未决时被发送门禁拦截——
 * 主持永远不代替玩家消费未结算的检定。
 */
export async function advanceRoleplayHostStep(store) {
  const state = ensureRoleplaySessionState(store)
  if (state.scenarioRun?.status === 'ended') {
    throw roleplayError('ROLEPLAY_SCENARIO_ENDED', '本场冒险已结局')
  }
  if (store.isLoading) {
    throw roleplayError('ROLEPLAY_BUSY', '上一轮回应还在生成中')
  }
  // 预检发送门禁：pending 未决等情形直接拒绝，不预扣预算。
  assertRoleplaySendAllowed(store, {})
  if (!state.hostPlan) state.hostPlan = createHostPlan()
  const stepId = `host_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  beginHostStep(state.hostPlan, { stepId })
  persistRoleplayState(store)
  try {
    const outcome = await store.sendAction('推进一拍', {
      hidden: true,
      source: 'roleplay-host',
      intent: 'advance'
    })
    return { ok: outcome === 'success', used: state.hostPlan.stepsUsed, max: state.hostPlan.maxSteps }
  } finally {
    completeHostStep(state.hostPlan, { stepId })
    persistRoleplayState(store)
  }
}

export function pauseRoleplayHost(store) {
  const state = ensureRoleplaySessionState(store)
  if (!state.hostPlan) state.hostPlan = createHostPlan()
  pauseHostPlan(state.hostPlan)
  persistRoleplayState(store)
  return state.hostPlan
}

export function resumeRoleplayHost(store) {
  const state = ensureRoleplaySessionState(store)
  if (!state.hostPlan) state.hostPlan = createHostPlan()
  resumeHostPlan(state.hostPlan)
  persistRoleplayState(store)
  return state.hostPlan
}

// ── 场次记录与手动导出（CX39/CX42） ──

/**
 * 手动导出冒险记录：public=玩家可见层；author=追加来源与回执引用。
 * 白名单构造（不含任何设置/密钥）；来源链精确到会话/分支/回合。
 */
export function exportRoleplayAdventure(store, { mode = 'public' } = {}) {
  const state = store.roleplaySession
  if (!state?.scenarioRun || !state.scenario) {
    throw roleplayError('ROLEPLAY_SCENARIO_MISSING', '没有可导出的冒险记录')
  }
  const branchId = currentBranchId(store)
  return exportAdventureRecord({
    run: state.scenarioRun,
    scenario: state.scenario,
    receipts: (state.receipts || []).filter((receipt) => receipt.scope?.branchId === branchId),
    mode,
    sourceRef: buildRecordSourceRef({ sessionId: store.currentSessionId, branchId })
  })
}

// ── 单一 AI 同伴（CX31–CX34 最小纵切） ──

export function setRoleplayCompanionEnabled(store, { enabled }) {
  const state = ensureRoleplaySessionState(store)
  if (enabled) {
    if (!state.companion) state.companion = createCompanion()
    state.companion.enabled = true
  } else if (state.companion) {
    state.companion.enabled = false
    state.companion.lastProposal = null
  }
  persistRoleplayState(store)
  return state.companion
}

/**
 * 同伴提案（CX33）：确定性白名单调度，每轮至多一个；不执行任何动作，
 * 只返回建议。依赖注入的 knowledgeProvider 未接时如实缩小到公开投影。
 */
export function getRoleplayCompanionProposal(store) {
  const state = store.roleplaySession
  if (!state?.companion?.enabled || state.scenarioRun?.status !== 'active') return null
  const view = getRoleplayScenarioView(store)
  const proposal = createCompanionProposal(view)
  if (!proposal) return null
  // CX36：白名单硬校验——不在当前投影合法集合内的提案直接丢弃。
  if (!validateProposalAgainstProjection(proposal, view)) return null
  return proposal
}

/**
 * 采纳提案（CX34）：玩家显式动作——移动直接执行；检定提案返回
 * { requiresConfirm: true, clueId } 交回既有确认面板，不跳过确认。
 */
export function adoptRoleplayCompanionProposal(store, { proposal } = {}) {
  const view = getRoleplayScenarioView(store)
  if (!validateProposalAgainstProjection(proposal, view)) {
    throw roleplayError('ROLEPLAY_COMPANION_PROPOSAL_INVALID', '提案不在当前可行动集合内，已拒绝')
  }
  if (proposal.kind === 'move') {
    moveRoleplayScene(store, { toSceneId: proposal.toSceneId })
    return { ok: true, executed: 'move' }
  }
  return { ok: true, requiresConfirm: true, clueId: proposal.clueId }
}

/**
 * 同伴知识上下文（CX32 深度路径）：公开投影 + A 账本会话域已确认事实。
 * 账本不可用/读取失败 → 如实降级为公开投影（knowledgeScope 标注），
 * 绝不回退全库；事实字段白名单收口。
 */
export async function getRoleplayCompanionKnowledge(store) {
  const state = store.roleplaySession
  if (!state?.companion?.enabled || state.scenarioRun?.status !== 'active') return null
  const view = getRoleplayScenarioView(store)
  if (!view) return null
  return buildCompanionKnowledgeContext({
    projection: view
  })
}
