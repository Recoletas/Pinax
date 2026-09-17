// Experience 会话/存档的纯规范化域： adventure/runtime snapshot 中的角色、地点、
// 关系、facts、goals、journal、候选与回合快照的 normalize/serialize/clone。
// 从 gameStore.js 原样迁出（B1）：无 Vue/Pinia/DOM/storage 依赖，同一输入
// 迁移前后必须得到等价结果；旧值默认与未知字段策略保持原合同。
import { buildHeuristicContextSummary } from '../contextCompression.js'
import { parseCharacterCards } from '../characterCard.js'
import { validateStateDelta } from './runtimeEvents.js'


// B10：仅本模块消费的 helper 不再导出（PLOT_JOURNAL_MAX_SUMMARY_CHARS、
// buildStableRuntimeId、normalizeAdventureTriggerShot/State、
// normalizeEmergenceCausalState/Event）；出现真实消费者时再显式导出。

export const DEFAULT_WORLD_MAP_STATE = {
  map: { countries: [] },
  currentCountry: '',
  currentCity: '',
  currentScene: '',
  placeId: ''
}

export const DEFAULT_WRITING_CHARACTER = {
  name: 'User',
  gender: '',
  age: '',
  traits: [],
  mood: 50,
  description: '',
  goal: ''
}

export const DEFAULT_WRITING_TIME = {
  eraId: 'custom',
  eraName: '',
  year: '',
  month: '',
  day: ''
}

export const DEFAULT_ADVENTURE_STATE = {
  goals: [],
  encounteredCharacters: [],
  factionRelations: {},
  keyChoices: [],
  plotJournal: [],
  adventureTriggers: {
    prose: null,
    storyboard: null
  },
  adventureTriggerHistory: [],
  emergenceCandidates: [],
  emergenceDismissedIds: []
}

export const PLOT_JOURNAL_TURN_INTERVAL = 8
const PLOT_JOURNAL_MAX_SUMMARY_CHARS = 420
export const ADVENTURE_TRIGGER_COOLDOWN_MS = 3000
export const ADVENTURE_TRIGGER_WINDOW_MS = 60 * 1000
export const ADVENTURE_TRIGGER_MAX_PER_WINDOW = 2

export function normalizeTextValue(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

// C4：同消息续接 —— 合并 base 与新增 parsed 正文，保留 blocks 避免 marker 接缝。
export function combineExtensionContent(extensionBase, newParsed) {
  if (!extensionBase) return { content: newParsed.content, presentation: newParsed }
  const baseBlocks = Array.isArray(extensionBase.presentation?.blocks)
    ? extensionBase.presentation.blocks
    : []
  const content = [extensionBase.content, newParsed.content]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join('\n\n')
  return {
    content,
    presentation: {
      version: 3,
      source: 'model-structured',
      status: 'complete',
      content,
      blocks: [...baseBlocks, ...(newParsed.blocks || [])],
      hasMarkers: baseBlocks.length > 0 || newParsed.hasMarkers === true
    }
  }
}

function buildStableRuntimeId(prefix, value, fallback = 'item') {
  const token = normalizeTextValue(value).slice(0, 24) || fallback
  return `${prefix}_${token}`
}

export function normalizeNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

export function compactPlotJournalSummary(messages = []) {
  const structuredSummary = buildHeuristicContextSummary(messages, {
    maxSummaryChars: PLOT_JOURNAL_MAX_SUMMARY_CHARS
  })
  const sections = structuredSummary
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  let currentSection = ''
  const plotEvents = []
  const playerActions = []
  const unresolved = []

  for (const line of sections) {
    const headingMatch = line.match(/^【(.+?)】$/)
    if (headingMatch) {
      currentSection = headingMatch[1]
      continue
    }
    if (!line.startsWith('- ')) continue
    const content = normalizeTextValue(line.slice(2))
    if (!content) continue

    if (currentSection === '剧情进展') {
      plotEvents.push(content)
    } else if (currentSection === '玩家意图/行动') {
      playerActions.push(content)
    } else if (currentSection === '未解决线索') {
      unresolved.push(content)
    }
  }

  const parts = []
  if (plotEvents.length > 0) {
    parts.push(`剧情：${plotEvents.slice(0, 3).join('；')}`)
  }
  if (playerActions.length > 0) {
    parts.push(`行动：${playerActions.slice(-2).join('；')}`)
  }
  if (unresolved.length > 0) {
    parts.push(`未决：${unresolved.slice(0, 2).join('；')}`)
  }

  const compact = normalizeTextValue(parts.join(' '))
  if (compact) {
    return compact.length > PLOT_JOURNAL_MAX_SUMMARY_CHARS
      ? `${compact.slice(0, PLOT_JOURNAL_MAX_SUMMARY_CHARS - 1)}…`
      : compact
  }

  return normalizeTextValue(structuredSummary).slice(0, PLOT_JOURNAL_MAX_SUMMARY_CHARS)
}

export function normalizeWorldMapState(raw = {}) {
  const map = raw && typeof raw.map === 'object' ? raw.map : { countries: [] }
  return {
    map: {
      ...map,
      countries: Array.isArray(map.countries) ? map.countries : []
    },
    currentCountry: raw?.currentCountry || '',
    currentCity: raw?.currentCity || '',
    currentScene: raw?.currentScene || '',
    placeId: raw?.placeId || ''
  }
}

export function normalizeWritingCharacter(raw = {}) {
  return {
    ...DEFAULT_WRITING_CHARACTER,
    ...(raw && typeof raw === 'object' ? raw : {}),
    traits: Array.isArray(raw?.traits) ? raw.traits : []
  }
}

export function normalizeWritingTime(raw = {}) {
  return {
    ...DEFAULT_WRITING_TIME,
    ...(raw && typeof raw === 'object' ? raw : {})
  }
}

export function normalizePlaceStates(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(Object.entries(raw).slice(0, 64).map(([placeId, state]) => {
    const id = normalizeTextValue(placeId)
    if (!id || !state || typeof state !== 'object' || Array.isArray(state)) return null
    const danger = Number(state.danger)
    return [id, {
      status: normalizeTextValue(state.status),
      controllerId: normalizeTextValue(state.controllerId),
      ...(Number.isFinite(danger) ? { danger: Math.max(0, Math.min(100, danger)) } : {})
    }]
  }).filter(Boolean))
}

export function normalizeCharacterStates(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(Object.entries(raw).slice(0, 64).map(([characterId, state]) => {
    const id = normalizeTextValue(characterId)
    if (!id || !state || typeof state !== 'object' || Array.isArray(state)) return null
    const mood = Number(state.mood)
    return [id, {
      status: normalizeTextValue(state.status),
      ...(typeof state.alive === 'boolean' ? { alive: state.alive } : {}),
      placeId: normalizeTextValue(state.placeId),
      goal: normalizeTextValue(state.goal),
      ...(Number.isFinite(mood) ? { mood: Math.max(0, Math.min(100, mood)) } : {}),
      knowledgeRefs: Array.isArray(state.knowledgeRefs)
        ? state.knowledgeRefs.map(normalizeTextValue).filter(Boolean).slice(0, 24)
        : []
    }]
  }).filter(Boolean))
}

export const CHARACTER_RELATION_KINDS = new Set([
  'parent',
  'child',
  'sibling',
  'spouse',
  'grandparent',
  'grandchild',
  'guardian',
  'ward',
  'adoptive-parent',
  'adoptive-child'
])

export function normalizeCharacterRelations(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(Object.entries(raw).slice(0, 64).map(([relationId, relation]) => {
    const id = normalizeTextValue(relationId)
    const subjectId = normalizeTextValue(relation?.subjectId).slice(0, 120)
    const objectId = normalizeTextValue(relation?.objectId).slice(0, 120)
    const kind = normalizeTextValue(relation?.kind)
    if (!id || !subjectId || !objectId || !CHARACTER_RELATION_KINDS.has(kind)) return null
    const status = ['confirmed', 'disputed', 'ended'].includes(relation?.status)
      ? relation.status
      : 'confirmed'
    return [id, {
      subjectId,
      objectId,
      kind,
      status,
      sourceRefs: Array.isArray(relation?.sourceRefs)
        ? relation.sourceRefs
          .filter((ref) => typeof ref === 'string')
          .map(normalizeTextValue)
          .filter(Boolean)
          .slice(0, 8)
        : []
    }]
  }).filter(Boolean))
}

export function normalizeCanonicalFacts(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(Object.entries(raw).slice(0, 96).map(([factId, fact]) => {
    const id = normalizeTextValue(factId)
    const subjectId = normalizeTextValue(fact?.subjectId).slice(0, 120)
    const predicate = normalizeTextValue(fact?.predicate).slice(0, 120)
    const value = fact?.value
    const validValue = (
      value === null
      || (typeof value === 'number' && Number.isFinite(value))
      || typeof value === 'boolean'
      || typeof value === 'string'
    )
    if (!id || !subjectId || !predicate || !validValue) return null
    const confidence = Number(fact?.confidence)
    return [id, {
      subjectId,
      predicate,
      value: typeof value === 'string' ? value.slice(0, 240) : value,
      status: ['confirmed', 'disputed', 'retired'].includes(fact?.status)
        ? fact.status
        : 'confirmed',
      ...(Number.isFinite(confidence)
        ? { confidence: Math.max(0, Math.min(1, confidence)) }
        : {}),
      sourceRefs: Array.isArray(fact?.sourceRefs)
        ? fact.sourceRefs
          .filter((ref) => typeof ref === 'string')
          .map(normalizeTextValue)
          .filter(Boolean)
          .slice(0, 8)
        : []
    }]
  }).filter(Boolean))
}

export function normalizeGoals(raw = []) {
  if (!Array.isArray(raw)) return []

  const seen = new Set()
  const goals = []

  for (const item of raw) {
    const title = normalizeTextValue(item?.title || item?.label || item)
    if (!title || seen.has(title)) continue
    seen.add(title)
    goals.push({
      id: normalizeTextValue(item?.id) || buildStableRuntimeId('goal', title, 'goal'),
      title,
      status: normalizeTextValue(item?.status) || 'active',
      source: normalizeTextValue(item?.source) || 'runtime',
      updatedAt: Number(item?.updatedAt || item?.createdAt || Date.now())
    })
  }

  return goals.slice(0, 6)
}

export function normalizeEncounteredCharacters(raw = []) {
  if (!Array.isArray(raw)) return []

  const seen = new Set()
  const characters = []

  for (const item of raw) {
    const name = normalizeTextValue(item?.name || item)
    if (!name || seen.has(name)) continue
    seen.add(name)
    characters.push({
      id: normalizeTextValue(item?.id) || buildStableRuntimeId('char', name, 'character'),
      name,
      gender: normalizeTextValue(item?.gender),
      age: normalizeTextValue(item?.age),
      traits: Array.isArray(item?.traits)
        ? item.traits.map(normalizeTextValue).filter(Boolean).slice(0, 12)
        : [],
      description: normalizeTextValue(item?.description),
      goal: normalizeTextValue(item?.goal),
      source: normalizeTextValue(item?.source) || 'runtime',
      firstSeenAt: Number(item?.firstSeenAt || item?.lastSeenAt || Date.now()),
      lastSeenAt: Number(item?.lastSeenAt || item?.firstSeenAt || Date.now())
    })
  }

  return characters.slice(0, 12)
}

export function normalizeFactionRelations(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  return Object.entries(raw).reduce((acc, [key, value]) => {
    const name = normalizeTextValue(key)
    const numeric = Number(value)
    if (!name || !Number.isFinite(numeric)) return acc
    acc[name] = Math.max(-100, Math.min(100, Math.round(numeric)))
    return acc
  }, {})
}

export function normalizeKeyChoices(raw = []) {
  if (!Array.isArray(raw)) return []

  const seen = new Set()
  const choices = []

  for (const item of raw) {
    const label = normalizeTextValue(item?.label || item?.title || item?.detail || item)
    if (!label || seen.has(label)) continue
    seen.add(label)
    choices.push({
      id: normalizeTextValue(item?.id) || buildStableRuntimeId('choice', label, 'choice'),
      label,
      source: normalizeTextValue(item?.source) || 'runtime',
      createdAt: Number(item?.createdAt || item?.updatedAt || Date.now())
    })
  }

  return choices.slice(-10)
}

export function normalizePlotJournal(raw = []) {
  if (!Array.isArray(raw)) return []

  return raw
    .map((item, index) => {
      const summary = normalizeTextValue(item?.summary || item?.content || '')
      if (!summary) return null
      return {
        id: normalizeTextValue(item?.id) || buildStableRuntimeId('journal', item?.chapterId || String(index + 1), 'journal'),
        chapterId: normalizeTextValue(item?.chapterId || `chapter-${index + 1}`),
        summary,
        participants: Array.isArray(item?.participants) ? item.participants.map(normalizeTextValue).filter(Boolean) : [],
        locations: Array.isArray(item?.locations) ? item.locations.map(normalizeTextValue).filter(Boolean) : [],
        keyChoices: Array.isArray(item?.keyChoices) ? item.keyChoices.map(normalizeTextValue).filter(Boolean) : [],
        unresolvedHooks: Array.isArray(item?.unresolvedHooks) ? item.unresolvedHooks.map(normalizeTextValue).filter(Boolean) : [],
        sourceMessageIds: Array.isArray(item?.sourceMessageIds) ? item.sourceMessageIds : [],
        sourceStartIndex: normalizeNumber(item?.sourceStartIndex, 0),
        sourceEndIndex: normalizeNumber(item?.sourceEndIndex, 0),
        createdAt: normalizeNumber(item?.createdAt, Date.now())
      }
    })
    .filter(Boolean)
    .slice(-8)
}

function normalizeAdventureTriggerShot(raw = {}, index = 0) {
  const shotType = normalizeTextValue(raw?.shotType || raw?.shotSize || 'medium')
  const cameraMovement = normalizeTextValue(raw?.cameraMovement || raw?.camera || 'fixed')
  return {
    shotId: normalizeTextValue(raw?.shotId || String(index + 1)) || String(index + 1),
    sequence: normalizeNumber(raw?.sequence, index + 1),
    sourceText: normalizeTextValue(raw?.sourceText || raw?.content || ''),
    content: normalizeTextValue(raw?.content || raw?.sourceText || ''),
    shotType: shotType || 'medium',
    shotSize: shotType || 'medium',
    cameraMovement: cameraMovement || 'fixed',
    camera: cameraMovement || 'fixed',
    duration: Math.max(1, normalizeNumber(raw?.duration, 3)),
    visual: normalizeTextValue(raw?.visual || raw?.tone || ''),
    dialogue: normalizeTextValue(raw?.dialogue || ''),
    sound: normalizeTextValue(raw?.sound || ''),
    transition: normalizeTextValue(raw?.transition || 'cut') || 'cut',
    notes: normalizeTextValue(raw?.notes || ''),
    emotion: normalizeTextValue(raw?.emotion || ''),
    scene: normalizeTextValue(raw?.scene || '')
  }
}

export function normalizeAdventureTriggerDraft(raw = null, type = 'prose') {
  if (!raw || typeof raw !== 'object') return null

  const normalizedType = type === 'storyboard' ? 'storyboard' : 'prose'
  const status = normalizeTextValue(raw?.status || 'ready') || 'ready'
  const draft = {
    type: normalizedType,
    chapterId: normalizeTextValue(raw?.chapterId || ''),
    sourcePlotId: normalizeTextValue(raw?.sourcePlotId || raw?.chapterId || ''),
    title: normalizeTextValue(raw?.title || ''),
    summary: normalizeTextValue(raw?.summary || ''),
    error: normalizeTextValue(raw?.error || ''),
    assetId: normalizeTextValue(raw?.assetId || ''),
    storyboardDocumentId: normalizeTextValue(raw?.storyboardDocumentId || ''),
    storyboardVersionId: normalizeTextValue(raw?.storyboardVersionId || ''),
    generatedAt: normalizeNumber(raw?.generatedAt, 0),
    updatedAt: normalizeNumber(raw?.updatedAt, Date.now()),
    acceptedAt: normalizeNumber(raw?.acceptedAt, 0),
    status: ['generating', 'ready', 'accepted', 'error'].includes(status) ? status : 'ready',
    sourceMessageIds: Array.isArray(raw?.sourceMessageIds) ? raw.sourceMessageIds : []
  }

  if (normalizedType === 'storyboard') {
    draft.shots = Array.isArray(raw?.shots)
      ? raw.shots.map((shot, index) => normalizeAdventureTriggerShot(shot, index)).filter((shot) => shot.sourceText || shot.content)
      : []
  } else {
    draft.content = normalizeTextValue(raw?.content || '')
  }

  return draft
}

export function normalizeAdventureTriggerHistory(raw = []) {
  if (!Array.isArray(raw)) return []

  return raw
    .map((item) => {
      const createdAt = normalizeNumber(item?.createdAt, 0)
      if (!createdAt) return null
      const type = normalizeTextValue(item?.type || '')
      return {
        type: type === 'storyboard' ? 'storyboard' : 'prose',
        createdAt
      }
    })
    .filter(Boolean)
    .slice(-12)
}

function normalizeAdventureTriggersState(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    prose: normalizeAdventureTriggerDraft(source?.prose, 'prose'),
    storyboard: normalizeAdventureTriggerDraft(source?.storyboard, 'storyboard')
  }
}

function normalizeEmergenceCausalState(raw = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const place = raw.place && typeof raw.place === 'object' && !Array.isArray(raw.place)
    ? {
        placeId: normalizeTextValue(raw.place.placeId),
        status: normalizeTextValue(raw.place.status).slice(0, 80),
        controllerId: normalizeTextValue(raw.place.controllerId).slice(0, 120),
        danger: Number.isFinite(Number(raw.place.danger))
          ? Math.max(0, Math.min(100, Number(raw.place.danger)))
          : null
      }
    : null
  const character = raw.character && typeof raw.character === 'object' && !Array.isArray(raw.character)
    ? {
        characterId: normalizeTextValue(raw.character.characterId),
        name: normalizeTextValue(raw.character.name).slice(0, 80),
        status: normalizeTextValue(raw.character.status).slice(0, 80),
        goal: normalizeTextValue(raw.character.goal).slice(0, 120),
        knowledgeRefs: Array.isArray(raw.character.knowledgeRefs)
          ? raw.character.knowledgeRefs.map(normalizeTextValue).filter(Boolean).slice(0, 4)
          : [],
        relationRefs: Array.isArray(raw.character.relationRefs)
          ? raw.character.relationRefs.map(normalizeTextValue).filter(Boolean).slice(0, 4)
          : [],
        factRefs: Array.isArray(raw.character.factRefs)
          ? raw.character.factRefs.map(normalizeTextValue).filter(Boolean).slice(0, 4)
          : []
      }
    : null
  return {
    place,
    character,
    activeEventIds: Array.isArray(raw.activeEventIds)
      ? raw.activeEventIds.map(normalizeTextValue).filter(Boolean).slice(0, 2)
      : [],
    blockedConflictCodes: Array.isArray(raw.blockedConflictCodes)
      ? raw.blockedConflictCodes.map(normalizeTextValue).filter(Boolean).slice(0, 6)
      : []
  }
}

export function normalizeEmergenceCandidates(raw = []) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((candidate) => {
      const id = normalizeTextValue(candidate?.id)
      const summary = normalizeTextValue(candidate?.summary)
      if (!id || !summary) return null
      return {
        ...candidate,
        id,
        type: ['history-hook', 'goal-pressure', 'faction-pressure'].includes(candidate?.type)
          ? candidate.type
          : 'history-hook',
        status: 'candidate',
        title: normalizeTextValue(candidate?.title) || '待确认的剧情候选',
        summary: summary.slice(0, 260),
        hook: normalizeTextValue(candidate?.hook),
        factionName: normalizeTextValue(candidate?.factionName),
        placeId: normalizeTextValue(candidate?.placeId),
        participants: Array.isArray(candidate?.participants)
          ? candidate.participants.map(normalizeTextValue).filter(Boolean).slice(0, 6)
          : [],
        reasons: Array.isArray(candidate?.reasons)
          ? candidate.reasons.map(normalizeTextValue).filter(Boolean).slice(0, 4)
          : [],
        sourceRefs: Array.isArray(candidate?.sourceRefs)
          ? candidate.sourceRefs
            .filter((ref) => ref && typeof ref === 'object' && normalizeTextValue(ref.id))
            .map((ref) => ({ type: normalizeTextValue(ref.type) || 'runtime', id: normalizeTextValue(ref.id) }))
            .slice(0, 8)
          : [],
        causalState: normalizeEmergenceCausalState(candidate?.causalState),
        score: Math.max(0, Math.min(100, Math.round(Number(candidate?.score) || 0))),
        createdAt: normalizeNumber(candidate?.createdAt, Date.now())
      }
    })
    .filter(Boolean)
    .slice(0, 2)
}

export function normalizeEmergenceDismissedIds(raw = []) {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map(normalizeTextValue).filter(Boolean))].slice(-24)
}

function normalizeEmergenceEvent(raw = null) {
  if (!raw || typeof raw !== 'object') return null
  const title = normalizeTextValue(raw.title)
  const summary = normalizeTextValue(raw.summary)
  const placeId = normalizeTextValue(raw.placeId)
  if (!title || !summary || !placeId) return null
  const changes = validateStateDelta(raw.changes || [])
  if (!changes.valid || changes.sanitized.length === 0 || changes.sanitized.length > 6) return null
  return {
    ...raw,
    v: normalizeNumber(raw.v, 1),
    kind: 'emergent-event-v1',
    candidateId: normalizeTextValue(raw.candidateId),
    title: title.slice(0, 80),
    summary: summary.slice(0, 520),
    placeId,
    participants: Array.isArray(raw.participants) ? raw.participants.map(normalizeTextValue).filter(Boolean).slice(0, 6) : [],
    factions: Array.isArray(raw.factions) ? raw.factions.map(normalizeTextValue).filter(Boolean).slice(0, 6) : [],
    causes: Array.isArray(raw.causes) ? raw.causes.map(normalizeTextValue).filter(Boolean).slice(0, 6) : [],
    changes: changes.sanitized.slice(0, 6),
    consequences: Array.isArray(raw.consequences) ? raw.consequences.map(normalizeTextValue).filter(Boolean).slice(0, 6) : [],
    unresolvedHooks: Array.isArray(raw.unresolvedHooks) ? raw.unresolvedHooks.map(normalizeTextValue).filter(Boolean).slice(0, 6) : [],
    choices: Array.isArray(raw.choices)
      ? raw.choices.map((choice, index) => ({
        id: normalizeTextValue(choice?.id) || `choice-${index + 1}`,
        label: normalizeTextValue(choice?.label).slice(0, 48),
        intent: normalizeTextValue(choice?.intent).slice(0, 120),
        risk: normalizeTextValue(choice?.risk).slice(0, 120)
      })).filter((choice) => choice.label).slice(0, 3)
      : [],
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0.5)),
    sourceRefs: Array.isArray(raw.sourceRefs) ? raw.sourceRefs.slice(0, 8) : []
  }
}

export function normalizeEmergenceDraft(raw = null) {
  if (!raw || typeof raw !== 'object') return null
  const status = normalizeTextValue(raw.status)
  const decision = normalizeTextValue(raw.decision)
  return {
    candidateId: normalizeTextValue(raw.candidateId),
    status: ['generating', 'ready', 'error'].includes(status) ? status : 'error',
    decision: ['pending', 'applied', 'rejected', 'rolled-back'].includes(decision) ? decision : 'pending',
    event: normalizeEmergenceEvent(raw.event),
    error: normalizeTextValue(raw.error),
    appliedEventId: normalizeTextValue(raw.appliedEventId),
    rollbackEventId: normalizeTextValue(raw.rollbackEventId),
    generatedAt: normalizeNumber(raw.generatedAt, 0),
    updatedAt: normalizeNumber(raw.updatedAt, Date.now())
  }
}

export function normalizeAdventureState(raw = {}) {
  return {
    goals: normalizeGoals(raw?.goals),
    encounteredCharacters: normalizeEncounteredCharacters(raw?.encounteredCharacters),
    factionRelations: normalizeFactionRelations(raw?.factionRelations),
    keyChoices: normalizeKeyChoices(raw?.keyChoices),
    plotJournal: normalizePlotJournal(raw?.plotJournal),
    adventureTriggers: normalizeAdventureTriggersState(raw?.adventureTriggers),
    adventureTriggerHistory: normalizeAdventureTriggerHistory(raw?.adventureTriggerHistory),
    adventureTriggerCooldownUntil: normalizeNumber(raw?.adventureTriggerCooldownUntil, 0),
    emergenceCandidates: normalizeEmergenceCandidates(raw?.emergenceCandidates),
    emergenceDismissedIds: normalizeEmergenceDismissedIds(raw?.emergenceDismissedIds),
    emergenceDraft: normalizeEmergenceDraft(raw?.emergenceDraft)
  }
}

export function getWorldbookEntryNames(worldbook, type, limit = 20) {
  const normalizedType = normalizeTextValue(type).toLowerCase()
  const entries = Array.isArray(worldbook?.entries) ? worldbook.entries : []
  return entries
    .filter((entry) => normalizeTextValue(entry?.type).toLowerCase() === normalizedType)
    .flatMap((entry) => {
      if (normalizedType !== 'character') return [normalizeTextValue(entry?.name || entry?.keys?.[0])]
      const cards = parseCharacterCards(entry?.content)
      return cards.length
        ? cards.map((card) => card.name)
        : [normalizeTextValue(entry?.name || entry?.keys?.[0])]
    })
    .map(normalizeTextValue)
    .filter(Boolean)
    .filter((name, index, names) => names.indexOf(name) === index)
    .slice(0, limit)
}

export function createEmptySessionRuntime() {
  return {
    messages: [],
    chatHistory: [],
    time: { day: 1, period: '早晨' },
    player: { vitality: 100, maxVitality: 100, mood: 80, maxMood: 100, money: 100, level: 1, exp: 0 },
    inventory: [],
    quests: [],
    flags: {},
    activities: [],
    npcRelations: {},
    discoveredPlaces: [],
    completedQuests: [],
    writingCharacter: normalizeWritingCharacter(DEFAULT_WRITING_CHARACTER),
    writingTime: normalizeWritingTime(DEFAULT_WRITING_TIME),
    placeStates: {},
    characterStates: {},
    characterRelations: {},
    canonicalFacts: {},
    worldMapState: normalizeWorldMapState(DEFAULT_WORLD_MAP_STATE),
    playerCharacter: { name: 'User', avatar: '', gender: '', age: '' },
    aiCharacter: { name: 'Assistant', avatar: '' },
    dialogueMode: false,
    dialogueCharacter: null,
    activeMechanism: null,
    mechanismContext: null,
    milestoneEvent: null,
    goals: [],
    encounteredCharacters: [],
    factionRelations: {},
    keyChoices: [],
    plotJournal: [],
    adventureTriggers: cloneState(DEFAULT_ADVENTURE_STATE.adventureTriggers, { prose: null, storyboard: null }),
    adventureTriggerHistory: [],
    adventureTriggerCooldownUntil: 0,
    emergenceCandidates: [],
    emergenceDismissedIds: [],
    emergenceDraft: null,
    runtimeEvents: [],
    historyNode: null,
    narrativeSceneSummary: null,
    sceneThread: null
  }
}

export function cloneState(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback))
  } catch {
    return JSON.parse(JSON.stringify(fallback))
  }
}

// P1：applyRuntimeSnapshot 实际读取的字段 —— turn/session 快照只保留这些，
// 不再随每个回合快照复制完整 messages/chatHistory（正文已被多份保存导致二次增长）。
export const RUNTIME_SNAPSHOT_KEYS = Object.freeze([
  'player', 'inventory', 'quests', 'flags', 'activities',
  'goals', 'encounteredCharacters', 'factionRelations', 'keyChoices', 'plotJournal',
  'adventureTriggers', 'adventureTriggerHistory', 'adventureTriggerCooldownUntil',
  'emergenceCandidates', 'emergenceDismissedIds', 'emergenceDraft',
  'npcRelations', 'discoveredPlaces', 'completedQuests',
  'writingCharacter', 'writingTime', 'placeStates', 'characterStates',
  'characterRelations', 'canonicalFacts', 'worldMapState', 'historyNode',
  'narrativeSceneSummary', 'sceneThread', 'activeMechanism', 'mechanismContext',
  'milestoneEvent', 'dialogueMode', 'dialogueCharacter', 'runtimeEvents', 'roleplayRuntime'
])

export function normalizeRuntimeSnapshot(snapshot, { forSession = false } = {}) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return {}
  const result = {}
  for (const key of RUNTIME_SNAPSHOT_KEYS) {
    if (snapshot[key] !== undefined) result[key] = snapshot[key]
  }
  // session 需要 playerCharacter/aiCharacter（loadSession 读取）；turn 快照不需要。
  if (forSession) {
    if (snapshot.playerCharacter !== undefined) result.playerCharacter = snapshot.playerCharacter
    if (snapshot.aiCharacter !== undefined) result.aiCharacter = snapshot.aiCharacter
  }
  return result
}

export function findSession(sessions, id) {
  if (!id || !Array.isArray(sessions)) return null
  return sessions.find((session) => session.id === id) || null
}
