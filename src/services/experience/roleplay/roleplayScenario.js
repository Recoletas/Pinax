/**
 * 最小场景（Scenario）域（CX13–CX18）：原创场景/连接/目标/线索/可见范围与结局，
 * 冻结 scenarioRevision。纯函数域，不读 store、不做 IO。
 *
 * 状态机（scenarioRun，挂在 roleplaySession.scenarioRun，随会话持久化）：
 *   active ⇄ paused → ended（显式结束；结束后停止自动行动，confirm 拒绝）
 *
 * 线索：locked / available / discovered。公开投影只含 discovered（不含未发现
 * 线索的名称/摘要/数量——数量本身也是信息，按 CX15/G19 裁剪）。
 * 失败前进：线索可定义 failForward { unlockClueId, eventText }——检定失败不解锁
 * 原线索，改为开启替代线索/路线，且不把失败改成功（CX16/G18）。
 * 幂等：场景重复进入不重复发奖励/线索；同 actionId 的结算效果只应用一次（CX17/G17）。
 */

export const ROLEPLAY_SCENARIO_SCHEMA_VERSION = 1
export const CLUE_VISIBILITIES = Object.freeze(['locked', 'available', 'discovered'])

function scenarioError(code, message) {
  return Object.assign(new Error(message), { code })
}

export function createScenarioRevision() {
  return `rev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/** 夹具/作者输入 → 合同形态。非法条目直接拒绝（不静默修正）。 */
export function normalizeScenario(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  if (Number(input.schemaVersion) !== ROLEPLAY_SCENARIO_SCHEMA_VERSION) return null
  const scenarioId = String(input.scenarioId || '').trim()
  const title = String(input.title || '').trim()
  const scenes = Array.isArray(input.scenes) ? input.scenes : []
  const clues = Array.isArray(input.clues) ? input.clues : []
  if (!scenarioId || !title || !scenes.length) return null
  const sceneIds = new Set(scenes.map((scene) => String(scene?.id || '').trim()).filter(Boolean))
  if (sceneIds.size !== scenes.length) return null
  for (const scene of scenes) {
    for (const exit of Array.isArray(scene.exits) ? scene.exits : []) {
      if (!sceneIds.has(String(exit?.toSceneId || ''))) return null
    }
  }
  const clueIds = new Set(clues.map((clue) => String(clue?.id || '').trim()).filter(Boolean))
  for (const clue of clues) {
    for (const requiredId of Array.isArray(clue.requiresClueIds) ? clue.requiresClueIds : []) {
      if (!clueIds.has(String(requiredId))) return null
    }
    if (clue.failForward?.unlockClueId && !clueIds.has(String(clue.failForward.unlockClueId))) return null
  }
  return {
    schemaVersion: ROLEPLAY_SCENARIO_SCHEMA_VERSION,
    scenarioId,
    revision: String(input.revision || '').trim() || createScenarioRevision(),
    title,
    scenes: scenes.map((scene) => ({
      id: String(scene.id),
      title: String(scene.title || '').slice(0, 80),
      description: String(scene.description || '').slice(0, 400),
      exits: (Array.isArray(scene.exits) ? scene.exits : []).map((exit) => ({
        toSceneId: String(exit.toSceneId),
        label: String(exit.label || '').slice(0, 40)
      })),
      clueIds: (Array.isArray(scene.clueIds) ? scene.clueIds : []).map(String).filter((id) => clueIds.has(id))
    })),
    clues: clues.map((clue) => ({
      id: String(clue.id),
      name: String(clue.name || '').slice(0, 80),
      summary: String(clue.summary || '').slice(0, 200),
      actionText: String(clue.actionText || `检查${clue.name || '线索'}`).slice(0, 200),
      initialVisibility: CLUE_VISIBILITIES.includes(clue.visibility) ? clue.visibility : 'available',
      requiresClueIds: (Array.isArray(clue.requiresClueIds) ? clue.requiresClueIds : []).map(String),
      attribute: String(clue.attribute || 'wits'),
      modifier: Number.isSafeInteger(Number(clue.modifier)) ? Number(clue.modifier) : 0,
      locationSceneId: String(clue.locationSceneId || '').slice(0, 80),
      grantsItem: clue.grantsItem ? String(clue.grantsItem).slice(0, 60) : null,
      failForward: clue.failForward && clue.failForward.unlockClueId
        ? { unlockClueId: String(clue.failForward.unlockClueId), eventText: String(clue.failForward.eventText || '').slice(0, 200) }
        : null
    })),
    endings: (Array.isArray(input.endings) ? input.endings : []).map((ending) => ({
      id: String(ending.id),
      label: String(ending.label || '').slice(0, 80),
      requireClueIds: (Array.isArray(ending.requireClueIds) ? ending.requireClueIds : []).map(String),
      requireSceneId: ending.requireSceneId ? String(ending.requireSceneId) : null
    }))
  }
}

/** 进入冒险：冻结运行源 revision，初始线索按 initialVisibility 展开。 */
export function createScenarioRun(scenario, { now = Date.now() } = {}) {
  const clues = {}
  for (const clue of scenario.clues) clues[clue.id] = clue.initialVisibility
  return {
    version: ROLEPLAY_SCENARIO_SCHEMA_VERSION,
    scenarioId: scenario.scenarioId,
    scenarioRevision: scenario.revision,
    currentSceneId: scenario.scenes[0].id,
    sceneVisits: { [scenario.scenes[0].id]: 1 },
    clues,
    discoveredAt: {},
    appliedActionIds: [],
    publicEvents: [],
    status: 'active',
    endingId: null,
    startedAt: now
  }
}

export function normalizeScenarioRun(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (Number(raw.version) !== ROLEPLAY_SCENARIO_SCHEMA_VERSION) return null
  const scenarioId = String(raw.scenarioId || '').trim()
  const scenarioRevision = String(raw.scenarioRevision || '').trim()
  const currentSceneId = String(raw.currentSceneId || '').trim()
  if (!scenarioId || !scenarioRevision || !currentSceneId) return null
  return {
    version: ROLEPLAY_SCENARIO_SCHEMA_VERSION,
    scenarioId,
    scenarioRevision,
    currentSceneId,
    sceneVisits: raw.sceneVisits && typeof raw.sceneVisits === 'object' ? { ...raw.sceneVisits } : {},
    clues: raw.clues && typeof raw.clues === 'object'
      ? Object.fromEntries(Object.entries(raw.clues).map(([id, v]) => [String(id), CLUE_VISIBILITIES.includes(v) ? v : 'locked']))
      : {},
    discoveredAt: raw.discoveredAt && typeof raw.discoveredAt === 'object' ? { ...raw.discoveredAt } : {},
    appliedActionIds: Array.isArray(raw.appliedActionIds) ? raw.appliedActionIds.map(String).slice(-500) : [],
    publicEvents: Array.isArray(raw.publicEvents) ? raw.publicEvents.slice(-100) : [],
    status: ['active', 'paused', 'ended'].includes(raw.status) ? raw.status : 'paused',
    endingId: raw.endingId ? String(raw.endingId) : null,
    startedAt: Number(raw.startedAt) || Date.now()
  }
}

/** 场景迁移（CX14）：移动到连接场景。重复进入计数累加，不重复发放任何东西。 */
export function moveScenarioRun(run, scenario, { toSceneId } = {}) {
  if (run.status !== 'active') {
    throw scenarioError('ROLEPLAY_SCENARIO_NOT_ACTIVE', run.status === 'ended' ? '本场冒险已结束' : '本场冒险已暂停')
  }
  const scene = scenario.scenes.find((item) => item.id === run.currentSceneId)
  const exit = scene?.exits.find((item) => item.toSceneId === toSceneId)
  if (!exit) {
    throw scenarioError('ROLEPLAY_SCENE_EXIT_INVALID', '当前场景没有通往该地点的路线')
  }
  // 进入新场景时把该场景的线索从 locked 提到 available（只提级，不直接 discovered）。
  run.currentSceneId = toSceneId
  run.sceneVisits[toSceneId] = (run.sceneVisits[toSceneId] || 0) + 1
  const enteredScene = scenario.scenes.find((item) => item.id === toSceneId)
  for (const clueId of enteredScene.clueIds || []) {
    if (run.clues[clueId] === 'locked') run.clues[clueId] = 'available'
  }
  // 移动本身可能满足结局的 requireSceneId（确定性判定）。
  maybeApplyEnding(run, scenario)
  return run
}

/**
 * 检定结算 → 场景效果（CX16/CX17）：success/partial 发现线索；failure 走
 * failForward（解锁替代线索并记录公开事件），绝不把失败记成发现。
 * 幂等：同 actionId 只应用一次；重复调用返回 applied:false。
 */
export function applyScenarioOutcome(run, scenario, { actionId, clueId, outcome, turnId = null, branchId = null, now = Date.now() } = {}) {
  if (run.status !== 'active') return { applied: false, reason: 'ROLEPLAY_SCENARIO_NOT_ACTIVE' }
  if (run.appliedActionIds.includes(actionId)) return { applied: false, reason: 'already-applied' }
  const clue = scenario.clues.find((item) => item.id === clueId)
  if (!clue) return { applied: false, reason: 'clue-not-found' }
  run.appliedActionIds.push(actionId)
  const events = []
  if (outcome === 'success' || outcome === 'partial') {
    if (run.clues[clue.id] !== 'discovered') {
      run.clues[clue.id] = 'discovered'
      run.discoveredAt[clue.id] = { turnId: turnId || now, branchId: branchId ? String(branchId) : null }
      events.push({ type: outcome === 'partial' ? 'clue-discovered-with-cost' : 'clue-discovered', clueId: clue.id, text: outcome === 'partial' ? `有代价地确认了「${clue.name}」` : `确认了「${clue.name}」` })
    }
  } else {
    // 失败前进：原线索保持未发现；有替代路线则开启，没有也如实记录受挫。
    // 受挫文本不携带未发现线索的名称（CX15：名称本身也是信息）。
    if (clue.failForward?.unlockClueId && run.clues[clue.failForward.unlockClueId] === 'locked') {
      run.clues[clue.failForward.unlockClueId] = 'available'
    }
    events.push({ type: 'setback', clueId: clue.id, text: clue.failForward?.eventText || '检查受挫，但局面继续推动' })
  }
  for (const event of events) {
    run.publicEvents.push({
      id: `evt_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      sourceScenarioId: scenario.scenarioId,
      sourceSceneId: run.currentSceneId,
      sourceActionId: actionId,
      clueId: event.clueId,
      branchId: branchId ? String(branchId) : null,
      turnId,
      visibleTo: 'player',
      createdAt: now,
      type: event.type,
      text: event.text
    })
  }
  maybeApplyEnding(run, scenario)
  return { applied: true, events: events.map((event) => event.type) }
}

/** 结局判定（CX17）：确定性条件（线索集合 + 场景），不由叙述宣称。 */
export function maybeApplyEnding(run, scenario) {
  if (run.status !== 'active') return null
  for (const ending of scenario.endings) {
    const cluesOk = ending.requireClueIds.every((id) => run.clues[id] === 'discovered')
    const sceneOk = !ending.requireSceneId || run.currentSceneId === ending.requireSceneId
    if (cluesOk && sceneOk) {
      run.status = 'ended'
      run.endingId = ending.id
      run.publicEvents.push({
        id: `evt_${Date.now().toString(36)}_end`,
        sourceScenarioId: scenario.scenarioId,
        sourceSceneId: run.currentSceneId,
        sourceActionId: null,
        turnId: null,
        visibleTo: 'player',
        createdAt: Date.now(),
        type: 'ending',
        text: `结局达成：${ending.label}`
      })
      return ending
    }
  }
  return null
}

/**
 * 玩家公开投影（CX15/G19）：只含 discovered 线索；未发现线索连名称/摘要/
 * 数量都不出现。paused/ended 状态如实呈现。这就是进入 UI 与模型 payload 的形态。
 */
export function buildScenarioPublicProjection(run, scenario) {
  if (!run || !scenario) return null
  const discoveredIds = Object.keys(run.clues).filter((id) => run.clues[id] === 'discovered')
  const scene = scenario.scenes.find((item) => item.id === run.currentSceneId) || null
  return {
    scenarioId: run.scenarioId,
    scenarioRevision: run.scenarioRevision,
    status: run.status,
    endingId: run.endingId,
    currentScene: scene
      ? { id: scene.id, title: scene.title, description: scene.description, exits: scene.exits.map((exit) => ({ toSceneId: exit.toSceneId, label: exit.label })) }
      : null,
    discoveredClues: discoveredIds.map((id) => {
      const clue = scenario.clues.find((item) => item.id === id)
      return { id, name: clue?.name || id, summary: clue?.summary || '' }
    }),
    availableSceneClueActions: run.status === 'active'
      ? (scene?.clueIds || [])
          .filter((id) => run.clues[id] === 'available')
          .map((id) => {
            const clue = scenario.clues.find((item) => item.id === id)
            return { clueId: id, actionText: clue.actionText, attribute: clue.attribute, modifier: clue.modifier }
          })
      : [],
    recentEvents: run.publicEvents.slice(-5).map((event) => ({ type: event.type, text: event.text }))
  }
}
