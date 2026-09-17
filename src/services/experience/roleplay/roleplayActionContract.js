/**
 * RoleplayActionV1 行动合同：envelope 构造、校验、归一化与状态迁移。
 *
 * 状态机（一次性结算，不允许跳步）：
 *   draft → confirmed → resolved → committed
 *                                    ↘ cancelled（诊断保留，不产生正式回合）
 * - draft：未确认，不投骰、不耗模型。
 * - confirmed：确认冻结（规则快照 + 行动文本），先 durable 保存。
 * - resolved：骰点已生成且 durable 提交；等待主持叙述。刷新恢复以此状态为准。
 * - committed：回合已由 experienceTurnCoordinator 提交，receipt 落账。
 * - cancelled：用户放弃。保留为失败诊断，不算正式回合、不产生"成功经历"。
 *
 * 幂等：actionId 是一次动作的唯一身份。同 ID 同 payload 可恢复/重发；
 * 同 ID 异 payload 必须拒绝（不允许用重试次数换新 ID）。
 */

import { ROLEPLAY_RULE_2D6, isValidAttributeKey } from './roleplayRules.js'

export const ROLEPLAY_ACTION_SCHEMA_VERSION = 1
export const ROLEPLAY_ACTION_STATUSES = Object.freeze([
  'draft', 'confirmed', 'resolved', 'committed', 'cancelled'
])
// 可以请求叙述的状态：只有 resolved（committed/cancelled 不再叙述）。
export const ROLEPLAY_NARRATABLE_STATUSES = Object.freeze(['resolved'])

const RAW_INPUT_MAX_CHARS = 4000
const INTENT_HINT_MAX_CHARS = 200

function roleplayError(code, message) {
  return Object.assign(new Error(message), { code })
}

export function createRoleplayActionId(now = Date.now()) {
  return `act_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 构造确认态 envelope。所有外部输入在这里收口：
 * 非法 actor/修正/超长文本直接拒绝，绝不静默修正。
 */
export function createConfirmedRoleplayAction({
  actionId = createRoleplayActionId(),
  sessionId,
  branchId,
  worldbookId,
  rawInput,
  attribute,
  modifier = 0,
  modifierSource = 'manual',
  intentHint = '',
  now = Date.now()
} = {}) {
  const trimmedInput = String(rawInput ?? '').trim()
  if (!trimmedInput) throw roleplayError('ROLEPLAY_INPUT_EMPTY', '行动内容不能为空')
  if (trimmedInput.length > RAW_INPUT_MAX_CHARS) {
    throw roleplayError('ROLEPLAY_INPUT_TOO_LONG', `行动内容不能超过 ${RAW_INPUT_MAX_CHARS} 字`)
  }
  if (!sessionId || typeof sessionId !== 'string') {
    throw roleplayError('ROLEPLAY_SESSION_MISSING', '缺少会话身份，不能确认检定')
  }
  const resolvedBranchId = String(branchId || 'main')
  if (!isValidAttributeKey(attribute)) {
    throw roleplayError('ROLEPLAY_ATTRIBUTE_INVALID', '检定属性无效')
  }
  const numericModifier = Number(modifier)
  if (!Number.isSafeInteger(numericModifier)
    || numericModifier < ROLEPLAY_RULE_2D6.modifierRange.min
    || numericModifier > ROLEPLAY_RULE_2D6.modifierRange.max) {
    throw roleplayError(
      'ROLEPLAY_MODIFIER_INVALID',
      `修正值必须是 ${ROLEPLAY_RULE_2D6.modifierRange.min}～${ROLEPLAY_RULE_2D6.modifierRange.max} 的整数`
    )
  }
  const trimmedHint = String(intentHint ?? '').trim().slice(0, INTENT_HINT_MAX_CHARS)
  return {
    schemaVersion: ROLEPLAY_ACTION_SCHEMA_VERSION,
    actionId,
    sessionId,
    branchId: resolvedBranchId,
    worldbookId: worldbookId ? String(worldbookId) : null,
    rawInput: trimmedInput,
    intentHint: trimmedHint,
    mode: 'rules',
    ruleSnapshot: {
      ruleId: ROLEPLAY_RULE_2D6.ruleId,
      version: ROLEPLAY_RULE_2D6.version,
      expression: ROLEPLAY_RULE_2D6.expression,
      attribute,
      modifier: numericModifier,
      modifierSource: modifierSource === 'actor' ? 'actor' : 'manual-adjust',
      thresholds: { ...ROLEPLAY_RULE_2D6.thresholds }
    },
    status: 'confirmed',
    resolution: null,
    narrationTurnId: null,
    retryCount: 0,
    lastErrorCode: null,
    createdAt: now,
    updatedAt: now
  }
}

/** 写入骰点结算（confirmed → resolved）。重复结算同一 action 会被拒绝。 */
export function applyResolution(action, { dice, rngTrace, now = Date.now() }) {
  if (!action || action.status !== 'confirmed') {
    throw roleplayError('ROLEPLAY_RESOLVE_INVALID_STATE', '只有确认态行动可以结算')
  }
  if (!Array.isArray(dice) || dice.length === 0 || !dice.every((value) => Number.isSafeInteger(Number(value)))) {
    throw roleplayError('ROLEPLAY_RESOLVE_DICE_INVALID', '骰点必须是整数数组')
  }
  const modifier = action.ruleSnapshot.modifier
  const total = dice.reduce((sum, value) => sum + Number(value), 0) + modifier
  action.status = 'resolved'
  action.resolution = {
    dice: dice.map(Number),
    modifier,
    total,
    outcome: resolveOutcomeFromThresholds(total, action.ruleSnapshot.thresholds),
    rngTrace: { ...rngTrace },
    resolvedAt: now
  }
  action.updatedAt = now
  return action
}

function resolveOutcomeFromThresholds(total, thresholds) {
  if (total >= thresholds.success) return 'success'
  if (total >= thresholds.partialSuccess) return 'partial'
  return 'failure'
}

/**
 * 归一化持久化数据。旧数据 / 非法字段返回 null（不抛错），
 * 让旧会话默认回到自由叙事，不因坏字段阻塞整个会话加载。
 */
export function normalizeRoleplayAction(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  if (Number(input.schemaVersion) !== ROLEPLAY_ACTION_SCHEMA_VERSION) return null
  if (!ROLEPLAY_ACTION_STATUSES.includes(input.status)) return null
  const actionId = String(input.actionId || '').trim()
  if (!actionId) return null
  const snapshot = input.ruleSnapshot && typeof input.ruleSnapshot === 'object' ? input.ruleSnapshot : null
  if (!snapshot || !isValidAttributeKey(snapshot.attribute)) return null
  const resolution = normalizeResolution(input.resolution, snapshot)
  if ((input.status === 'resolved' || input.status === 'committed') && !resolution) return null
  return {
    schemaVersion: ROLEPLAY_ACTION_SCHEMA_VERSION,
    actionId,
    sessionId: String(input.sessionId || ''),
    branchId: String(input.branchId || 'main'),
    worldbookId: input.worldbookId ? String(input.worldbookId) : null,
    rawInput: String(input.rawInput || '').slice(0, RAW_INPUT_MAX_CHARS),
    intentHint: String(input.intentHint || '').slice(0, INTENT_HINT_MAX_CHARS),
    mode: 'rules',
    ruleSnapshot: {
      ruleId: String(snapshot.ruleId || ROLEPLAY_RULE_2D6.ruleId),
      version: Number(snapshot.version) || ROLEPLAY_RULE_2D6.version,
      expression: String(snapshot.expression || ROLEPLAY_RULE_2D6.expression),
      attribute: snapshot.attribute,
      modifier: Number.isSafeInteger(Number(snapshot.modifier)) ? Number(snapshot.modifier) : 0,
      modifierSource: snapshot.modifierSource === 'actor' ? 'actor' : 'manual-adjust',
      thresholds: {
        success: Number(snapshot.thresholds?.success) || ROLEPLAY_RULE_2D6.thresholds.success,
        partialSuccess: Number(snapshot.thresholds?.partialSuccess) || ROLEPLAY_RULE_2D6.thresholds.partialSuccess
      }
    },
    status: input.status,
    resolution,
    narrationTurnId: input.narrationTurnId ? String(input.narrationTurnId) : null,
    retryCount: Math.max(0, Math.min(99, Number(input.retryCount) || 0)),
    lastErrorCode: input.lastErrorCode ? String(input.lastErrorCode) : null,
    createdAt: Number(input.createdAt) || Date.now(),
    updatedAt: Number(input.updatedAt) || Number(input.createdAt) || Date.now()
  }
}

function normalizeResolution(raw, snapshot) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const dice = Array.isArray(raw.dice) ? raw.dice.map(Number) : []
  if (!dice.length || !dice.every((value) => Number.isSafeInteger(value))) return null
  const modifier = Number.isSafeInteger(Number(raw.modifier)) ? Number(raw.modifier) : Number(snapshot.modifier) || 0
  const total = dice.reduce((sum, value) => sum + value, 0) + modifier
  const rngTrace = raw.rngTrace && typeof raw.rngTrace === 'object' && !Array.isArray(raw.rngTrace)
    ? raw.rngTrace
    : null
  return {
    dice,
    modifier,
    total,
    outcome: resolveOutcomeFromThresholds(total, {
      success: Number(snapshot.thresholds?.success) || ROLEPLAY_RULE_2D6.thresholds.success,
      partialSuccess: Number(snapshot.thresholds?.partialSuccess) || ROLEPLAY_RULE_2D6.thresholds.partialSuccess
    }),
    rngTrace,
    resolvedAt: Number(raw.resolvedAt) || Date.now()
  }
}

/**
 * 幂等比较（按 payload 内容，不按 actionId——双击会各自生成新 id）：
 * 输入 + 规则快照完全一致 → 'identical'（复用既有 actionId，不重复掷骰）；
 * 任一不同 → 'conflict'（当前分支已有进行中的检定，拒绝覆盖）。
 */
export function compareRoleplayActionPayload(existing, incoming) {
  if (!existing || !incoming) return 'conflict'
  const same = existing.rawInput === incoming.rawInput
    && existing.sessionId === incoming.sessionId
    && existing.branchId === incoming.branchId
    && existing.worldbookId === incoming.worldbookId
    && existing.intentHint === incoming.intentHint
    && existing.ruleSnapshot?.attribute === incoming.ruleSnapshot?.attribute
    && existing.ruleSnapshot?.modifier === incoming.ruleSnapshot?.modifier
    && existing.ruleSnapshot?.expression === incoming.ruleSnapshot?.expression
  return same ? 'identical' : 'conflict'
}

/** resolved → committed（由 coordinator 在回合成功提交后调用，幂等）。 */
export function markRoleplayActionCommitted(action, { narrationTurnId, now = Date.now() }) {
  if (!action) return action
  if (action.status === 'committed') return action
  if (action.status !== 'resolved') {
    throw roleplayError('ROLEPLAY_COMMIT_INVALID_STATE', '只有已结算行动可以提交')
  }
  action.status = 'committed'
  action.narrationTurnId = String(narrationTurnId || '') || null
  action.updatedAt = now
  return action
}

/** resolved → cancelled（用户放弃；诊断保留）。 */
export function cancelRoleplayAction(action, { now = Date.now() } = {}) {
  if (!action) return action
  if (action.status === 'committed') {
    throw roleplayError('ROLEPLAY_CANCEL_INVALID_STATE', '已提交回合不能放弃')
  }
  action.status = 'cancelled'
  action.lastErrorCode = 'ROLEPLAY_CANCELLED_BY_USER'
  action.updatedAt = now
  return action
}
