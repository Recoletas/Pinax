import { buildNarrativeFormatInstructions } from '../narrativePresentation.js'
import { collectBranchTurnChain as collectTurnChain, collectVisibleMessageIds as collectChainMessageIds, gcUnreachableTurns as gcBranchTurns, latestBranchTurn as latestCommittedBranchTurn, markSupersededMessages } from './gameBranchTurnGraph.js'

function debugLog(...args) {
  if (import.meta.env?.DEV) globalThis.console?.debug?.(...args)
}

// Branch selection, regeneration, visibility and chat projection remain one transaction owner.
export const gameBranchWorkflowActions = {
// P1：删除后清理完全不可达的 turn record（无 assistantMessageIds/userMessageIds、
// 无 baseMessageId 引用、无其他 turn 把它当 parent）。仍被分支链引用的拓扑保留。
gcUnreachableTurns() {
  // GC 判定归 branch-turn 图模块（B11）：store 只保留保留条件里的游标
  this.turnRecords = gcBranchTurns(this.turnRecords, {
    lastCommittedTurnId: this.lastCommittedTurnId,
    pendingBranchParentTurnId: this.pendingBranchParentTurnId
  })
},

// --- 新增：核心”执行”功能 ---
// 点击某条消息的”执行”按钮时调用
// R1a：根据消息 id 反查所属的 turnRecord。
// 优先精确匹配 assistantMessageIds；其次匹配 userMessageIds（用于从 user 消息 regenerate）。
findTurnByMessageId(messageId) {
  if (!messageId) return null
  // C4/P0-2：只认 committed 且在当前分支祖先链上的回合，避免选中 failed/撤销回合或其它分支的 extension。
  const chain = this.collectBranchTurnChain(this.activeBranchId || 'main')
  return Object.values(this.turnRecords || {})
    .filter((record) => (
      record.status === 'committed'
      && chain.has(record.id)
      && (
        record.assistantMessageIds?.includes(String(messageId))
        || record.baseMessageId === String(messageId)
        || record.userMessageIds?.includes(String(messageId))
      )
    ))
    .sort((a, b) => (b.committedAt || 0) - (a.committedAt || 0))[0] || null
},

// C4：当前分支最后一条可见、已提交的 assistant 消息（extend 目标）。
findLastVisibleAssistantMessage() {
  const visibleIds = this.currentBranchVisibleMessageIds()
  return [...(this.messages || [])].reverse().find((message) => (
    message?.role === 'assistant'
    && !message.superseded
    && (!message.branchId || visibleIds.has(message.id))
  )) || null
},

// P0-1：当前分支可见消息 id 集合 —— 基于 turn 祖先链。
// 从当前分支最新 committed turn 沿 parentTurnId 回溯，收集链上每个 turn 的
// user/assistant 消息 id。嵌套分叉时，只有祖先链上的消息可见，
// 子分支独有历史不会被误提升为共享。
collectBranchTurnChain(branchId) {
  return collectTurnChain(this.turnRecords, {
    branchId,
    pendingBranchParentTurnId: this.pendingBranchParentTurnId,
    lastCommittedTurnId: this.lastCommittedTurnId
  })
},

// P0-1：当前分支可见消息 id 集合（含祖先链 turn 的消息 + 无 branchId 的共享历史）。
currentBranchVisibleMessageIds() {
  const chain = this.collectBranchTurnChain(this.activeBranchId || 'main')
  return collectChainMessageIds(this.turnRecords, chain)
},

// P1-4：当前分支链上的 turn id 集合（记忆候选分支隔离用）。
currentBranchTurnIds() {
  return this.collectBranchTurnChain(this.activeBranchId || 'main')
},

// P1-4：构建记忆候选分支过滤函数。
// 候选 id 若出现在"非当前分支链"的 turn.memoryCandidateIds 里 → 排除（分支 A 的记忆不污染 B）。
// 手动/共享候选（不在任何 turn 记录里）→ 保留。
buildBranchMemoryFilter() {
  const chain = this.collectBranchTurnChain(this.activeBranchId || 'main')
  // 反向映射：候选 id → 所属 turn id
  const candidateToTurn = {}
  for (const turn of Object.values(this.turnRecords || {})) {
    for (const candidateId of turn.memoryCandidateIds || []) {
      if (!candidateToTurn[candidateId]) candidateToTurn[candidateId] = []
      candidateToTurn[candidateId].push(turn.id)
    }
  }
  return (memory) => {
    const turnIds = candidateToTurn[memory?.id]
    if (!turnIds || turnIds.length === 0) return true  // 共享/手动候选保留
    // 候选属于当前分支链上的 turn → 保留；否则排除
    return turnIds.some((turnId) => chain.has(turnId))
  }
},

async regenerateFrom(index) {
  debugLog('[regenerateFrom] START, messages count before slice:', this.messages.length, 'index:', index)
  // 未启用 AI 时“重新生成”没有可执行的后续动作；必须保持为严格 no-op，
  // 不能先回滚 runtime、创建临时分支或改写 superseded 标记。
  if (!this.useAI) return false

  // 1. 确保游戏在播放状态
  this.isPlaying = true

  // R1a：非破坏性重试。
  // 1a. 找到目标消息所属的回合，回滚到该回合开始前的 runtime state。
  const targetMessage = this.messages[index]
  const parentTurn = targetMessage?.id ? this.findTurnByMessageId(targetMessage.id) : null
  if (parentTurn?.preRuntimeSnapshot) {
    debugLog('[regenerateFrom] rollback runtime state to pre-turn snapshot:', parentTurn.id)
    this.applyRuntimeSnapshot(parentTurn.preRuntimeSnapshot)
  } else {
    debugLog('[regenerateFrom] no matching turn record; skip state rollback')
  }

  // R1b：不再截断 messages —— 旧消息保留在数组。
  // P0-3 修正：**不再清除任何 branchId** —— 可见性由 turn 链决定
  // （见 rebuildChatHistory / currentBranchVisibleMessageIds），
  // 避免嵌套分叉时把子分支独有历史误提升为全局共享。
  const oldBranchId = this.activeBranchId || 'main'
  const newBranchId = `branch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  this.activeBranchId = newBranchId
  // P1-3：记录分叉父 turn —— 新分支尚无 committed turn 时，collectBranchTurnChain
  // 从它建链（而非依赖可能丢失的全局 lastCommittedTurnId）。
  this.pendingBranchParentTurnId = parentTurn?.id || null
  // 标记被重写部分为 superseded（保留标记，供切换按钮定位）
  for (let i = index + 1; i < this.messages.length; i++) {
    const m = this.messages[i]
    if (m && typeof m === 'object') m.superseded = true
  }
  // 旧分支的最后一条 assistant 消息记入 parentTurn（切换按钮定位用）
  const lastOldAssistant = [...this.messages].reverse().find((m) => (
    m?.role === 'assistant' && (m.branchId || 'main') === oldBranchId
  ))
  if (parentTurn && lastOldAssistant?.id) {
    parentTurn.oldBranchAssistantId = lastOldAssistant.id
  }
  debugLog('[regenerateFrom] switch branch to:', newBranchId, 'oldBranch:', oldBranchId)

  // 2. 重新构建 AI 记忆
  this.rebuildChatHistory();
  debugLog('[regenerateFrom] chatHistory after rebuild:', this.chatHistory.map(m => m.role + ':' + m.content?.slice(0, 30)))

  // 3. 立即触发重新生成（useAI 已在入口守卫）
  {
    // 标记为重写后续，避免触发初始化逻辑
    this._isRegenerating = true
    // P0-3：新 turn 作为旧 turn 的 sibling（同父级），并传入源用户消息 id，
    // 让生成出的 turnRecord 正确关联到触发重生成的 user 消息。
    // P0-2：新 turn 是旧 turn 的 sibling —— parentTurnId 取旧 turn 的父 turn。
    // 首回合（parentTurn.parentTurnId 为 null）时新候选也是根 sibling（null），
    // 不能 fallback 到旧 turn.id（那会变成子回合）。
    const branchParentTurnId = parentTurn?.parentTurnId ?? null
    const sourceUserMessageId = targetMessage?.id || ''
    debugLog('[regenerateFrom] Starting, _isRegenerating:', this._isRegenerating)
    const outcome = await this.generateAIResponse({ parentTurnId: branchParentTurnId, userMessageId: sourceUserMessageId })
    // P0-1：生成失败/取消时恢复原分支 —— 复用 switchBranch 的完整恢复逻辑
    // （恢复该分支 postRuntimeSnapshot + 重算 superseded + 同步游标 + 重建 chatHistory），
    // 保证旧回复重新可见的同时，地点/时间/角色状态也回到旧分支的提交后状态。
    if (outcome !== 'success' && this.activeBranchId === newBranchId) {
      debugLog('[regenerateFrom] generation failed, restore branch:', oldBranchId)
      this.switchBranch(oldBranchId)
    }
    this._isRegenerating = false
    debugLog('[regenerateFrom] Done, _isRegenerating:', this._isRegenerating)
  }
  return true
},

// R1b：切换候选/分支。恢复该分支的 post snapshot + 重建 chatHistory。
switchBranch(branchId) {
  if (!branchId || branchId === this.activeBranchId) return
  // 最新回合选择与 superseded 标记判定归 branch-turn 图模块（B11）
  const turn = latestCommittedBranchTurn(this.turnRecords, branchId)
  // P0-2：同步提交游标到目标分支最新 turn —— 否则切分支后继续生成，
  // 新 turn 会以其它分支的回合作父节点，重新造成跨分支污染。
  if (turn?.id) this.lastCommittedTurnId = turn.id
  if (turn?.postRuntimeSnapshot) {
    this.applyRuntimeSnapshot(turn.postRuntimeSnapshot)
  }
  markSupersededMessages(this.messages, branchId)
  this.activeBranchId = branchId
  this.rebuildChatHistory()
  // 最终一致态提交点（B-R2）
  this.commitCurrentSessionNow()
},

// R1b：检查 index 之后是否还有其它分支的 assistant 消息（切换按钮显示条件）。
hasCandidateAfter(index) {
  const after = this.messages.slice(index + 1)
  const currentBranch = this.activeBranchId || 'main'
  return after.some((m) => m?.role === 'assistant' && (m.branchId || 'main') !== currentBranch)
},

// R1b：列出当前 user 消息之后的所有分支 id（切换按钮在候选间循环）。
candidateBranchesAfter(index) {
  const after = this.messages.slice(index + 1)
  const seen = new Set()
  for (const m of after) {
    if (m?.role === 'assistant' && m?.branchId) seen.add(m.branchId)
  }
  return [...seen]
},

// --- 新增：辅助方法，确保界面和 AI 记忆完全一致 ---
rebuildChatHistory() {
  // 从当前的 messages 完整重建 chatHistory
  // 保留 user 和 assistant 消息（不包括 system）
  // P0-1：可见性由 turn 链决定 —— 当前分支祖先链上的消息 + 无 branchId 的共享历史。
  // 不使用"清除 branchId"或简单分支过滤（嵌套分叉会污染）。
  const visibleIds = this.currentBranchVisibleMessageIds()
  const history = this.messages
    .filter((m) => m && !m.superseded && (!m.branchId || visibleIds.has(m.id)))
    .map(m => {
      if (m.role === 'system' || m.type === 'system') return null
      return {
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }
    })
    .filter(Boolean)

  // 添加默认系统提示词
  const systemPrompt = {
    role: 'system',
    content: [
      '你是一个小说叙述者，请用生动的语言描述场景并与玩家互动。',
      buildNarrativeFormatInstructions()
    ].join('\n\n')
  };

  this.chatHistory = [systemPrompt, ...history];
},
}

