/**
 * Roleplay 历史端口的生产实现（CX08/CX09）：把 A 线 factLedger 接进
 * roleplayHistoryAdapter 的端口合同。依赖方向 C→A（只 import，不改 A 文件）。
 *
 * - record → factLedger.appendCommittedTurnReceipt：receipt 经
 *   serializeRoleplayReceipt 收口为 A 合同形态；重复投递由 A 按 receiptId
 *   幂等吸收（replay:true），同 ID 异 payload 返回 receipt-conflict。
 * - read → factLedger.listTurnReceipts；调用方（readRoleplayHistorySafely）
 *   还会对返回记录做二次 scope/branch 验证，跨域记录不进入 UI/payload。
 * - 数据库不可用是显式 { ok:false, reason }，不是"没有记录"。
 */

import { openLedgerDb } from '../../memory/ledger/ledgerDb.js'
import { appendCommittedTurnReceipt, listTurnReceipts } from '../../memory/ledger/factLedger.js'
import { serializeRoleplayReceipt } from './roleplayProjection.js'
import { getRoleplayHistoryPort, installRoleplayHistoryPort } from './roleplayHistoryAdapter.js'

function mapLedgerFailure(result) {
  const reason = String(result?.reason || 'ledger-failed')
  // receipt-conflict 是数据级冲突：不可重试覆盖，保留在 outbox 人工裁决。
  return {
    ok: false,
    reason,
    retryable: reason !== 'receipt-conflict',
    eventId: null,
    detail: result?.detail ?? null
  }
}

export function createLedgerRoleplayHistoryPort() {
  let dbPromise = null
  async function getDb() {
    if (!dbPromise) {
      dbPromise = openLedgerDb().then((opened) => {
        // openLedgerDb 返回 { ok, db }；打开失败转为显式错误由调用方归类。
        if (!opened?.ok) {
          throw Object.assign(new Error(String(opened?.reason || 'ledger-open-failed')), { code: 'LEDGER_OPEN_FAILED' })
        }
        return opened.db
      })
    }
    return dbPromise
  }
  return {
    available: true,
    kind: 'fact-ledger',
    async recordCommittedRoleplayEvidence({ scope, receipt }) {
      try {
        const db = await getDb()
        const serialized = serializeRoleplayReceipt(receipt)
        const result = await appendCommittedTurnReceipt(db, { scope, receipt: serialized })
        if (result?.ok) {
          return { ok: true, eventId: result.receipt?.receiptId || serialized.receiptId, replay: Boolean(result.replay) }
        }
        return mapLedgerFailure(result)
      } catch (error) {
        dbPromise = null // 连接失效后下次 drain 重开
        return { ok: false, reason: String(error?.message || 'ledger-threw'), retryable: true, eventId: null }
      }
    },
    async readRoleplayHistory({ scope, limit = 100 } = {}) {
      try {
        const db = await getDb()
        const rows = await listTurnReceipts(db, { scope, limit })
        return {
          ok: true,
          records: rows.map((row) => ({
            receiptId: row.receiptId,
            turnId: row.turnId,
            commandId: row.commandId,
            branchId: row.branchId,
            rulesVersion: row.rulesVersion,
            resolutionRef: row.resolutionRef,
            committedAt: row.committedAt,
            archivedAt: row.archivedAt,
            scope: row.scope
          }))
        }
      } catch (error) {
        dbPromise = null
        return { ok: false, reason: String(error?.message || 'ledger-read-threw'), retryable: true, records: [] }
      }
    }
  }
}

/**
 * 应用初始化时安装生产端口（幂等：已安装 fact-ledger 则跳过）。
 * 安装失败不抛出到启动路径——端口保持默认 unavailable，UI 如实显示
 * "历史归档待重试"，不阻塞游戏本身。
 */
export function installLedgerRoleplayHistoryPort() {
  const current = getRoleplayHistoryPort()
  if (current?.kind === 'fact-ledger') return { ok: true, already: true }
  try {
    installRoleplayHistoryPort(createLedgerRoleplayHistoryPort())
    return { ok: true, already: false }
  } catch (error) {
    return { ok: false, reason: String(error?.message || 'install-failed') }
  }
}
