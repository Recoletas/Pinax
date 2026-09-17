/**
 * A 线（记忆历史）端口与归档 outbox（CX02/CX03/CX07/CX09 续跑修订）。
 *
 * 端口合同（冻结形态，安装函数与真实调用一致）：
 *   createRoleplayHistoryPort({ read, record })
 *     read:  async ({ scope, sessionId, branchId, throughTurnId, viewerRef, limit })
 *              -> { ok, reason?, retryable?, records? }
 *     record: async ({ scope, sessionId, turnId, actionId, receiptRef })
 *              -> { ok, reason?, retryable?, eventId? }
 *   installRoleplayHistoryPort(port) —— port 必须提供上述两个 async 方法；
 *   生产实现在 roleplayLedgerPort.js（接 A 的 factLedger）。
 *
 * outbox 合同（未确认交付的持久消息，不是缓存）：
 * - 条目自包含完整不可变载荷（冻结 receipt + 冻结 scope），热窗口裁剪后
 *   仍能完整归档；不从当前会话重建历史（CX03/XC-G02）。
 * - 成功归档并确认前不移除；容量满在创建侧背压（roleplayState.check...），
 *   归一化/入队绝不 slice 丢最旧（CX02/XC-G01）。
 * - drain 用快照队列逐 ID 移除已确认项：drain 中新增的条目不被旧数组覆盖
 *   （XC-G05）；并发 drain 依赖 ledger 的 receiptId 幂等（XC-G06）。
 * - 同 receiptId 异 payload：拒绝并保留队列，不覆盖（CX03/XC-G10）。
 */

import { checkRoleplayOutboxCapacity } from './roleplayState.js'

export const ROLEPLAY_ARCHIVE_REASON = {
  UNAVAILABLE: 'roleplay-history-unavailable',
  REJECTED_SCOPE: 'roleplay-history-scope-rejected',
  CONFLICT: 'roleplay-receipt-conflict',
  LEGACY_NO_PAYLOAD: 'roleplay-outbox-legacy-no-payload'
}

export function createRoleplayHistoryPort({ read = null, record = null } = {}) {
  const usable = typeof read === 'function' && typeof record === 'function'
  return {
    available: usable,
    kind: usable ? 'custom' : 'unavailable',
    async readRoleplayHistory(request) {
      if (!usable) {
        return { ok: false, reason: ROLEPLAY_ARCHIVE_REASON.UNAVAILABLE, retryable: false, records: [] }
      }
      return read(request)
    },
    async recordCommittedRoleplayEvidence(request) {
      if (!usable) {
        return { ok: false, reason: ROLEPLAY_ARCHIVE_REASON.UNAVAILABLE, retryable: true, eventId: null }
      }
      return record(request)
    }
  }
}

/** 模块级默认端口；应用初始化时通过 installRoleplayHistoryPort 接生产实现。 */
const portHolder = { port: createRoleplayHistoryPort() }

export function getRoleplayHistoryPort() {
  return portHolder.port
}

export function installRoleplayHistoryPort(port) {
  if (!port || typeof port.readRoleplayHistory !== 'function' || typeof port.recordCommittedRoleplayEvidence !== 'function') {
    throw Object.assign(new Error('roleplay history port 无效：必须提供 readRoleplayHistory/recordCommittedRoleplayEvidence'), {
      code: 'ROLEPLAY_PORT_INVALID'
    })
  }
  portHolder.port = port
}

/**
 * 已提交回合 → outbox（自包含载荷；幂等：同 actionId 只占一条）。
 * 满容量返回 { ok:false, reason } 由调用方背压，绝不挤掉已排队项。
 * 失败/取消的回合不入队（不产生"成功经历"）。
 */
export function queueRoleplayArchive(state, { action, receipt, scope }) {
  if (!state || !receipt || action?.status !== 'committed') {
    return { ok: false, reason: 'roleplay-archive-not-committed' }
  }
  if (state.archiveOutbox.some((entry) => entry.actionId === action.actionId)) {
    return { ok: true, duplicate: true }
  }
  if (!checkCapacity(state)) {
    return { ok: false, reason: 'ROLEPLAY_OUTBOX_CAPACITY' }
  }
  state.archiveOutbox.push({
    actionId: action.actionId,
    receiptId: receipt.receiptId,
    turnId: receipt.turnId,
    attempts: 0,
    lastError: '',
    queuedAt: Date.now(),
    // CX03：载荷自包含——scope 用回执冻结值，不用当前会话补猜。
    payload: {
      receipt: cloneJson(receipt),
      scope: cloneJson(scope || receipt.scope || null),
      sessionId: String(action.sessionId || ''),
      worldbookId: action.worldbookId ? String(action.worldbookId) : null,
      branchId: String(action.branchId || 'main')
    }
  })
  return { ok: true }
}

function checkCapacity(state) {
  return checkRoleplayOutboxCapacity(state).ok
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

/**
 * drain outbox：快照队列逐 ID 确认，成功移除；失败保留并累计 attempts。
 * - 快照期间新增条目仍存活于 state.archiveOutbox（逐 ID 移除，不整组覆盖）。
 * - 并发 drain：同一条目可能被投递两次，由 ledger 按 receiptId 幂等吸收。
 * - scope 一律取条目冻结 payload.scope；legacy 条目（无载荷）如实标记受限。
 * - 同 receiptId 异 payload（ledger receipt-conflict）：保留队列，可见诊断。
 */
export async function drainRoleplayArchiveOutbox(state) {
  const port = getRoleplayHistoryPort()
  if (!state || !Array.isArray(state.archiveOutbox) || !state.archiveOutbox.length) {
    return { attempted: 0, accepted: 0, remaining: state?.archiveOutbox?.length || 0, unavailable: !port.available }
  }
  if (!port.available) {
    return { attempted: 0, accepted: 0, remaining: state.archiveOutbox.length, unavailable: true }
  }
  const snapshot = [...state.archiveOutbox]
  let attempted = 0
  let accepted = 0
  const confirmedIds = new Set()
  for (const entry of snapshot) {
    attempted += 1
    // CX03：无自包含载荷的 legacy 条目（首批格式）不能从当前场景补猜 scope——
    // 如实标记受限并保留，等待后续显式迁移，不假装归档成功。
    if (!entry.payload?.scope) {
      entry.attempts += 1
      entry.lastError = ROLEPLAY_ARCHIVE_REASON.LEGACY_NO_PAYLOAD
      continue
    }
    try {
      const result = await port.recordCommittedRoleplayEvidence({
        scope: entry.payload.scope,
        sessionId: entry.payload.sessionId,
        turnId: entry.turnId,
        actionId: entry.actionId,
        receiptRef: { receiptId: entry.receiptId },
        receipt: entry.payload.receipt || null
      })
      if (result?.ok) {
        accepted += 1
        confirmedIds.add(entry.actionId)
        continue
      }
      entry.attempts += 1
      entry.lastError = String(result?.reason || 'record-rejected').slice(0, 200)
      // receipt-conflict 是数据级冲突：保留队列，绝不覆盖或丢弃（CX-G10）。
    } catch (error) {
      entry.attempts += 1
      entry.lastError = String(error?.message || 'record-threw').slice(0, 200)
    }
  }
  // 逐 ID 移除已确认项；drain 期间新入队的条目（不在快照中）不受影响。
  state.archiveOutbox = state.archiveOutbox.filter((entry) => !confirmedIds.has(entry.actionId))
  return {
    attempted,
    accepted,
    remaining: state.archiveOutbox.length,
    unavailable: false
  }
}

/**
 * 只读查询的防御性包装：对 port 返回的每条记录再次验证 scope 归属
 * （session/branch/viewer），跨域记录在进入 UI/provider payload 前拒绝；
 * 端口不可用与"没有记录"严格区分（CX09/XC-G09）。
 */
export async function readRoleplayHistorySafely(request) {
  const port = getRoleplayHistoryPort()
  const scope = request?.scope
  if (!scope || scope.domain !== 'session' || !scope.sessionId || (request.sessionId && request.sessionId !== scope.sessionId)) {
    return { ok: false, reason: ROLEPLAY_ARCHIVE_REASON.REJECTED_SCOPE, retryable: false, records: [] }
  }
  let result
  try {
    result = await port.readRoleplayHistory(request)
  } catch (error) {
    return { ok: false, reason: String(error?.message || 'read-threw'), retryable: true, records: [] }
  }
  if (!result?.ok) return { ok: false, reason: String(result?.reason || 'read-rejected'), retryable: Boolean(result?.retryable), records: [] }
  const rawRecords = Array.isArray(result.records) ? result.records : []
  const records = []
  for (const record of rawRecords) {
    const recordScope = record?.scope || record?.payload?.scope
    if (!recordScope) continue
    if (recordScope.domain !== 'session' || recordScope.sessionId !== scope.sessionId) continue
    if (request.branchId && recordScope.branchId && recordScope.branchId !== request.branchId) continue
    if (request.viewerRef && record.visibleTo && !isViewerAllowed(request.viewerRef, record.visibleTo)) continue
    records.push(record)
  }
  return { ok: true, records, excludedCount: rawRecords.length - records.length }
}

function isViewerAllowed(viewerRef, visibleTo) {
  const viewers = Array.isArray(visibleTo) ? visibleTo : [visibleTo]
  return viewers.some((viewer) => (
    viewer === viewerRef
    || viewer === 'all'
    || (typeof viewer === 'object' && viewer?.ref === viewerRef)
  ))
}
