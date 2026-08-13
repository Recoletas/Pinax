/**
 * 回合事务契约（酒馆能力对齐计划 R1a）。
 *
 * 定义 NarrativeTurnRecord —— 把"一轮 AI 生成"建模为一个事务：
 *   生成前快照 preRuntimeSnapshot + 生成后提交的正文/runtime delta/记忆候选。
 *   失败时从 preRuntimeSnapshot 回滚；regenerate 时回到父回合的快照。
 *
 * 首版（R1a）只含全量快照 + 非破坏性重试。
 * R1b 会扩展 candidateIds / activeCandidateId / 增量 delta / 分支切换。
 */

const TURN_RECORD_LIMIT = 50
const VALID_STATUSES = Object.freeze(['pending', 'committed', 'failed'])

/**
 * 生成稳定消息 id（所有消息类型统一）。
 * narrative agent 路径已有 msg_<hash>，这里给 user/system 消息用。
 */
export function createMessageId(role = 'msg') {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `msg_${ts}_${rand}_${role}`
}

/**
 * 创建一个 pending 状态的 turn record（生成开始时调用）。
 * preRuntimeSnapshot 由 gameStore.getRuntimeSnapshot() 提供。
 */
export function createNarrativeTurnRecord({
  id,
  parentTurnId = null,
  branchId = 'main',
  preRuntimeSnapshot = null,
  userMessageIds = [],
  createdAt = Date.now(),
  kind = 'normal',        // C4：'normal' | 'extension'（同消息续接）
  baseMessageId = null,   // C4：extension 指向被续接的 assistant 消息
  segmentId = null,       // C4：extension 本次追加的 segment id
} = {}) {
  const tid = String(id || '').trim()
  if (!tid) throw new Error('createNarrativeTurnRecord: id is required')
  return {
    id: tid,
    parentTurnId: parentTurnId ? String(parentTurnId) : null,
    branchId: String(branchId || 'main'),
    userMessageIds: Array.isArray(userMessageIds) ? userMessageIds.map(String) : [],
    assistantMessageIds: [],
    preRuntimeSnapshot: preRuntimeSnapshot,
    postRuntimeSnapshot: null,   // R1b：生成完成后的 state 快照，候选切换时恢复
    oldBranchAssistantId: null,  // R1b：旧分支最后一条 assistant 消息 id（切换按钮定位）
    directorNote: null,          // R2：本轮导演注（仅下一轮生效）
    receipt: null,               // R2：回合回执（低敏摘要）
    memoryCandidateIds: [],      // P1-6：本回合产生的记忆候选 id（追溯/分支隔离）
    detachedMessageIds: [],
    kind: kind === 'extension' ? 'extension' : 'normal',
    baseMessageId: baseMessageId ? String(baseMessageId) : null,
    segmentId: segmentId ? String(segmentId) : null,
    status: 'pending',
    createdAt,
    committedAt: null,
  }
}

/**
 * 标记 turn record 为已提交（生成成功 + state delta 应用后）。
 */
export function commitNarrativeTurnRecord(record, { assistantMessageIds = [], postRuntimeSnapshot = null, directorNote = null, receipt = null, segmentId = null, committedAt = Date.now() } = {}) {
  if (!record) return record
  record.status = 'committed'
  record.committedAt = committedAt
  record.assistantMessageIds = Array.isArray(assistantMessageIds) ? assistantMessageIds.map(String) : []
  if (postRuntimeSnapshot && typeof postRuntimeSnapshot === 'object') {
    record.postRuntimeSnapshot = postRuntimeSnapshot
  }
  // R2：本轮导演注（仅下一轮，提交后保留供回执审计）
  if (directorNote != null) record.directorNote = String(directorNote).trim() || null
  // R2：回合回执（低敏摘要）
  if (receipt && typeof receipt === 'object') record.receipt = receipt
  // C4：extension 提交时记录本次 segment id
  if (segmentId) record.segmentId = String(segmentId)
  return record
}

/**
 * 标记 turn record 为失败（生成失败/取消时调用）。
 */
export function failNarrativeTurnRecord(record, { committedAt = Date.now() } = {}) {
  if (!record) return record
  record.status = 'failed'
  record.committedAt = committedAt
  return record
}

/**
 * 归一化 turn record（从持久化数据恢复时用）。
 * 丢弃 status 不合法或缺 preRuntimeSnapshot 的 record。
 */
export function normalizeNarrativeTurnRecord(input) {
  if (!input || typeof input !== 'object') return null
  const status = VALID_STATUSES.includes(input.status) ? input.status : 'pending'
  // 只保留 committed 且有快照的 record（pending/failed 的快照无恢复价值）
  if (status !== 'committed') return null
  if (!input.preRuntimeSnapshot || typeof input.preRuntimeSnapshot !== 'object') return null
  return {
    id: String(input.id || ''),
    parentTurnId: input.parentTurnId ? String(input.parentTurnId) : null,
    branchId: String(input.branchId || 'main'),
    userMessageIds: Array.isArray(input.userMessageIds) ? input.userMessageIds.map(String) : [],
    assistantMessageIds: Array.isArray(input.assistantMessageIds) ? input.assistantMessageIds.map(String) : [],
    preRuntimeSnapshot: input.preRuntimeSnapshot,
    postRuntimeSnapshot: (input.postRuntimeSnapshot && typeof input.postRuntimeSnapshot === 'object') ? input.postRuntimeSnapshot : null,
    oldBranchAssistantId: input.oldBranchAssistantId ? String(input.oldBranchAssistantId) : null,
    directorNote: input.directorNote != null ? String(input.directorNote).trim() || null : null,
    receipt: (input.receipt && typeof input.receipt === 'object') ? input.receipt : null,
    memoryCandidateIds: Array.isArray(input.memoryCandidateIds) ? input.memoryCandidateIds.map(String) : [],
    detachedMessageIds: Array.isArray(input.detachedMessageIds) ? input.detachedMessageIds.map(String) : [],
    kind: input.kind === 'extension' ? 'extension' : 'normal',
    baseMessageId: input.baseMessageId ? String(input.baseMessageId) : null,
    segmentId: input.segmentId ? String(input.segmentId) : null,
    status,
    createdAt: Number(input.createdAt) || Date.now(),
    committedAt: Number(input.committedAt) || Date.now(),
  }
}

/**
 * 归一化 turnRecords 字典（LRU by committedAt，最多 TURN_RECORD_LIMIT 个）。
 */
export function normalizeTurnRecords(input) {
  if (!input || typeof input !== 'object') return {}
  const records = []
  for (const value of Object.values(input)) {
    const rec = normalizeNarrativeTurnRecord(value)
    if (rec) records.push(rec)
  }
  // LRU：按 committedAt 降序，保留前 TURN_RECORD_LIMIT 个
  records.sort((a, b) => b.committedAt - a.committedAt)
  const result = {}
  for (const rec of records.slice(0, TURN_RECORD_LIMIT)) {
    result[rec.id] = rec
  }
  return result
}

export { TURN_RECORD_LIMIT }
