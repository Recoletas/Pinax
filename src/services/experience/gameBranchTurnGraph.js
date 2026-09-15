// Branch-turn 图的纯投影与判定（B11）：分支链收集、最新回合选择、可见消息
// 投影、GC 条件与 superseded 标记的唯一判定点。输入是普通 records/messages
// 数据，输出是新集合或原地标记（messages 按设计原地改 flag，保持 Vue 响应式
// 与迁出前行为一致）；本模块不读 store、不发起生成。

// 该分支的回合链：从最新 committed turn 沿 parentTurnId 回溯。
// 回退顺序（与迁出前一致）：分支内最新 committed → pending 分叉父 turn →
// 全局最近提交 turn；guard 防循环。
export function collectBranchTurnChain(records, { branchId, pendingBranchParentTurnId = null, lastCommittedTurnId = null } = {}) {
  const chain = new Set()
  if (!branchId) return chain
  const recordList = Object.values(records || {})
    .filter((r) => r?.status === 'committed')
  const branchTurns = recordList
    .filter((r) => r.branchId === branchId)
    .sort((a, b) => (b.committedAt || 0) - (a.committedAt || 0))
  let current = null
  if (branchTurns.length > 0) {
    current = branchTurns[0]
  } else if (pendingBranchParentTurnId && records[pendingBranchParentTurnId]) {
    // P1-3：当前分支尚无 committed turn（新分支刚创建）→ 从明确的分叉父 turn 建链，
    // 不依赖可能丢失的全局 lastCommittedTurnId。
    current = records[pendingBranchParentTurnId]
  } else if (lastCommittedTurnId && records[lastCommittedTurnId]) {
    // 兜底：无 pending 分叉父 turn 时回退到最近提交 turn 的链。
    current = records[lastCommittedTurnId]
  } else {
    return chain
  }
  const guard = new Set()
  while (current && !guard.has(current.id)) {
    guard.add(current.id)
    chain.add(current.id)
    current = current.parentTurnId ? records[current.parentTurnId] : null
  }
  return chain
}

// 目标分支**最新** committed turn（按 committedAt 降序）。requireSnapshot
// 时只看带 postRuntimeSnapshot 的回合（切换恢复需要状态快照）。
// P0-3：避免多回合分支恢复到过早状态。
export function latestBranchTurn(records, branchId, { requireSnapshot = true } = {}) {
  const branchTurns = Object.values(records || {})
    .filter((r) => r?.branchId === branchId && (!requireSnapshot || r?.postRuntimeSnapshot))
    .sort((a, b) => (b.committedAt || 0) - (a.committedAt || 0))
  return branchTurns[0] || null
}

// 链上全部消息 id（用户 + 助手），供可见性投影使用。
export function collectVisibleMessageIds(records, chain) {
  const ids = new Set()
  for (const turnId of chain) {
    const turn = records?.[turnId]
    if (!turn) continue
    for (const id of [...(turn.userMessageIds || []), ...(turn.assistantMessageIds || [])]) {
      ids.add(id)
    }
  }
  return ids
}

// GC：删除无消息且无引用的孤立回合。保留条件（与迁出前一致）：
// 有消息 / 被其他 turn 当 parent / 是 lastCommittedTurnId 或 pendingBranchParentTurnId。
// 返回新 records 对象；调用方整体赋回 store。
export function gcUnreachableTurns(records, { lastCommittedTurnId = null, pendingBranchParentTurnId = null } = {}) {
  const source = records || {}
  const ids = Object.keys(source)
  const referencedAsParent = new Set()
  for (const turn of Object.values(source)) {
    if (turn.parentTurnId) referencedAsParent.add(turn.parentTurnId)
    // turn.baseMessageId 指向消息而非 turn，跳过
  }
  const kept = {}
  for (const id of ids) {
    const turn = source[id]
    if (!turn) continue
    const hasMessages = (turn.assistantMessageIds?.length || 0) + (turn.userMessageIds?.length || 0) > 0
    const isReferenced = referencedAsParent.has(id)
      || lastCommittedTurnId === id
      || pendingBranchParentTurnId === id
    if (hasMessages || isReferenced) {
      kept[id] = turn
    }
  }
  return kept
}

// 分支切换后的可见性标记：目标分支消息解除 superseded，其他分支消息隐藏。
// 按设计原地修改消息对象（与迁出前一致）；缺 branchId 的历史消息视为主线。
export function markSupersededMessages(messages, activeBranchId) {
  for (const message of messages || []) {
    if (!message || typeof message !== 'object') continue
    if (message.branchId && message.branchId !== activeBranchId) message.superseded = true
    else message.superseded = false
  }
  return messages
}
