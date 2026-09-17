/**
 * 场次记录与导出（CX39/CX42）：冒险摘要、来源回合锚定、回退失效与
 * 手动导出（公开/作者完整两档）。
 *
 * - 摘要携带 sourceTurnIds + cutoff：回退/更正使引用失效（invalidateFrom），
 *   失效摘要绝不覆盖正文，也不冒称仍有效（CX39/XC-G34）。
 * - 导出是显式手动动作：公开档只含玩家可见投影；作者档追加来源事件与
 *   回执引用；两者都不包含 apiSettings/密钥（XC-G39）。
 */

import { ROLEPLAY_RESOURCES_SCHEMA_VERSION } from './roleplayResources.js'

export const ROLEPLAY_RECORD_SCHEMA_VERSION = 1

function recordError(code, message) {
  return Object.assign(new Error(message), { code })
}

/** 生成者引用（审计来源链）：精确到会话/分支/回合。 */
export function buildRecordSourceRef({ sessionId, branchId, turnId }) {
  return {
    sessionId: String(sessionId || ''),
    branchId: String(branchId || 'main'),
    turnId: turnId ? String(turnId) : null
  }
}

/**
 * 场次摘要（CX39）：确定性来源（运行体公开事件 + 已确认线索），每个事件
 * 带可失效标记。model-produced narrative 不进入摘要——摘要只锚定机械事实。
 */
export function buildScenarioRecord(run, scenario, { sourceRef = null } = {}) {
  if (!run || !scenario) {
    throw recordError('ROLEPLAY_RECORD_INVALID', '缺少运行实例或场景定义')
  }
  const discovered = Object.keys(run.clues).filter((id) => run.clues[id] === 'discovered')
  return {
    schemaVersion: ROLEPLAY_RECORD_SCHEMA_VERSION,
    scenarioId: run.scenarioId,
    scenarioRevision: run.scenarioRevision,
    status: run.status,
    endingId: run.endingId,
    currentSceneId: run.currentSceneId,
    discoveredClueIds: discovered,
    sourceTurnIds: [...new Set(Object.values(run.discoveredAt || {}).map((entry) => String(typeof entry === 'object' && entry !== null ? entry.turnId : entry)).filter(Boolean))],
    events: run.publicEvents.map((event) => ({
      id: event.id,
      type: event.type,
      text: event.text,
      sourceActionId: event.sourceActionId,
      sourceTurnId: event.turnId,
      invalidated: false
    })),
    resourceVersionAtRecord: ROLEPLAY_RESOURCES_SCHEMA_VERSION,
    sourceRef,
    cutOffAt: Date.now()
  }
}

/**
 * 回退失效（CX39/XC-G34）：turnId 之后（含）的事件标 invalidated——不删除
 * 记录本体（审计保留），消费方据 invalidated 决定呈现；摘要不覆盖正文。
 */
export function invalidateRecordsFrom(record, turnId) {
  if (!record || !turnId) return { invalidated: 0 }
  let count = 0
  for (const event of record.events || []) {
    if (!event.invalidated && event.sourceTurnId === String(turnId)) {
      event.invalidated = true
      count += 1
    }
  }
  record.sourceTurnIds = (record.sourceTurnIds || []).filter((id) => id !== String(turnId))
  return { invalidated: count }
}

/**
 * 手动导出（CX42/XC-G39）：
 * - public：玩家可见层（场景投影级事实 + 已发现线索 + 公开事件文本）。
 * - author：追加来源事件（含 sourceActionId/turnId）与回执引用。
 * 白名单构造，绝不做整包序列化——apiSettings/密钥/提示词不可能混入。
 */
export function exportAdventureRecord({ run, scenario, receipts = [], mode = 'public', sourceRef = null } = {}) {
  if (mode !== 'public' && mode !== 'author') {
    throw recordError('ROLEPLAY_EXPORT_SCOPE_INVALID', '导出范围只能是 public 或 author')
  }
  const base = buildScenarioRecord(run, scenario, { sourceRef })
  const discoveredClues = base.discoveredClueIds.map((id) => {
    const clue = scenario.clues.find((item) => item.id === id)
    return { id, name: clue?.name || id, summary: clue?.summary || '' }
  })
  const record = {
    schemaMarker: 'pinax.roleplay.adventure-record-v1',
    exportedAt: Date.now(),
    exportScope: mode,
    scenario: { id: base.scenarioId, revision: base.scenarioRevision, title: scenario.title },
    status: base.status,
    endingId: base.endingId,
    currentSceneId: base.currentSceneId,
    discoveredClues,
    sourceRef,
    sourceTurnIds: base.sourceTurnIds,
    events: base.events
      .filter((event) => mode === 'author' || !event.invalidated)
      .map((event) => (mode === 'author'
        ? { type: event.type, text: event.text, invalidated: event.invalidated, sourceActionId: event.sourceActionId, sourceTurnId: event.sourceTurnId }
        : { type: event.type, text: event.text, invalidated: event.invalidated }))
  }
  if (mode === 'author') {
    record.receiptRefs = (receipts || []).map((receipt) => ({
      receiptId: receipt.receiptId,
      turnId: receipt.turnId,
      committedAt: receipt.committedAt
    }))
  }
  return record
}
