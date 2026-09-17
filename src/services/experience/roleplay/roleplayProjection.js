/**
 * 展示投影与回执构造（R08）：把规则明文、骰点回执、叙事约束分开。
 *
 * - buildCheckRowProjection：挂在消息上的只读检定行数据（轻量行 + 折叠明细），
 *   组件与持久化都不接触完整 envelope/prompt。
 * - buildTurnReceiptV1：跨线合同（O 冻结版 K2）——只有成功 durable 提交后
 *   才构造；receiptId=actionId，重试复用；payloadHash 只覆盖 scope+resolution，
 *   同 ID 异 hash 在账本侧拒绝。
 * - buildResolutionDirective：进入既有 NarrativeKernel 作者注通道的约束文本
 *   （≤400 字块预算），不新增第二条模型链，不改 kernel 合同。
 */

import { sha256HexOfText } from '../../contentHash.js'
import { attributeLabel, describeOutcomeText, describeRuleText } from './roleplayRules.js'
import { compareRoleplayActionPayload } from './roleplayActionContract.js'

const DIRECTIVE_MAX_CHARS = 380

/** K1 ScopeRef：跑团回执 domain='session'，sessionId/branchId 必填，无书显式 null。 */
export function buildScopeRef({ bookId = null, worldbookId = null, sessionId, branchId }) {
  return {
    domain: 'session',
    bookId: bookId || null,
    worldbookId: worldbookId || null,
    sessionId: String(sessionId || ''),
    branchId: String(branchId || 'main')
  }
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

/**
 * TurnReceiptV1（K2 冻结字段）。同 actionId 重放时调用方必须先比对
 * payloadHash：一致 → 复用；不一致 → 拒绝（由 roleplayWorkflow 执行）。
 */
export function buildTurnReceiptV1(action, { turnId, parentTurnId, store }) {
  const scope = buildScopeRef({
    sessionId: store.currentSessionId,
    branchId: store.activeBranchId,
    worldbookId: action.worldbookId || store.worldId || null
  })
  const resolution = action.resolution
  const resolutionRef = resolution ? sha256HexOfText(stableStringify(resolution)) : null
  const payloadHash = sha256HexOfText(stableStringify({
    actionId: action.actionId,
    scope,
    rulesVersion: `${action.ruleSnapshot.ruleId}@${action.ruleSnapshot.version}`,
    resolutionRef
  }))
  return {
    schemaVersion: 1,
    receiptId: action.actionId,
    commandId: action.actionId,
    actionId: action.actionId,
    turnId: String(turnId || ''),
    parentTurnId: parentTurnId ? String(parentTurnId) : null,
    branchId: scope.branchId,
    scope,
    rulesVersion: `${action.ruleSnapshot.ruleId}@${action.ruleSnapshot.version}`,
    resolutionRef,
    stateDeltaRefs: [],
    evidenceRefs: [`session:${scope.sessionId}:turn:${turnId}`],
    committedAt: Date.now(),
    payloadHash
  }
}

/** 幂等审计：同 receiptId 必须同 payloadHash。 */
export function findConflictingReceipt(receipts, incoming) {
  return (receipts || []).find((receipt) => (
    receipt.receiptId === incoming.receiptId && receipt.payloadHash !== incoming.payloadHash
  )) || null
}

/**
 * TurnReceiptV1 → A ledger 的生产序列化形态（CX07，与 factLedger.appendCommittedTurnReceipt
 * 的 payload 字段一一对应；字段即 A 计算 payloadHash 的输入，顺序无关但集合精确）。
 * 本地专属字段（schemaVersion/actionId/scope/payloadHash）不进入序列化结果；
 * scope 由调用方单独传给端口。branchId 不可为 null（A 合同：session 域必填）。
 */
export function serializeRoleplayReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') {
    throw Object.assign(new Error('receipt 无效'), { code: 'ROLEPLAY_RECEIPT_INVALID' })
  }
  const serialized = {
    receiptId: String(receipt.receiptId || '').trim(),
    commandId: String(receipt.commandId || receipt.receiptId || '').trim(),
    turnId: String(receipt.turnId || ''),
    parentTurnId: receipt.parentTurnId ? String(receipt.parentTurnId) : null,
    branchId: receipt.branchId ? String(receipt.branchId) : (receipt.scope?.branchId ? String(receipt.scope.branchId) : null),
    rulesVersion: receipt.rulesVersion != null ? String(receipt.rulesVersion) : null,
    resolutionRef: receipt.resolutionRef != null ? String(receipt.resolutionRef) : null,
    stateDeltaRefs: Array.isArray(receipt.stateDeltaRefs) ? receipt.stateDeltaRefs.map(String) : [],
    evidenceRefs: Array.isArray(receipt.evidenceRefs) ? receipt.evidenceRefs.map(String) : [],
    committedAt: Number(receipt.committedAt)
  }
  if (!serialized.receiptId || !serialized.turnId || !serialized.commandId
    || !Number.isFinite(serialized.committedAt) || !serialized.branchId) {
    throw Object.assign(new Error('receipt 缺少账本必填字段（receiptId/turnId/commandId/committedAt/branchId）'), {
      code: 'ROLEPLAY_RECEIPT_INVALID'
    })
  }
  return serialized
}

/**
 * 消息上的检定行投影（只读、小体积）。挂载位置由 coordinator 决定
 * （发起动作的 user 消息），随消息持久化与分支可见性天然一致。
 */
export function buildCheckRowProjection(action) {
  if (!action || !action.resolution) return null
  const { dice, modifier, total, outcome } = action.resolution
  return {
    version: 1,
    actionId: action.actionId,
    branchId: action.branchId,
    sessionId: action.sessionId,
    ruleId: action.ruleSnapshot.ruleId,
    rulesVersion: action.ruleSnapshot.version,
    expression: action.ruleSnapshot.expression,
    attribute: action.ruleSnapshot.attribute,
    attributeLabel: attributeLabel(action.ruleSnapshot.attribute),
    modifier,
    dice,
    total,
    outcome,
    outcomeLabel: describeOutcomeText(outcome, { dice, modifier }),
    ruleText: describeRuleText({ modifier }),
    rawInputDigest: truncate(action.rawInput, 60),
    status: action.status,
    detail: {
      thresholds: { ...action.ruleSnapshot.thresholds },
      rngTrace: action.resolution.rngTrace
        ? { algorithm: action.resolution.rngTrace.algorithm, consumedSamples: action.resolution.rngTrace.consumedSamples, rejectedSamples: action.resolution.rngTrace.rejectedSamples }
        : null
    }
  }
}

/**
 * 重生成叙述的约束重建：从消息上的检定行投影（而非完整 envelope/回执）
 * 恢复同一份主持约束，保证重试叙述仍尊重原骰点。字段是投影白名单子集。
 */
export function buildDirectiveFromCheckRow(checkRow) {
  if (!checkRow || !Array.isArray(checkRow.dice) || !checkRow.dice.length) return ''
  const dice = checkRow.dice
  const modifier = Number(checkRow.modifier) || 0
  const outcomeText = describeOutcomeText(checkRow.outcome, { dice, modifier })
  const core = [
    `【跑团结算，不得更改】行动「${truncate(checkRow.rawInputDigest || '', 60)}」`,
    `检定：${outcomeText}`,
    `规则：${describeRuleText({ modifier })}`,
    '叙述必须与该结果一致：成功如实达成；部分成功必须体现代价；失败前进不得达成原目标但推动局面。不得改写骰点或结果，不得替玩家决定下一步行动或台词。'
  ].join(' ')
  return truncate(core, DIRECTIVE_MAX_CHARS)
}

/**
 * 主持叙述约束（走既有导演注/authorNote 通道，≤380 字给 400 字块留余量）。
 * 只陈述已冻结的事实与禁令，不指示情节走向——尊重结果的 narrative 仍由模型写。
 */
export function buildResolutionDirective(action) {
  if (!action?.resolution) return ''
  const outcomeText = describeOutcomeText(action.resolution.outcome, {
    dice: action.resolution.dice,
    modifier: action.resolution.modifier
  })
  const ruleText = describeRuleText({ modifier: action.ruleSnapshot.modifier })
  const core = [
    `【跑团结算，不得更改】行动「${truncate(action.rawInput, 60)}」`,
    `检定：${outcomeText}`,
    `规则：${ruleText}`,
    '叙述必须与该结果一致：成功如实达成；部分成功必须体现代价；失败前进不得达成原目标但推动局面。不得改写骰点或结果，不得替玩家决定下一步行动或台词。'
  ].join(' ')
  return truncate(core, DIRECTIVE_MAX_CHARS)
}

function truncate(value, limit) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

export { compareRoleplayActionPayload }
