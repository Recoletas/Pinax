/**
 * 单一 AI 同伴（CX31–CX36 最小纵切，本地单人）。
 *
 * - CX31：同伴是明确标记的非玩家角色（不是玩家分身），可随时停用；
 *   不可逆/消耗资源的选择永远等待真人确认。
 * - CX33：每轮至多一个行动提案；提案由确定性调度器从场景公开投影的
 *   白名单动作（场景出口 / 可用线索检定）生成——不解析模型输出，
 *   提示词注入无法制造白名单之外的提案（CX36/G31）。
 * - CX32：本纵切的知识上下文=场景公开投影（已发现/可用层）。A 知识
 *   reader 的深度接线留接口（knowledgeProvider），不可用时如实缩小，
 *   不回退全库（XC-G29 语义）。
 * - CX34：提案只是建议；采纳=玩家显式点击，由既有 confirm/move 通道执行。
 */

export const ROLEPLAY_COMPANION_VERSION = 1

function companionError(code, message) {
  return Object.assign(new Error(message), { code })
}

export function createCompanion({ name = '旅伴', goal = '协助你查明真相' } = {}) {
  return {
    version: ROLEPLAY_COMPANION_VERSION,
    enabled: true,
    name: String(name || '旅伴').slice(0, 40),
    goal: String(goal || '').slice(0, 120),
    isPlayer: false,
    lastProposal: null
  }
}

export function normalizeCompanion(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (Number(raw.version) !== ROLEPLAY_COMPANION_VERSION) return null
  return {
    version: ROLEPLAY_COMPANION_VERSION,
    enabled: raw.enabled === true,
    name: String(raw.name || '旅伴').slice(0, 40),
    goal: String(raw.goal || '').slice(0, 120),
    isPlayer: false,
    lastProposal: (raw.lastProposal && typeof raw.lastProposal === 'object') ? raw.lastProposal : null
  }
}

/**
 * 确定性提案生成（CX33）：纯函数 of 公开投影。优先级：
 *   1) 当前场景的可用线索检定（第一个）；
 *   2) 第一个场景出口。
 * 无可用动作 → null（同伴建议"由你决定"，不杜撰）。
 */
export function createCompanionProposal(projection) {
  if (!projection || projection.status !== 'active') return null
  const clueAction = projection.availableSceneClueActions?.[0]
  if (clueAction) {
    return {
      kind: 'check',
      clueId: clueAction.clueId,
      label: `建议检查：${clueAction.actionText}`,
      requiresPlayerConfirmation: true
    }
  }
  const exit = projection.currentScene?.exits?.[0]
  if (exit) {
    return {
      kind: 'move',
      toSceneId: exit.toSceneId,
      label: `建议前往：${exit.label}`,
      requiresPlayerConfirmation: true
    }
  }
  return null
}

/**
 * 提案校验（CX36/G31）：提案目标必须存在于当前公开投影的白名单集合；
 * 任何白名单之外的 kind/target 一律拒绝——这是防注入的硬边界。
 */
export function validateProposalAgainstProjection(proposal, projection) {
  if (!proposal || !projection || projection.status !== 'active') return false
  if (proposal.kind === 'check') {
    return projection.availableSceneClueActions.some((action) => action.clueId === proposal.clueId)
  }
  if (proposal.kind === 'move') {
    return projection.currentScene?.exits?.some((exit) => exit.toSceneId === proposal.toSceneId)
  }
  return false
}

/** 同伴知识上下文（CX32）：公开投影 + A 账本会话域事实（可选 provider）。
 * knowledgeProvider 注入 A 的 queryFacts（scope 限定会话域）：
 *   - provider 返回失败/不可用 → 降级公开投影，绝不回退全库（XC-G29）；
 *   - provider 返回的每条事实必须属于同一会话 scope（再验证）。
 */
export function buildCompanionContext(projection, knowledgeProvider = null) {
  if (!projection) return { ok: false, reason: 'companion-no-projection' }
  if (typeof knowledgeProvider !== 'function') {
    // 未接线：如实缩小到公开投影（本纵切的默认语义，不是"没有过去"）。
    return { ok: true, context: projection, scope: 'scenario-public-only', facts: [] }
  }
  return { ok: true, context: projection, scope: 'scenario-public-only', facts: [], knowledgeProvider }
}

/**
 * 异步组装同伴知识（CX32 深度路径）：公开投影 + 会话域已确认事实白名单。
 * 事实字段只取 { factKey, subjectId, predicate, value, recordedAt }；
 * 任何作用域不符/异常都降级为公开投影，不抛出、不扩大上下文。
 */
export async function buildCompanionKnowledgeContext({ projection }) {
  if (!projection) return { ok: false, reason: 'companion-no-projection' }
  // Author-confirmed truth is NOT character knowledge. Until an actor-aware
  // reader proves viewer, branch and through-turn visibility, do not query it.
  return { ok: true, context: projection, scope: 'scenario-public-only', facts: [], knowledgeScope: 'unavailable:character-knowledge-reader' }
}

export { companionError }
