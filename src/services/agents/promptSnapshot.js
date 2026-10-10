// W7 提示词透明化：内核构建时的会话内快照，供 PromptPreviewPanel 展示本轮
// 实际进入内核的块组成、用量与激活工具。
// 刻意只留内存：快照正文含世界书/角色卡等作品内容，按设计口径不随消息持久化、
// 不上服务端；页面刷新后失效由面板给出说明，新回合会自动重新记录。
const SNAPSHOT_LIMIT = 20
let snapshots = []

function cloneContent(content) {
  if (content == null || typeof content !== 'object') return content
  try {
    return JSON.parse(JSON.stringify(content))
  } catch {
    return content
  }
}

function normalizeBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : []).map((block, order) => ({
    order,
    kind: String(block?.kind || ''),
    chars: Number(block?.chars || 0),
    truncated: Boolean(block?.truncated),
    sourceRefs: (Array.isArray(block?.sourceRefs) ? block.sourceRefs : []).map(String),
    content: cloneContent(block?.content ?? null)
  }))
}

export function recordPromptSnapshot({
  key,
  surface,
  projectId,
  sessionId,
  revision,
  intentMode,
  temperature,
  blocks,
  budget,
  toolNames,
  activatedLore
} = {}) {
  const snapshotKey = String(key || '')
  if (!snapshotKey) return null
  const entry = {
    key: snapshotKey,
    surface: String(surface || ''),
    at: Date.now(),
    projectId: String(projectId || ''),
    sessionId: String(sessionId || ''),
    revision: String(revision || ''),
    intentMode: String(intentMode || ''),
    // 只有作者显式指定取样档才记账；null 表示沿用服务端缺省曲线，不是「温度为 null」。
    temperature: Number.isFinite(Number(temperature)) && temperature != null ? Number(temperature) : null,
    blocks: normalizeBlocks(blocks),
    budget: {
      maxChars: Number(budget?.maxChars || 0),
      usedChars: Number(budget?.usedChars || 0),
      truncatedBlocks: (Array.isArray(budget?.truncatedBlocks) ? budget.truncatedBlocks : []).map(String)
    },
    toolNames: (Array.isArray(toolNames) ? toolNames : []).map(String),
    activatedLore: activatedLore && typeof activatedLore === 'object'
      ? {
          entryCount: Array.isArray(activatedLore.entries) ? activatedLore.entries.length : 0,
          totalMatched: Number(activatedLore.totalMatched || 0),
          truncatedCount: Number(activatedLore.truncatedCount || 0)
        }
      : null
  }
  snapshots = [entry, ...snapshots.filter((item) => item.key !== snapshotKey)].slice(0, SNAPSHOT_LIMIT)
  return entry
}

export function getPromptSnapshot(key) {
  const wanted = String(key || '')
  if (!wanted) return null
  return snapshots.find((item) => item.key === wanted) || null
}

export function clearPromptSnapshots() {
  snapshots = []
}

export default { recordPromptSnapshot, getPromptSnapshot, clearPromptSnapshots }
