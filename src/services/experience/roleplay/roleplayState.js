/**
 * 会话级 roleplay 状态（session.roleplay 字段）的归一化与容量合同。
 *
 * 该字段是唯一新增的会话持久化命名空间：旧会话没有它 → null → 自由叙事，
 * 不迁移、不改写任何既有字段。pending 检定不进 narrativeTurnContract 的
 * turnRecords（那边 committed-only 裁剪会丢掉它），而以 pendingByBranch
 * 挂在本命名空间，随会话同一次 durable 写入落盘。
 *
 * 容量与背压合同（CX02/CX04，续跑任务书）：
 * - pendingByBranch / archiveOutbox 归一化**绝不静默裁剪**。容量在“创建时”
 *   由 workflow 施加可见背压（拒绝并给出真实原因），不在保存/加载时丢数据。
 * - archiveOutbox 是未确认交付的持久消息，不是展示缓存：成功归档并 durable
 *   确认前不移除；队列满 → 新确认被阻断（背压），已提交故事与已存队列保留。
 * - receipts 是热窗口（LRU ≤200）；归档完整载荷自包含在 outbox 条目里，
 *   不依赖热窗口存活（CX03）。
 *
 * 未来 schema（CX05）：version 未知时归一化返回 null，但 loadRoleplayStateForSession
 * 会把原始扩展保存为 futureRaw，写回路径原样保留；绝不能 normalize 成 null 后
 * 覆盖保存（有损）。
 */

import { normalizeRoleplayAction } from './roleplayActionContract.js'
import { normalizeScenario, normalizeScenarioRun } from './roleplayScenario.js'
import { normalizeResourceState } from './roleplayResources.js'
import { normalizeHostPlan } from './roleplayHost.js'
import { normalizeCompanion } from './roleplayCompanion.js'
import { normalizeActor } from './roleplayActor.js'
import { markRoleplayRunsInterruptedOnLoad, normalizeRoleplayRunRecords } from './roleplayRuns.js'

export const ROLEPLAY_SESSION_STATE_VERSION = 1
export const ROLEPLAY_PENDING_CAPACITY = 6
export const ROLEPLAY_RECEIPT_LIMIT = 200
// outbox 允许设上限，但达限行为是创建时可见背压（workflow 阻断新确认），
// 绝不 slice 丢最旧未归档回执（CX02）。
export const ROLEPLAY_OUTBOX_CAPACITY = 1000

export function createEmptyRoleplaySessionState() {
  return {
    version: ROLEPLAY_SESSION_STATE_VERSION,
    mode: null,            // null=未选择（旧会话语义） | 'free' | 'rules'
    goal: '',
    actorRef: null,        // { kind:'unspecified'|'character', name, entryId? }
    modeDecidedAt: null,   // 用户显式确认过模式的时间（区分"未选"与" dismissed"）
    pendingByBranch: {},   // branchId → RoleplayActionV1 (confirmed/resolved)
    receipts: [],          // TurnReceiptV1（已提交回合）热窗口，LRU by committedAt
    archiveOutbox: [],     // 待归档 A 账本的 outbox：自包含载荷，成功确认前不移除
    scenario: null,        // CX13：冻结的运行源（normalized ScenarioV1）
    scenarioRun: null,     // CX13：运行实例（active/paused/ended）
    resources: null,       // CX21：确定性资源账（null=尚未初始化）
    hostPlan: null,        // CX25：有界主持计划（null=未启用）
    companion: null,       // CX31：单一 AI 同伴（null=未启用）
    actor: null,           // CX19：玩家行动者身份与属性 override
    runs: []               // G2b：持久 run 账目（StepReceipt 步骤/副作用回执）
  }
}

/**
 * 载入路径的统一入口：当前版本 → normalized；未知/未来版本 → { current:null,
 * futureRaw } 原样保留。载入时刻不可能有 in-flight 生成——非终态 running
 * run 在这里扫描为 interrupted（G2b 恢复语义），保存路径不做该扫描。
 */
export function loadRoleplayStateForSession(raw) {
  const normalized = normalizeRoleplaySessionState(raw)
  if (normalized || raw == null) {
    if (normalized) markRoleplayRunsInterruptedOnLoad(normalized)
    return { current: normalized, futureRaw: null }
  }
  return { current: null, futureRaw: raw }
}

/**
 * 写回路径的统一决策（gameSessionScheduler 消费）：当前版本数据归一化落盘；
 * 未知/未来版本 futureRaw 原样透传（调用方 clone，不 normalize）；两者皆无 → null。
 * 保证“可读旧故事 + 新扩展不丢”（CX05/XC-G04），绝不能 normalize 成 null 后覆盖。
 */
export function resolveRoleplayPersistence(roleplaySession, roleplayFutureRaw) {
  if (roleplaySession) return { kind: 'v1', value: normalizeRoleplaySessionState(roleplaySession) }
  if (roleplayFutureRaw) return { kind: 'future-raw', value: roleplayFutureRaw }
  return { kind: 'empty', value: null }
}

export function normalizeRoleplaySessionState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (Number(raw.version) !== ROLEPLAY_SESSION_STATE_VERSION) return null
  const state = createEmptyRoleplaySessionState()
  state.mode = raw.mode === 'free' || raw.mode === 'rules' ? raw.mode : null
  state.goal = String(raw.goal || '').slice(0, 200)
  if (raw.actorRef && typeof raw.actorRef === 'object' && !Array.isArray(raw.actorRef)) {
    const kind = raw.actorRef.kind === 'character' ? 'character' : 'unspecified'
    const name = String(raw.actorRef.name || '').slice(0, 80)
    state.actorRef = {
      kind,
      name,
      entryId: raw.actorRef.entryId ? String(raw.actorRef.entryId).slice(0, 120) : null
    }
  }
  state.modeDecidedAt = Number(raw.modeDecidedAt) || null

  // pendingByBranch：只按分支唯一性去重、只保留可推进状态；**不按容量裁剪**。
  // 容量背压发生在创建（confirmRoleplayAction），历史数据有多少恢复多少。
  if (raw.pendingByBranch && typeof raw.pendingByBranch === 'object' && !Array.isArray(raw.pendingByBranch)) {
    const entries = Object.entries(raw.pendingByBranch)
      .map(([branchId, action]) => {
        const id = String(branchId || '').trim()
        const normalizedAction = normalizeRoleplayAction(action)
        if (!id || !normalizedAction) return null
        if (normalizedAction.status !== 'confirmed' && normalizedAction.status !== 'resolved') return null
        return [id, normalizedAction]
      })
      .filter(Boolean)
    state.pendingByBranch = Object.fromEntries(entries)
  }

  // receipts 热窗口：这是展示/回溯窗口，允许 LRU；归档真源在 outbox 自包含载荷。
  if (Array.isArray(raw.receipts)) {
    state.receipts = raw.receipts
      .filter((receipt) => receipt && typeof receipt === 'object' && String(receipt.receiptId || '').trim())
      .sort((a, b) => (Number(b.committedAt) || 0) - (Number(a.committedAt) || 0))
      .slice(0, ROLEPLAY_RECEIPT_LIMIT)
  }

  // archiveOutbox：未确认交付消息，全量保留，绝不静默裁剪（CX02/XC-G01）。
  if (Array.isArray(raw.archiveOutbox)) {
    state.archiveOutbox = raw.archiveOutbox
      .filter((entry) => entry && typeof entry === 'object' && String(entry.actionId || '').trim())
      .map((entry) => normalizeOutboxEntry(entry))
  }

  // CX13：冻结的运行源与运行实例。二者必须成对；revision 不一致以运行时
  // 冻结体为准（运行实例不随外部定义变更，XC-G33）。
  state.scenario = normalizeScenario(raw.scenario)
  state.scenarioRun = state.scenario ? normalizeScenarioRun(raw.scenarioRun) : null

  // CX21：资源账（delta 流 + 物品 + 幂等键），无损往返。
  state.resources = normalizeResourceState(raw.resources)

  // CX25：有界主持计划（预算/暂停态无损恢复）。
  state.hostPlan = normalizeHostPlan(raw.hostPlan)

  // CX31：单一 AI 同伴（可停用）。
  state.companion = normalizeCompanion(raw.companion)

  // CX19：玩家行动者身份（actorRef 稳定）与属性 override。
  state.actor = normalizeActor(raw.actor)

  // G2b：持久 run 账目（未知版本记录被丢弃并按 future-raw 语义保护会话级
  // 命名空间；run 级未知版本条目直接不收，非终态记录绝不静默裁剪）。
  state.runs = normalizeRoleplayRunRecords(raw.runs)

  return state
}

function normalizeOutboxEntry(entry) {
  return {
    actionId: String(entry.actionId),
    receiptId: String(entry.receiptId || ''),
    turnId: entry.turnId ? String(entry.turnId) : null,
    attempts: Math.max(0, Math.min(9999, Number(entry.attempts) || 0)),
    lastError: String(entry.lastError || '').slice(0, 200),
    queuedAt: Number(entry.queuedAt) || Date.now(),
    // CX03：自包含不可变载荷；旧格式（首批）没有 payload 字段，保留为 null
    // 由 drain 侧判定 legacy（无载荷不丢弃，如实标记重试受限）。
    payload: (entry.payload && typeof entry.payload === 'object' && !Array.isArray(entry.payload))
      ? entry.payload
      : null
  }
}

/** 是否存在可继续推进（confirmed/resolved）的分支 pending。 */
export function getRoleplayPendingForBranch(state, branchId) {
  if (!state || !state.pendingByBranch) return null
  return state.pendingByBranch[String(branchId || 'main')] || null
}

/** pending 容量判定：返回可否再登记一个新分支的 pending 与真实原因。 */
export function checkRoleplayPendingCapacity(state, branchId) {
  if (!state) return { ok: true }
  if (state.pendingByBranch[String(branchId || 'main')]) return { ok: true, existing: true }
  if (Object.keys(state.pendingByBranch).length >= ROLEPLAY_PENDING_CAPACITY) {
    return { ok: false, reason: 'ROLEPLAY_PENDING_CAPACITY' }
  }
  return { ok: true }
}

/** outbox 容量判定：满则拒绝入队（背压），绝不挤掉已排队项。 */
export function checkRoleplayOutboxCapacity(state) {
  if (!state) return { ok: true }
  if ((state.archiveOutbox?.length || 0) >= ROLEPLAY_OUTBOX_CAPACITY) {
    return { ok: false, reason: 'ROLEPLAY_OUTBOX_CAPACITY' }
  }
  return { ok: true }
}

/** 只暴露展示所需字段，组件与 payload 都不拿完整 envelope。 */
export function buildRoleplayBusySummary(state, branchId) {
  const pending = getRoleplayPendingForBranch(state, branchId)
  if (!pending) return null
  return {
    actionId: pending.actionId,
    status: pending.status,
    rawInput: pending.rawInput,
    retryCount: pending.retryCount,
    lastErrorCode: pending.lastErrorCode,
    resolution: pending.resolution
      ? { dice: pending.resolution.dice, modifier: pending.resolution.modifier, total: pending.resolution.total, outcome: pending.resolution.outcome }
      : null
  }
}
