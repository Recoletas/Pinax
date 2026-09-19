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
      requiresPlayerConfirmation: true,
      source: 'deterministic-whitelist'
    }
  }
  const exit = projection.currentScene?.exits?.[0]
  if (exit) {
    return {
      kind: 'move',
      toSceneId: exit.toSceneId,
      label: `建议前往：${exit.label}`,
      requiresPlayerConfirmation: true,
      source: 'deterministic-whitelist'
    }
  }
  return null
}

/**
 * 模型候选解析（R03）：模型在白名单内提出 { kind, target, reason }。
 * 只解析不信任——target 合法性由 validateProposalAgainstProjection 白名单
 * 硬校验（防注入），理由有长度上限。任何畸形输出返回 { ok:false, reason }
 * 诊断，调用方显式停下，绝不回退第一个动作并冒充"AI 决策"。
 */
export function parseCompanionModelCandidate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'COMPANION_CANDIDATE_MALFORMED', detail: '候选不是对象' }
  }
  const kind = raw.kind === 'check' || raw.kind === 'move' ? raw.kind : null
  if (!kind) {
    return { ok: false, reason: 'COMPANION_CANDIDATE_MALFORMED', detail: `未知提案类型 ${JSON.stringify(raw.kind ?? null)}` }
  }
  const keys = ['kind', 'target', 'reason', kind === 'check' ? 'clueId' : 'toSceneId']
  if (Object.keys(raw).some(key => !keys.includes(key)) || (raw.reason != null && (typeof raw.reason !== 'string' || raw.reason.length > 200))) {
    return { ok: false, reason: 'COMPANION_CANDIDATE_MALFORMED', detail: '候选包含额外字段或无效理由' }
  }
  const identifier = raw.target ?? raw.clueId ?? raw.toSceneId
  if (typeof identifier !== 'string' || identifier.length > 200) {
    return { ok: false, reason: 'COMPANION_CANDIDATE_MALFORMED', detail: '目标必须为有效字符串' }
  }
  const target = String(raw.target || raw.clueId || raw.toSceneId || '').trim()
  if (!target) {
    return { ok: false, reason: 'COMPANION_CANDIDATE_MALFORMED', detail: '提案缺少目标' }
  }
  const reason = String(raw.reason || '').trim().slice(0, 200)
  const proposal = kind === 'check'
    ? { kind, clueId: target, label: `建议检查：${target}`, requiresPlayerConfirmation: true, source: 'model', reason }
    : { kind, toSceneId: target, label: `建议前往：${target}`, requiresPlayerConfirmation: true, source: 'model', reason }
  return { ok: true, proposal }
}

/**
 * 统一提案入口（R03）：有模型候选用模型（校验失败如实报错，不静默回退）；
 * 没有才用确定性白名单（source 明确标注 deterministic）。两者都不会绕过
 * 采纳确认。
 */
export function resolveCompanionProposal({ projection, modelCandidate = null } = {}) {
  if (modelCandidate !== null && modelCandidate !== undefined) {
    const parsed = parseCompanionModelCandidate(modelCandidate)
    if (!parsed.ok) return parsed
    if (!validateProposalAgainstProjection(parsed.proposal, projection)) {
      return {
        ok: false,
        reason: 'COMPANION_CANDIDATE_OUT_OF_WHITELIST',
        detail: `提案目标不在当前公开投影白名单内：${parsed.proposal.kind}:${parsed.proposal.clueId || parsed.proposal.toSceneId}`
      }
    }
    return { ok: true, proposal: parsed.proposal, source: 'model' }
  }
  const deterministic = createCompanionProposal(projection)
  if (!deterministic) return { ok: false, reason: 'COMPANION_NO_AVAILABLE_ACTION', detail: '当前投影无可用动作' }
  return { ok: true, proposal: deterministic, source: 'deterministic-whitelist' }
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
 * 异步组装同伴知识（CX32 深度路径）：公开投影 + 角色知识读模型（M10）。
 * knowledgeReader 未接线 → 维持既有公开投影降级（真实语义，不伪装角色视角）；
 * 接线后：读模型已按 actor+scope+获知时刻收口（秘密/他分支/他人事实在
 * 读取层即不可见），本函数再做三道防线：结果形状校验、作用域复核、
 * 字段白名单收口。任何异常都降级为公开投影，不抛出、不扩大上下文。
 */
export async function buildCompanionKnowledgeContext({ projection, knowledgeReader = null, expectedScopeKey = null, actorKey = null } = {}) {
  if (!projection) return { ok: false, reason: 'companion-no-projection' }
  if (typeof knowledgeReader !== 'function') {
    // 未接线：如实缩小到公开投影。
    return { ok: true, context: projection, scope: 'scenario-public-only', facts: [], knowledgeScope: 'unavailable:character-knowledge-reader' }
  }
  let result = null
  try {
    result = await knowledgeReader()
  } catch {
    result = null
  }
  if (!result || result.ok !== true || result.mode !== 'character') {
    // 读取失败或角色无任何授权获知事件：继续公开投影，如实标注原因。
    const reason = result?.mode === 'public-fallback'
      ? 'public-fallback:no-character-events'
      : 'unavailable:knowledge-reader-unavailable'
    return { ok: true, context: projection, scope: 'scenario-public-only', facts: [], knowledgeScope: reason }
  }
  // 防线 1：作用域复核——reader 声称的作用域必须与调用方期望一致。
  if (expectedScopeKey && result.scopeKey !== expectedScopeKey) {
    return { ok: true, context: projection, scope: 'scenario-public-only', facts: [], knowledgeScope: 'unavailable:knowledge-scope-mismatch' }
  }
  // 防线 2：角色条目必须真的是角色视角。
  const entry = actorKey ? result.actors?.[actorKey] : Object.values(result.actors || {})[0]
  if (!entry || entry.mode !== 'character') {
    return { ok: true, context: projection, scope: 'scenario-public-only', facts: [], knowledgeScope: 'public-fallback:no-character-events' }
  }
  // 防线 3：字段白名单收口（belief!==active 已被读模型排除，不在这里复活）。
  const facts = (entry.facts || []).slice(0, 12).map(fact => ({
    factKey: fact.factKey,
    subject: fact.claim?.subjectLabel || fact.claim?.subjectKey || '',
    predicate: fact.claim?.predicate || '',
    object: fact.claim?.object || '',
    knownVia: fact.knownVia,
    knownAtStory: fact.knownAtStory,
    belief: fact.belief,
    supersededForCharacter: fact.supersededForCharacter === true
  }))
  return {
    ok: true,
    context: projection,
    scope: 'character-knowledge',
    facts,
    knowledgeScope: 'character-knowledge-reader',
    excluded: entry.excluded || {},
    snapshotVersion: result.snapshotVersion
  }
}

export { companionError }
