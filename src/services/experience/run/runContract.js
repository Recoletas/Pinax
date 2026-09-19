/**
 * 最小持久 run 合同（G2a，nightly-20260918-runtime-maturity）。
 *
 * 复用来源（硬规则：先复用后自研）：
 * - StoryForge src/lib/agent/run/hash.ts @ 1935dab（MIT）：canonicalize
 *   （去 undefined、键排序）与 canonicalStringify 原样移植；上游经 WebCrypto
 *   异步摘要是 Dexie 事务约束所致，本项目已有同步纯 JS sha256
 *   （contentHash.sha256HexOfText，同为 SHA-256），故本合同 API 为同步。
 * - StoryForge src/lib/agent/run/checkpoint.ts recoveryPlan() 的步骤分类
 *   （succeeded / 有候选 / confirmed-adopt / committed-adopt）移植为
 *   buildRunRecoveryPlanV1；上游按事件溯源投影计算，本合同直接作用于
 *   持久化的 StepReceipt 数组（上游事件库依赖 Dexie schema/类型闭包过大，
 *   不整库导入，见 docs/agent-runs/nightly-20260918/c-line.md 复用回执）。
 * - 状态命名对齐计划冻结接口：候选、确认、采用分开，不是单一 completed 布尔。
 *
 * 边界：本模块是纯合同（无 IO、无 store）；持久化位置与恢复调度由消费方
 * （G2b roleplay 会话状态 / 后续 T 线 run store）实现。run 级 unknown 表示
 * 存在未确定 provider 结果的步骤——恢复时如实展示，绝不自动重发。
 */

import { sha256HexOfText } from '../../contentHash.js'

export const RUN_CONTRACT_VERSION = 1

export const RUN_STATUSES = Object.freeze([
  'running',
  'awaiting-human',
  'interrupted',
  'unknown',
  'completed',
  'failed',
  'cancelled'
])

export const RUN_STEP_STATUSES = Object.freeze(['pending', 'succeeded', 'failed', 'unknown'])

// 终态 run 可按 LRU 裁剪；非终态（running/awaiting-human/interrupted/unknown）
// 绝不静默丢弃（对齐 roleplayState 的“创建时背压，不裁剪在途数据”合同）。
export const RUN_TERMINAL_STATUSES = Object.freeze(['completed', 'failed', 'cancelled'])

function runError(code, message) {
  return Object.assign(new Error(message), { code })
}

// ── 规范化哈希（StoryForge hash.ts 移植，同步化） ──

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    )
  }
  return value
}

/** 键排序、去 undefined 的稳定序列化；对象键序/无关字段差异不改变哈希。 */
export function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value))
}

export function hashCanonicalValue(value) {
  return sha256HexOfText(canonicalStringify(value))
}

// ── RunIdentity（计划冻结接口 1） ──

export function createRunIdentity({ taskId, scope, contractVersion = RUN_CONTRACT_VERSION, resourceRevision = null } = {}) {
  const id = String(taskId || '').trim()
  if (!id) throw runError('RUN_TASK_ID_INVALID', 'run 缺少任务身份')
  const normalizedScope = normalizeRunScope(scope)
  if (!normalizedScope) throw runError('RUN_SCOPE_INVALID', 'run 缺少合法 scope（sessionId/branchId 必填）')
  return {
    runId: `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    taskId: id.slice(0, 120),
    scope: normalizedScope,
    contractVersion: Number(contractVersion) || RUN_CONTRACT_VERSION,
    resourceRevision: resourceRevision == null ? null : String(resourceRevision).slice(0, 120)
  }
}

export function normalizeRunScope(scope) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return null
  const sessionId = String(scope.sessionId || '').trim()
  if (!sessionId) return null
  return {
    bookId: scope.bookId ? String(scope.bookId).slice(0, 120) : null,
    sessionId: sessionId.slice(0, 120),
    branchId: String(scope.branchId || 'main').slice(0, 120) || 'main'
  }
}

/** scope 一致性断言：跨书/跨会话/跨分支的迟到写入在这里拒绝（必须失败反例）。 */
export function assertRunScope(identity, scope) {
  const target = normalizeRunScope(scope)
  const origin = identity && normalizeRunScope(identity.scope)
  if (!origin || !target) throw runError('RUN_SCOPE_INVALID', 'run scope 不合法')
  if (origin.bookId !== target.bookId || origin.sessionId !== target.sessionId || origin.branchId !== target.branchId) {
    throw runError('RUN_SCOPE_MISMATCH', 'run 属于其它书/会话/分支，已拒绝写入')
  }
  return true
}

// ── StepReceipt（计划冻结接口 3） ──

function normalizeStepReceipt(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const stepId = String(raw.stepId || '').trim()
  if (!stepId) return null
  const status = RUN_STEP_STATUSES.includes(raw.status) ? raw.status : 'pending'
  return {
    stepId: stepId.slice(0, 120),
    attempt: Math.max(1, Math.min(999, Number(raw.attempt) || 1)),
    inputHash: raw.inputHash ? String(raw.inputHash).slice(0, 64) : null,
    status,
    resultRef: raw.resultRef ? String(raw.resultRef).slice(0, 200) : null,
    resultHash: raw.resultHash ? String(raw.resultHash).slice(0, 64) : null,
    budgetCost: Number.isFinite(Number(raw.budgetCost)) ? Math.max(0, Number(raw.budgetCost)) : 0,
    errorCode: raw.errorCode ? String(raw.errorCode).slice(0, 80) : null,
    // 副作用步骤专用：幂等键与提交回执；纯读步骤为 null。
    effectKey: raw.effectKey ? String(raw.effectKey).slice(0, 160) : null,
    commitReceipt: (raw.commitReceipt && typeof raw.commitReceipt === 'object' && !Array.isArray(raw.commitReceipt))
      ? raw.commitReceipt
      : null,
    startedAt: Number(raw.startedAt) || null,
    settledAt: Number(raw.settledAt) || null
  }
}

// ── RunRecord（计划冻结接口 2 的载体） ──

export function createRunRecord({ identity, budget = null, now = Date.now() } = {}) {
  return {
    version: RUN_CONTRACT_VERSION,
    ...identity,
    status: 'running',
    steps: [],
    budget: normalizeRunBudget(budget),
    lastErrorCode: null,
    createdAt: now,
    updatedAt: now
  }
}

function normalizeRunBudget(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return {
    maxAiActions: Math.max(0, Math.min(99, Number(raw.maxAiActions) || 0)) || null,
    usedAiActions: Math.max(0, Math.min(999, Number(raw.usedAiActions) || 0))
  }
}

/** 非终态 run 的持久化往返；未知版本返回 null（调用方按 future-raw 保留）。 */
export function parseRunRecordV1(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (Number(raw.version) !== RUN_CONTRACT_VERSION) return null
  const taskId = String(raw.taskId || '').trim()
  const scope = normalizeRunScope(raw.scope)
  if (!taskId || !scope) return null
  const steps = Array.isArray(raw.steps)
    ? raw.steps.map(normalizeStepReceipt).filter(Boolean)
    : []
  return {
    version: RUN_CONTRACT_VERSION,
    runId: String(raw.runId || '').trim() || `run_recovered_${Date.now().toString(36)}`,
    taskId: taskId.slice(0, 120),
    scope,
    contractVersion: Number(raw.contractVersion) || RUN_CONTRACT_VERSION,
    resourceRevision: raw.resourceRevision == null ? null : String(raw.resourceRevision).slice(0, 120),
    status: RUN_STATUSES.includes(raw.status) ? raw.status : 'interrupted',
    steps,
    budget: normalizeRunBudget(raw.budget),
    lastErrorCode: raw.lastErrorCode ? String(raw.lastErrorCode).slice(0, 80) : null,
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now()
  }
}

export function findRunStep(record, stepId) {
  return record?.steps?.find((step) => step.stepId === String(stepId || '')) || null
}

/**
 * 开始一步（幂等）：同 stepId + 同 inputHash → 复用既有 receipt（不 attempt++）；
 * 上次 failed 的步骤重新 begin → attempt+1 并回到 pending（重试计数诚实递增）；
 * 同 stepId 异 input → 幂等键冲突拒绝；终态 run 拒绝开新步。
 */
export function beginRunStep(record, { stepId, input = null, now = Date.now() } = {}) {
  if (RUN_TERMINAL_STATUSES.includes(record.status)) {
    throw runError('RUN_TERMINAL', `run 已终态（${record.status}），不能再开始步骤`)
  }
  const id = String(stepId || '').trim()
  if (!id) throw runError('RUN_STEP_ID_INVALID', '步骤缺少身份')
  const existing = findRunStep(record, id)
  const inputHash = hashCanonicalValue(input ?? null)
  if (existing && existing.inputHash && existing.inputHash !== inputHash) {
    throw runError('RUN_STEP_INPUT_CONFLICT', '同一步骤身份出现不同输入参数，已拒绝（幂等键冲突）')
  }
  if (existing) {
    if (existing.status === 'failed') {
      existing.attempt = Math.min(999, existing.attempt + 1)
      existing.status = 'pending'
      existing.settledAt = null
      record.updatedAt = now
      return { receipt: existing, reused: false, retried: true }
    }
    return { receipt: existing, reused: true }
  }
  const receipt = normalizeStepReceipt({
    stepId: id,
    attempt: 1,
    inputHash,
    status: 'pending',
    startedAt: now
  })
  record.steps.push(receipt)
  if (record.status === 'awaiting-human') setRunStatus(record, 'running', { now })
  record.updatedAt = now
  return { receipt, reused: false }
}

/**
 * 结束一步：写 resultHash（succeeded 必填）、effectKey/commitReceipt（副作用）。
 * status='unknown' 表示 provider 结果未确定——恢复方必须如实展示，不自动重发。
 * 同一 effectKey 只允许一个 succeeded 副作用步骤：重复结算在这里被拒。
 */
export function completeRunStep(record, {
  stepId,
  status,
  result = undefined,
  resultRef = null,
  effectKey = null,
  commitReceipt = null,
  budgetCost = 0,
  errorCode = null,
  now = Date.now()
} = {}) {
  const receipt = findRunStep(record, stepId)
  if (!receipt) throw runError('RUN_STEP_MISSING', `步骤 ${stepId} 未开始`)
  if (!RUN_STEP_STATUSES.includes(status) || status === 'pending') {
    throw runError('RUN_STEP_STATUS_INVALID', '步骤结算状态只能是 succeeded/failed/unknown')
  }
  if (receipt.status === 'succeeded') {
    // 已成功步骤重复结算：同结果幂等复用（不重做副作用），异结果拒绝。
    const nextHash = result === undefined ? receipt.resultHash : hashCanonicalValue(result ?? null)
    if (nextHash && nextHash === receipt.resultHash) return { receipt, reused: true }
    throw runError('RUN_STEP_RESULT_CONFLICT', '已成功步骤出现不同结算结果，已拒绝')
  }
  if (status === 'succeeded' && effectKey) {
    const dup = record.steps.find((step) => (
      step !== receipt && step.effectKey === String(effectKey) && step.status === 'succeeded'
    ))
    if (dup) throw runError('RUN_EFFECT_DUPLICATE', `副作用 ${effectKey} 已由步骤 ${dup.stepId} 提交`)
  }
  // 先校验后变更：校验失败不留半更新回执。
  let nextResultHash = receipt.resultHash
  if (status === 'succeeded') {
    nextResultHash = result === undefined ? receipt.resultHash : hashCanonicalValue(result ?? null)
    if (!nextResultHash) throw runError('RUN_STEP_RESULT_HASH_MISSING', '成功步骤必须有结果哈希')
  }
  receipt.status = status
  if (status === 'succeeded') {
    receipt.resultHash = nextResultHash
    receipt.resultRef = resultRef ? String(resultRef).slice(0, 200) : receipt.resultRef
    receipt.effectKey = effectKey ? String(effectKey).slice(0, 160) : receipt.effectKey
    receipt.commitReceipt = commitReceipt || receipt.commitReceipt
  }
  receipt.budgetCost = Math.max(0, Number(budgetCost) || 0) || receipt.budgetCost
  receipt.errorCode = status === 'failed' ? String(errorCode || 'RUN_STEP_FAILED').slice(0, 80) : receipt.errorCode
  receipt.settledAt = now
  record.updatedAt = now
  return { receipt, reused: false }
}

const RUN_TRANSITIONS = Object.freeze({
  'running': Object.freeze(['awaiting-human', 'interrupted', 'unknown', 'completed', 'failed', 'cancelled']),
  // 等待真人期间客观状态可能变化（场景结局、玩家放弃、载入扫描）——
  // 非终态等待可以合法到达任何终态或回到运行/中断。
  'awaiting-human': Object.freeze(['running', 'interrupted', 'unknown', 'completed', 'failed', 'cancelled']),
  'interrupted': Object.freeze(['running', 'cancelled']),
  'unknown': Object.freeze(['completed', 'failed', 'cancelled']),
  'completed': Object.freeze([]),
  'failed': Object.freeze([]),
  'cancelled': Object.freeze([])
})

export function setRunStatus(record, status, { errorCode = null, now = Date.now() } = {}) {
  if (!RUN_STATUSES.includes(status)) throw runError('RUN_STATUS_INVALID', `未知 run 状态 ${status}`)
  if (record.status === status) return record
  if (!RUN_TRANSITIONS[record.status].includes(status)) {
    throw runError('RUN_TRANSITION_INVALID', `run 不能从 ${record.status} 转到 ${status}`)
  }
  record.status = status
  record.lastErrorCode = errorCode ? String(errorCode).slice(0, 80) : record.lastErrorCode
  record.updatedAt = now
  return record
}

// ── 恢复计划（StoryForge checkpoint.recoveryPlan 分类移植） ──

/**
 * 恢复计划：完成/未确定/已确认/已采用各归各类，恢复动作可核查。
 * - completedStepIds：succeeded 且有 resultHash（恢复不重做）。
 * - unknownStepIds：provider 结果未确定（展示 unknown，不自动重发）。
 * - resumableStepIds：pending/failed 且 run 可继续（恢复调度从这里取）。
 * - confirmedAdoptionStepIds / committedAdoptionStepIds：确认与采用分开
 *   （commitReceipt.committedAt 存在 = 采用已提交）。
 */
export function buildRunRecoveryPlanV1(record) {
  const steps = record?.steps || []
  const byStatus = (status) => steps.filter((step) => step.status === status).map((step) => step.stepId)
  return {
    version: RUN_CONTRACT_VERSION,
    runId: record.runId,
    taskId: record.taskId,
    scope: record.scope,
    status: record.status,
    completedStepIds: byStatus('succeeded'),
    unknownStepIds: byStatus('unknown'),
    failedStepIds: byStatus('failed'),
    pendingStepIds: byStatus('pending'),
    confirmedAdoptionStepIds: steps
      .filter((step) => step.status === 'succeeded' && step.commitReceipt && !step.commitReceipt.committedAt)
      .map((step) => step.stepId),
    committedAdoptionStepIds: steps
      .filter((step) => step.status === 'succeeded' && step.commitReceipt?.committedAt)
      .map((step) => step.stepId),
    resumableStepIds: RUN_TERMINAL_STATUSES.includes(record.status)
      ? []
      : steps.filter((step) => ['pending', 'failed'].includes(step.status)).map((step) => step.stepId),
    budget: record.budget ? { ...record.budget } : null,
    lastErrorCode: record.lastErrorCode,
    updatedAt: record.updatedAt
  }
}

/** run 状态的对外投影（UI/诊断只读这个形态，不暴露内部 receipt 全文）。 */
export function buildRunSummaryV1(record) {
  if (!record) return null
  const plan = buildRunRecoveryPlanV1(record)
  return {
    runId: record.runId,
    taskId: record.taskId,
    status: record.status,
    resourceRevision: record.resourceRevision,
    completedCount: plan.completedStepIds.length,
    unknownCount: plan.unknownStepIds.length,
    failedCount: plan.failedStepIds.length,
    resumable: plan.resumableStepIds.length > 0,
    budget: plan.budget,
    lastErrorCode: record.lastErrorCode,
    updatedAt: record.updatedAt
  }
}

// ── T04：provider 错误分类（贯穿 run 步骤结算） ──

const PROVIDER_RETRYABLE_CODES = Object.freeze([
  'NARRATIVE_PROVIDER_RATE_LIMITED',
  'NARRATIVE_PROVIDER_TIMEOUT',
  'NARRATIVE_AGENT_ABORTED'
])

/**
 * provider/run 错误 → 步骤结算分类：
 * - retryable（429/超时/显式中止）→ 步骤 failed（可显式重试，恢复计划计入 resumable）；
 * - uncertainWrite（副作用结果未确定）→ 步骤 unknown（恢复方如实展示，不自动重发）；
 * - 其余 → failed（非重试类）。
 * 纯读生成永远不产生 unknown（重发安全）；unknown 只给不确定写。
 */
export function classifyRunStepFailure({ errorCode, effectKey = null } = {}) {
  const code = String(errorCode || 'RUN_STEP_FAILED')
  if (effectKey && String(errorCode || '').startsWith('PROVIDER_WRITE_')) {
    return { status: 'unknown', retryable: false, code }
  }
  const retryable = PROVIDER_RETRYABLE_CODES.includes(code) || String(code).includes('RATE_LIMITED') || String(code).includes('TIMEOUT')
  return { status: 'failed', retryable, code }
}
