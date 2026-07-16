const DEFAULT_LIMIT = 2
const MAX_HOOKS = 4
const MAX_FACTIONS = 4
const MAX_PARTICIPANTS = 6

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
  for (const entryId of uniqueStrings(geoHistoryContext?.entryIds || [], 4)) {
    refs.push({ type: 'geo-history', id: entryId })
  }
  const historyNodeId = normalizeText(historyNode?.id)
  if (historyNodeId) refs.push({ type: 'history-node', id: historyNodeId })
  if (refs.length === 0 && placeId) refs.push({ type: 'place', id: placeId })
  return refs.slice(0, 6)
}

function buildReasons({ location, hook, participants, factionName, relationScore } = {}) {
  const reasons = []
  if (location) reasons.push(`当前地点：${location}`)
  if (hook) reasons.push(`未决线索：${hook}`)
  if (participants.length > 0) reasons.push(`已知参与者：${participants.join('、')}`)
  if (factionName) reasons.push(`已知阵营：${factionName}（关系 ${relationScore}）`)
  return reasons.slice(0, 4)
}

function candidateId(type, placeId, subject) {
  return `emergence_${type}_${stableHash([placeId, subject].join('|'))}`
}

function makeHookCandidate({ hook, placeId, placeRef, location, participants, sourceRefs, goalTitles, now }) {
  const isGoal = goalTitles.some((title) => title === hook)
  const reasons = buildReasons({ location, hook, participants })
  return {
    id: candidateId('history-hook', placeId, hook),
    type: isGoal ? 'goal-pressure' : 'history-hook',
    status: 'candidate',
    title: isGoal ? '未完成目标的后续压力' : '未决历史线索的回响',
    summary: location
      ? `在${location}继续处理“${hook}”，事件必须从已知线索和参与者中展开。`
      : `继续处理“${hook}”，事件必须从已知历史线索中展开。`,
    hook,
    placeId,
    placeRef,
    participants,
    sourceRefs,
    reasons,
    score: clampScore((isGoal ? 6 : 10) + (placeId ? 4 : 0) + (participants.length ? 2 : 0) + (isGoal ? 2 : 0)),
    createdAt: now
  }
}

function makeFactionCandidate({ factionName, relationScore, placeId, placeRef, location, participants, sourceRefs, now }) {
  const direction = relationScore < 0 ? '施压或阻断' : '提出合作或索取回报'
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
    reasons: buildReasons({ location, participants, factionName, relationScore }),
    score: clampScore(5 + Math.min(8, Math.abs(relationScore) / 5) + (placeId ? 4 : 0) + (participants.length ? 1 : 0)),
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
  factionRelations = {},
  now = Date.now(),
  limit = DEFAULT_LIMIT,
  dismissedIds = []
} = {}) {
  const context = geoHistoryContext && typeof geoHistoryContext === 'object' ? geoHistoryContext : {}
  const placeId = resolvePlaceId({ geoHistoryContext: context, worldMapState, historyNode })
  const placeRef = resolvePlaceRef({ historyNode, placeId })
  const location = resolveLocation(worldMapState, context)
  const participants = uniqueStrings([
    ...(context.participants || []),
    ...(Array.isArray(encounteredCharacters) ? encounteredCharacters.map((item) => item?.name || item) : [])
  ], MAX_PARTICIPANTS)
  const goalTitles = collectGoalTitles(goals)
  const journalHooks = Array.isArray(plotJournal)
    ? plotJournal.slice(-3).flatMap((entry) => entry?.unresolvedHooks || [])
    : []
  const hooks = uniqueStrings([
    ...(context.unresolvedHooks || []),
    ...journalHooks,
    ...goalTitles
  ], MAX_HOOKS)
  const sourceRefs = buildSourceRefs({ geoHistoryContext: context, historyNode, placeId })
  const dismissed = new Set((dismissedIds || []).map(normalizeText).filter(Boolean))
  const candidates = []

  for (const hook of hooks) {
    const candidate = makeHookCandidate({
      hook,
      placeId,
      placeRef,
      location,
      participants,
      sourceRefs,
      goalTitles,
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
      sourceRefs,
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
