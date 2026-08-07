const DEFAULT_LIMIT = 2
const MAX_HOOKS = 4
const MAX_FACTIONS = 4
const MAX_PARTICIPANTS = 6
const MAX_CAUSAL_EVENTS = 2
const MAX_SOURCE_REFS = 8

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function uniqueStrings(values, limit = 20) {
  const seen = new Set()
  const result = []
  for (const value of values || []) {
    const normalized = normalizeText(value)
    const key = normalized.toLowerCase()
    if (!normalized || seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
    if (result.length >= limit) break
  }
  return result
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeSourceRef(ref) {
  if (!ref || typeof ref !== 'object') return null
  const id = normalizeText(ref.id)
  if (!id) return null
  return { type: normalizeText(ref.type) || 'runtime', id }
}

function uniqueSourceRefs(values, limit = MAX_SOURCE_REFS) {
  const seen = new Set()
  const result = []
  for (const value of values || []) {
    const ref = normalizeSourceRef(value)
    if (!ref) continue
    const key = `${ref.type}\u0000${ref.id}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(ref)
    if (result.length >= limit) break
  }
  return result
}

function stableHash(value) {
  let hash = 2166136261
  for (const character of String(value || '')) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
}

function resolvePlaceId({ geoHistoryContext, worldMapState, historyNode } = {}) {
  return normalizeText(
    worldMapState?.placeId
      || historyNode?.placeRef?.placeId
      || historyNode?.placeId
      || historyNode?.mapBinding?.placeId
      || geoHistoryContext?.placeIds?.[0]
  )
}

function resolvePlaceRef({ historyNode, placeId } = {}) {
  const raw = historyNode?.placeRef
  if (!raw && !placeId) return null
  return {
    ...(raw && typeof raw === 'object' ? raw : {}),
    ...(placeId ? { placeId } : {})
  }
}

function resolveLocation(worldMapState = {}, geoHistoryContext = {}) {
  const parts = [
    worldMapState.currentCountry,
    worldMapState.currentCity,
    worldMapState.currentScene
  ].map(normalizeText).filter(Boolean)
  if (parts.length > 0) return parts.join(' / ')
  return uniqueStrings(geoHistoryContext.locations || [], 1)[0] || ''
}

function buildSourceRefs({ geoHistoryContext, historyNode, placeId } = {}) {
  const refs = []
  const historyNodeId = normalizeText(historyNode?.id)
  if (historyNodeId) refs.push({ type: 'history-node', id: historyNodeId })
  if (placeId) refs.push({ type: 'place', id: placeId })
  for (const entryId of uniqueStrings(geoHistoryContext?.entryIds || [], 4)) {
    refs.push({ type: 'geo-history', id: entryId })
  }
  return uniqueSourceRefs(refs)
}

function describePlaceSignal(placeSignal) {
  if (!placeSignal) return ''
  const parts = []
  if (placeSignal.status) parts.push(placeSignal.status)
  if (placeSignal.controllerId) parts.push(`控制者 ${placeSignal.controllerId}`)
  if (placeSignal.danger != null) parts.push(`危险度 ${placeSignal.danger}`)
  if (placeSignal.activeEventIds.length > 0) parts.push(`近期确认变化 ${placeSignal.activeEventIds.length} 项`)
  return parts.join('，')
}

function describeCharacterSignal(characterSignal) {
  if (!characterSignal) return ''
  const subject = characterSignal.name || characterSignal.characterId
  const parts = [`${subject}的目标：${characterSignal.goal}`]
  if (characterSignal.status) parts.push(`状态 ${characterSignal.status}`)
  if (characterSignal.knowledgeRefs.length > 0) {
    parts.push(`关联已确认知识 ${characterSignal.knowledgeRefs.length} 项`)
  }
  if (characterSignal.relationRefs.length > 0) {
    parts.push(`关联已确认关系 ${characterSignal.relationRefs.length} 项`)
  }
  if (characterSignal.factRefs.length > 0) {
    parts.push(`关联 canonical fact ${characterSignal.factRefs.length} 项`)
  }
  return parts.join('，')
}

function buildReasons({
  location,
  hook,
  participants,
  factionName,
  relationScore,
  placeSignal,
  characterSignal
} = {}) {
  const reasons = []
  if (location) reasons.push(`当前地点：${location}`)
  if (hook) reasons.push(`未决线索：${hook}`)
  const characterReason = describeCharacterSignal(characterSignal)
  if (characterReason) reasons.push(characterReason)
  const placeReason = describePlaceSignal(placeSignal)
  if (placeReason) reasons.push(`地点状态：${placeReason}`)
  if (participants.length > 0) reasons.push(`已知参与者：${participants.join('、')}`)
  if (factionName) reasons.push(`已知阵营：${factionName}（关系 ${relationScore}）`)
  return reasons.slice(0, 4)
}

function currentPlaceSignal({
  placeId,
  placeStates,
  causalityContext
} = {}) {
  if (!placeId) return null
  const raw = record(placeStates)[placeId]
  if (!raw || typeof raw !== 'object') return null
  const conflicts = Array.isArray(causalityContext?.conflicts) ? causalityContext.conflicts : []
  const controlConflicted = conflicts.some((conflict) => (
    conflict?.code === 'place-control-conflict'
    && (!normalizeText(conflict.placeId) || normalizeText(conflict.placeId) === placeId)
  ))
  const staleIds = new Set((causalityContext?.staleEventIds || []).map(normalizeText).filter(Boolean))
  const activeEventIds = uniqueStrings(
    (causalityContext?.recentChanges || [])
      .filter((change) => (
        !change?.stale
        && !staleIds.has(normalizeText(change?.eventId))
        && (!normalizeText(change?.placeId) || normalizeText(change.placeId) === placeId)
        && (change?.changedPaths || []).some((path) => (
          path === 'placeStates'
          || path === 'characterStates'
          || path === 'characterRelations'
          || path === 'canonicalFacts'
          || path === 'writingTime'
        ))
      ))
      .map((change) => change.eventId),
    MAX_CAUSAL_EVENTS
  )
  const danger = Number(raw.danger)
  return {
    placeId,
    status: normalizeText(raw.status).slice(0, 80),
    controllerId: controlConflicted ? '' : normalizeText(raw.controllerId).slice(0, 120),
    danger: Number.isFinite(danger) ? Math.max(0, Math.min(100, danger)) : null,
    activeEventIds,
    controlConflicted
  }
}

function characterNameIndex(encounteredCharacters = []) {
  const result = new Map()
  for (const character of Array.isArray(encounteredCharacters) ? encounteredCharacters : []) {
    const id = normalizeText(character?.id)
    const name = normalizeText(character?.name || character)
    if (id && name) result.set(id, name)
  }
  return result
}

function collectCharacterSignals({
  characterStates,
  encounteredCharacters,
  placeId,
  causalityContext
} = {}) {
  const names = characterNameIndex(encounteredCharacters)
  const conflictedIds = new Set((causalityContext?.conflicts || [])
    .filter((conflict) => conflict?.code === 'character-state-conflict')
    .map((conflict) => normalizeText(conflict.characterId))
    .filter(Boolean))
  const result = []
  for (const [rawCharacterId, rawState] of Object.entries(record(characterStates))) {
    const characterId = normalizeText(rawCharacterId)
    const state = record(rawState)
    const goal = normalizeText(state.goal).slice(0, 120)
    const statePlaceId = normalizeText(state.placeId)
    if (!characterId || !goal || state.alive === false || conflictedIds.has(characterId)) continue
    if (placeId && statePlaceId && statePlaceId !== placeId) continue
    result.push({
      characterId,
      name: names.get(characterId) || '',
      status: normalizeText(state.status).slice(0, 80),
      placeId: statePlaceId,
      goal,
      knowledgeRefs: uniqueStrings(state.knowledgeRefs || [], 4),
      relationRefs: uniqueStrings(
        (causalityContext?.relationships || [])
          .filter((relation) => (
            normalizeText(relation?.subjectId) === characterId
            || normalizeText(relation?.objectId) === characterId
          ))
          .map((relation) => relation.relationId),
        4
      ),
      factRefs: uniqueStrings(
        (causalityContext?.canonicalFacts || [])
          .filter((fact) => normalizeText(fact?.subjectId) === characterId)
          .map((fact) => fact.factId),
        4
      )
    })
    if (result.length >= MAX_PARTICIPANTS) break
  }
  return result
}

function findCharacterSignal(hook, characterSignals) {
  const key = normalizeText(hook).toLowerCase()
  return characterSignals.find((signal) => signal.goal.toLowerCase() === key) || null
}

function placePressureScore(placeSignal) {
  if (!placeSignal) return 0
  let score = 0
  if (placeSignal.status) score += 2
  if (placeSignal.controllerId) score += 2
  if (placeSignal.danger >= 70) score += 6
  else if (placeSignal.danger >= 40) score += 3
  score += Math.min(4, placeSignal.activeEventIds.length * 2)
  if (placeSignal.controlConflicted) score -= 3
  return score
}

function buildCandidateSourceRefs({
  baseSourceRefs,
  placeId,
  placeSignal,
  characterSignal
} = {}) {
  return uniqueSourceRefs([
    ...(baseSourceRefs || []).slice(0, 3),
    ...(placeId ? [{ type: 'place', id: placeId }] : []),
    ...(characterSignal ? [{ type: 'character', id: characterSignal.characterId }] : []),
    ...(characterSignal?.knowledgeRefs || []).slice(0, 1).map((id) => ({
      type: 'character-knowledge',
      id
    })),
    ...(characterSignal?.relationRefs || []).slice(0, 1).map((id) => ({
      type: 'character-relation',
      id
    })),
    ...(characterSignal?.factRefs || []).slice(0, 1).map((id) => ({
      type: 'canonical-fact',
      id
    })),
    ...(placeSignal?.activeEventIds || []).map((id) => ({ type: 'runtime-event', id }))
  ])
}

function buildCausalState({ placeSignal, characterSignal, conflicts = [] } = {}) {
  return {
    place: placeSignal
      ? {
          placeId: placeSignal.placeId,
          status: placeSignal.status,
          controllerId: placeSignal.controllerId,
          danger: placeSignal.danger
        }
      : null,
    character: characterSignal
      ? {
          characterId: characterSignal.characterId,
          name: characterSignal.name,
          status: characterSignal.status,
          goal: characterSignal.goal,
          knowledgeRefs: characterSignal.knowledgeRefs,
          relationRefs: characterSignal.relationRefs,
          factRefs: characterSignal.factRefs
        }
      : null,
    activeEventIds: placeSignal?.activeEventIds || [],
    blockedConflictCodes: uniqueStrings((conflicts || []).map((conflict) => conflict?.code), 6)
  }
}

function candidateId(type, placeId, subject) {
  return `emergence_${type}_${stableHash([placeId, subject].join('|'))}`
}

function makeHookCandidate({
  hook,
  placeId,
  placeRef,
  location,
  participants,
  baseSourceRefs,
  goalTitles,
  characterSignals,
  placeSignal,
  conflicts,
  now
}) {
  const characterSignal = findCharacterSignal(hook, characterSignals)
  const isGoal = Boolean(characterSignal) || goalTitles.some((title) => title === hook)
  const candidateParticipants = uniqueStrings([
    ...(characterSignal?.name ? [characterSignal.name] : []),
    ...participants
  ], MAX_PARTICIPANTS)
  const reasons = buildReasons({
    location,
    hook,
    participants: candidateParticipants,
    placeSignal,
    characterSignal
  })
  const sourceRefs = buildCandidateSourceRefs({
    baseSourceRefs,
    placeId,
    placeSignal,
    characterSignal
  })
  return {
    id: candidateId('history-hook', placeId, hook),
    type: isGoal ? 'goal-pressure' : 'history-hook',
    status: 'candidate',
    title: characterSignal
      ? '角色目标的后续压力'
      : (isGoal ? '未完成目标的后续压力' : '未决历史线索的回响'),
    summary: location
      ? `在${location}继续处理“${hook}”，事件必须从已知线索和参与者中展开。`
      : `继续处理“${hook}”，事件必须从已知历史线索中展开。`,
    hook,
    placeId,
    placeRef,
    participants: candidateParticipants,
    sourceRefs,
    reasons,
    causalState: buildCausalState({ placeSignal, characterSignal, conflicts }),
    score: clampScore(
      (isGoal ? 6 : 10)
      + (placeId ? 4 : 0)
      + (candidateParticipants.length ? 2 : 0)
      + (isGoal ? 2 : 0)
      + placePressureScore(placeSignal)
      + (characterSignal ? 5 + Math.min(3, characterSignal.knowledgeRefs.length) : 0)
    ),
    createdAt: now
  }
}

function makeFactionCandidate({
  factionName,
  relationScore,
  placeId,
  placeRef,
  location,
  participants,
  baseSourceRefs,
  placeSignal,
  conflicts,
  now
}) {
  const direction = relationScore < 0 ? '施压或阻断' : '提出合作或索取回报'
  const sourceRefs = buildCandidateSourceRefs({ baseSourceRefs, placeId, placeSignal })
  return {
    id: candidateId('faction-pressure', placeId, factionName),
    type: 'faction-pressure',
    status: 'candidate',
    title: '已知阵营关系变化',
    summary: `${factionName}当前关系值为 ${relationScore}，更可能在${location || '当前地点'}${direction}，不引入新的陌生角色。`,
    factionName,
    relationScore,
    placeId,
    placeRef,
    participants,
    sourceRefs,
    reasons: buildReasons({
      location,
      participants,
      factionName,
      relationScore,
      placeSignal
    }),
    causalState: buildCausalState({ placeSignal, conflicts }),
    score: clampScore(
      5
      + Math.min(8, Math.abs(relationScore) / 5)
      + (placeId ? 4 : 0)
      + (participants.length ? 1 : 0)
      + placePressureScore(placeSignal)
    ),
    createdAt: now
  }
}

function collectGoalTitles(goals) {
  return uniqueStrings(
    (Array.isArray(goals) ? goals : [])
      .filter((goal) => normalizeText(goal?.status || 'active') !== 'completed')
      .map((goal) => goal?.title || goal?.label || goal),
    MAX_HOOKS
  )
}

/**
 * Collect explainable event candidates from current geo-history signals.
 * This function never selects an actor, place, or event outside the supplied
 * runtime/worldbook context and never uses random values.
 */
export function buildEmergenceCandidates({
  geoHistoryContext = null,
  worldMapState = {},
  historyNode = null,
  plotJournal = [],
  goals = [],
  encounteredCharacters = [],
  placeStates = {},
  characterStates = {},
  factionRelations = {},
  causalityContext = null,
  now = Date.now(),
  limit = DEFAULT_LIMIT,
  dismissedIds = []
} = {}) {
  const context = geoHistoryContext && typeof geoHistoryContext === 'object' ? geoHistoryContext : {}
  const placeId = resolvePlaceId({ geoHistoryContext: context, worldMapState, historyNode })
  const placeRef = resolvePlaceRef({ historyNode, placeId })
  const location = resolveLocation(worldMapState, context)
  const conflicts = Array.isArray(causalityContext?.conflicts) ? causalityContext.conflicts : []
  const placeSignal = currentPlaceSignal({
    placeId,
    placeStates,
    causalityContext
  })
  const characterSignals = collectCharacterSignals({
    characterStates,
    encounteredCharacters,
    placeId,
    causalityContext
  })
  const participants = uniqueStrings([
    ...(context.participants || []),
    ...(Array.isArray(encounteredCharacters) ? encounteredCharacters.map((item) => item?.name || item) : []),
    ...characterSignals.map((signal) => signal.name).filter(Boolean)
  ], MAX_PARTICIPANTS)
  const goalTitles = collectGoalTitles(goals)
  const journalHooks = Array.isArray(plotJournal)
    ? plotJournal.slice(-3).flatMap((entry) => entry?.unresolvedHooks || [])
    : []
  const hooks = uniqueStrings([
    ...(context.unresolvedHooks || []),
    ...journalHooks,
    ...goalTitles,
    ...characterSignals.map((signal) => signal.goal)
  ], MAX_HOOKS)
  const baseSourceRefs = buildSourceRefs({ geoHistoryContext: context, historyNode, placeId })
  const dismissed = new Set((dismissedIds || []).map(normalizeText).filter(Boolean))
  const candidates = []

  for (const hook of hooks) {
    const candidate = makeHookCandidate({
      hook,
      placeId,
      placeRef,
      location,
      participants,
      baseSourceRefs,
      goalTitles,
      characterSignals,
      placeSignal,
      conflicts,
      now
    })
    if (!dismissed.has(candidate.id)) candidates.push(candidate)
  }

  for (const [factionName, rawScore] of Object.entries(factionRelations || {}).slice(0, MAX_FACTIONS)) {
    const normalizedName = normalizeText(factionName)
    const relationScore = Math.max(-100, Math.min(100, Math.round(Number(rawScore) || 0)))
    if (!normalizedName || Math.abs(relationScore) < 12) continue
    const candidate = makeFactionCandidate({
      factionName: normalizedName,
      relationScore,
      placeId,
      placeRef,
      location,
      participants,
      baseSourceRefs,
      placeSignal,
      conflicts,
      now
    })
    if (!dismissed.has(candidate.id)) candidates.push(candidate)
  }

  return selectEmergenceCandidates(candidates, { limit })
}

export function selectEmergenceCandidates(candidates = [], { limit = DEFAULT_LIMIT, dismissedIds = [] } = {}) {
  const dismissed = new Set((dismissedIds || []).map(normalizeText).filter(Boolean))
  const max = Math.max(0, Math.min(DEFAULT_LIMIT, Math.floor(Number(limit) || DEFAULT_LIMIT)))
  const priority = { 'history-hook': 3, 'goal-pressure': 3, 'faction-pressure': 2 }
  return (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate?.status === 'candidate' && candidate?.id && !dismissed.has(candidate.id))
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)
      || (priority[b.type] || 0) - (priority[a.type] || 0)
      || String(a.id).localeCompare(String(b.id)))
    .slice(0, max)
}

export default { buildEmergenceCandidates, selectEmergenceCandidates }
