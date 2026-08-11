import { defineStore } from 'pinia'
import { sendAction as apiSendAction, getState, recordMemory } from '../services/api'
import {
  resolveSelectedTextProviderConfig,
  toResolvedTextApiSettings
} from '../services/textProviderConfigStore'
import {
  buildNarrativeFormatInstructions,
  ensureNarrativeMessage,
  getTrustedMessageSpeaker,
  normalizeNarrativeMessages,
  parseNarrativePresentation
} from '../services/narrativePresentation'
import {
  formatAdventureStoryboardSeedContent,
  generateAdventureProseDraft,
  generateAdventureStoryboardDraft
} from '../services/generationAdventureTriggers'
import { buildHeuristicContextSummary, compressChatHistory } from '../services/contextCompression'
import {
  appendPlayerHistoryNode,
  buildPlayerHistoryContext,
  buildPlayerHistoryNodeFromPlotJournal,
  getPlayerHistoryNodeKey
} from '../services/playerHistory'
import { buildGeoHistoryRuntimeContext } from '../services/worldHistory/runtimeContext'
import { buildEmergenceCandidates } from '../services/worldHistory/emergenceScheduler'
import { generateEmergenceEventDraft } from '../services/generationEmergence'
import {
  listScopedActiveMemoryCandidates
} from '../services/memoryCandidates'
import {
  RUNTIME_EVENT_LIMIT,
  applyStateDelta,
  buildStateDeltaExplanation,
  buildStateDeltaPreview,
  capRuntimeEvents,
  createRuntimeEvent,
  rollbackStateDelta,
  validateStateDelta
} from '../services/runtimeEvents'
import {
  buildRuntimeConflictKey,
  buildRuntimeCausalityContext,
  buildRuntimeEventCausality,
  canResolveRuntimeConflict,
  describeRuntimeStateTransitions
} from '../services/runtimeEventCausality'
import {
  addNarrativeAsset,
  createNarrativeAssetSourceRef,
  mergeSourceRefs,
  normalizeContentRef
} from '../services/narrativeAssets'
import { saveValidatedStoryboardVersion } from '../services/storyboardStore'
import { buildNarrativeKernel } from '../services/agents/narrativeKernel'
import { getNarrativeResourceIndex } from '../services/agents/narrativeResourceIndex'
import { buildNarrativeContextAudit } from '../services/agents/narrativeContextAudit'
import { createNarrativeToolRegistry } from '../services/agents/narrativeToolRegistry'
import {
  buildTurnReceipt,
  createNarrativeAgentContextLedger,
  runNarrativeAgentGeneration
} from '../services/agents/narrativeAgentOrchestrator'
import {
  normalizeNarrativeSceneSummary,
  resolveNarrativeSceneSummary
} from '../services/agents/narrativeSceneSummary'
import {
  createNarrativeProductionObserver,
  recordNarrativeProductionRun
} from '../services/agents/narrativeProductionMetrics'
import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage'
import { debounce, flushPending } from '../composables/useDebounce'
import { useWorldStore } from './worldStore'
import { parseCharacterCards } from '../services/characterCard'
import {
  createMessageId,
  createNarrativeTurnRecord,
  commitNarrativeTurnRecord,
  failNarrativeTurnRecord,
  normalizeTurnRecords,
  TURN_RECORD_LIMIT,
} from '../../shared/narrativeTurnContract.js'
import { normalizeExperienceAction } from '../../shared/experienceActionContract.js'

const DEFAULT_WORLD_MAP_STATE = {
  map: { countries: [] },
  currentCountry: '',
  currentCity: '',
  currentScene: '',
  placeId: ''
}

const DEFAULT_WRITING_CHARACTER = {
  name: 'User',
  gender: '',
  age: '',
  traits: [],
  mood: 50,
  description: '',
  goal: ''
}

function buildAdventureCreativeSourceRefs(store, messageIds = [], plotEntry = null) {
  const projectId = store.worldId || resolveActiveWorldbookId() || null
  const sessionId = String(store.currentSessionId || 'session')
  const refs = (Array.isArray(messageIds) ? messageIds : [])
    .map((messageId) => normalizeContentRef({
      refType: 'session-message',
      refId: `${sessionId}:${String(messageId || '').trim()}`,
      projectId
    }, projectId))
    .filter(Boolean)

  const historyNodeId = String(store.historyNode?.id || '').trim()
  if (historyNodeId) {
    refs.push(normalizeContentRef({
      refType: 'history-node',
      refId: historyNodeId,
      projectId,
      excerpt: store.historyNode?.summary || store.historyNode?.title
    }, projectId))
  }

  const placeId = String(store.worldMapState?.placeId || store.historyNode?.placeId || '').trim()
  if (placeId) {
    refs.push(normalizeContentRef({
      refType: 'map-site',
      refId: placeId,
      projectId,
      excerpt: [
        store.worldMapState?.currentCountry,
        store.worldMapState?.currentCity,
        store.worldMapState?.currentScene
      ].filter(Boolean).join(' / ')
    }, projectId))
  }

  const journal = plotEntry || store.latestPlotJournalEntry?.()
  const journalId = String(journal?.id || journal?.chapterId || '').trim()
  if (journalId) {
    refs.push(normalizeContentRef({
      refType: 'plot-journal',
      refId: journalId,
      projectId,
      excerpt: journal?.summary
    }, projectId))
  }

  return mergeSourceRefs(refs)
}

const DEFAULT_WRITING_TIME = {
  eraId: 'custom',
  eraName: '',
  year: '',
  month: '',
  day: ''
}

const DEFAULT_ADVENTURE_STATE = {
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

const PLOT_JOURNAL_TURN_INTERVAL = 8
const PLOT_JOURNAL_MAX_SUMMARY_CHARS = 420
const ADVENTURE_TRIGGER_COOLDOWN_MS = 3000
const ADVENTURE_TRIGGER_WINDOW_MS = 60 * 1000
const ADVENTURE_TRIGGER_MAX_PER_WINDOW = 2

function normalizeTextValue(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function buildStableRuntimeId(prefix, value, fallback = 'item') {
  const token = normalizeTextValue(value).slice(0, 24) || fallback
  return `${prefix}_${token}`
}

function normalizeNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function compactPlotJournalSummary(messages = []) {
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

function normalizeWorldMapState(raw = {}) {
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

function normalizeWritingCharacter(raw = {}) {
  return {
    ...DEFAULT_WRITING_CHARACTER,
    ...(raw && typeof raw === 'object' ? raw : {}),
    traits: Array.isArray(raw?.traits) ? raw.traits : []
  }
}

function normalizeWritingTime(raw = {}) {
  return {
    ...DEFAULT_WRITING_TIME,
    ...(raw && typeof raw === 'object' ? raw : {})
  }
}

function normalizePlaceStates(raw = {}) {
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

function normalizeCharacterStates(raw = {}) {
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

const CHARACTER_RELATION_KINDS = new Set([
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

function normalizeCharacterRelations(raw = {}) {
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

function normalizeCanonicalFacts(raw = {}) {
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

function normalizeGoals(raw = []) {
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

function normalizeEncounteredCharacters(raw = []) {
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

function normalizeFactionRelations(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  return Object.entries(raw).reduce((acc, [key, value]) => {
    const name = normalizeTextValue(key)
    const numeric = Number(value)
    if (!name || !Number.isFinite(numeric)) return acc
    acc[name] = Math.max(-100, Math.min(100, Math.round(numeric)))
    return acc
  }, {})
}

function normalizeKeyChoices(raw = []) {
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

function normalizePlotJournal(raw = []) {
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

function normalizeAdventureTriggerDraft(raw = null, type = 'prose') {
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

function normalizeAdventureTriggerHistory(raw = []) {
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

function normalizeEmergenceCandidates(raw = []) {
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

function normalizeEmergenceDismissedIds(raw = []) {
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

function normalizeEmergenceDraft(raw = null) {
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

function normalizeAdventureState(raw = {}) {
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

function getWorldbookEntryNames(worldbook, type, limit = 20) {
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

function createEmptySessionRuntime() {
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
    narrativeSceneSummary: null
  }
}

function cloneState(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback))
  } catch {
    return JSON.parse(JSON.stringify(fallback))
  }
}

function debugLog(...args) {
  if (import.meta.env.DEV) {
    console.debug(...args)
  }
}

function resolveActiveWorldbookId() {
  try {
    const worldStore = useWorldStore()
    return worldStore.activeWorldbook?.id || null
  } catch {
    return null
  }
}

function findSession(sessions, id) {
  if (!id || !Array.isArray(sessions)) return null
  return sessions.find((session) => session.id === id) || null
}

// Per-store-instance debouncer for saveSessions (Pinax Tier 1 #11).
// WeakMap so the debouncer is garbage-collected with the store instance.
// 500ms trailing-only merge; 5+ writes per AI reply cycle collapse to 1.
const saveSessionDebouncers = new WeakMap()
const narrativeAbortControllers = new WeakMap()

function getSaveSessionsDebouncer(store) {
  if (!saveSessionDebouncers.has(store)) {
    saveSessionDebouncers.set(store, debounce(() => {
      setItem(STORAGE_KEYS.WRITING_SESSIONS, store.sessions)
    }, 500, { leading: false, trailing: true }))
  }
  return saveSessionDebouncers.get(store)
}

// 3-event unload flush (guarded: SSR / Node tests have no window/document).
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPending)
  window.addEventListener('pagehide', flushPending)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flushPending()
    })
  }
}

export const useGameStore = defineStore('game', {
  state: () => ({
    gameId: null,
    worldId: null,
    genre: 'novel', // 'novel' | 'poetry'
    isPlaying: false,
    _isRegenerating: false, // 标记是否为重写后续
    messages: [], // UI 显示
    time: { day: 1, period: '早晨' },
    player: { vitality: 100, maxVitality: 100, mood: 80, maxMood: 100, money: 100, level: 1, exp: 0 },
    inventory: [],
    quests: [],
    flags: {},
    worldState: {},
    worldMapState: normalizeWorldMapState(DEFAULT_WORLD_MAP_STATE),
    historyNode: null,
    writingCharacter: normalizeWritingCharacter(DEFAULT_WRITING_CHARACTER),
    writingTime: normalizeWritingTime(DEFAULT_WRITING_TIME),
    placeStates: {},
    characterStates: {},
    characterRelations: {},
    canonicalFacts: {},
    activities: [],
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
    adventureTriggerPendingType: null,
    npcRelations: {},
    discoveredPlaces: [],
    completedQuests: [],
    isLoading: false,
    lastError: null,
    chatHistory: [], // AI 记忆
    useAI: true, // 默认开启 AI
    apiSettings: {
      provider: 'openai',
      apiKey: '',
      baseUrl: '',
      model: ''
    },
    playerCharacter: {
      name: 'User', // 默认名，用户可以改
      avatar: ''    // 玩家头像
    },

    // AI 扮演的角色
    aiCharacter: {
      name: 'Assistant', // 默认名，导入后会变
      avatar: ''
    },

    // 对话模式
    dialogueMode: false,       // 是否开启对话模式
    dialogueCharacter: null,   // 当前对话角色
    dialogueCharacters: [],    // 已保存的角色列表
    quickNoteImportMode: false,
    quickNoteSelectedMessageIndexes: [],

    // 机制触发状态
    activeMechanism: null,     // 当前激活的机制面板: 'combat' | 'trade' | 'quest' | 'dialogue' | null
    mechanismContext: null,    // 机制面板的上下文数据
    milestoneEvent: null,      // 里程碑事件：{ type: 'location-unlock' | 'time-skip' | 'character-appearance', data: {...} }

    // 内联标记事件（不自动弹窗，点击查看）
    inlineEvents: [],           // [{ type, text, data, messageId }]
    lastWorldbookContext: null,
    lastMemoryContext: '',
    lastContextLedger: null,
    // 排名后的本地记忆召回元数据，可被 lastContextLedger / debug UI 复用。
    lastMemoryRecall: null,
    lastNarrativeKernel: null,
    lastNarrativeContextAudit: null,
    lastNarrativeAgentTrace: null,
    narrativeAgentStatus: null,
    narrativeSceneSummary: null,

    // 运行时事件侧车 (v1 append-only, ≤200 events per session)
    runtimeEvents: [],

    // R1a：回合事务记录（id → NarrativeTurnRecord，LRU ≤50）。
    // 每条含 preRuntimeSnapshot，供 regenerate/失败回滚恢复 runtime state。
    turnRecords: {},
    lastCommittedTurnId: null,
    pendingTurnRecord: null,
    // R1b：当前活跃分支。regenerate 时新建分支并切换，displayMessages 按它过滤。
    activeBranchId: 'main',
    // R6：仅下一轮导演注（由 executeExperienceAction 'director-note' 设置，发送时消费）
    pendingDirectorNote: null,
    // P1-5：最近一次已提交回合的回执（低敏摘要，体验页渲染用）
    lastTurnReceipt: null,

    // 会话管理
    sessions: [],               // 保存的会话列表
    currentSessionId: null       // 当前会话 ID
  }),

  actions: {
    loadWorldMapState() {
      const session = findSession(this.sessions, this.currentSessionId)
      const sessionState = session?.worldState?.worldMap || session?.runtimeState?.worldMapState
      if (sessionState) {
        this.worldMapState = normalizeWorldMapState(sessionState)
        return
      }
      const raw = getItem(STORAGE_KEYS.WRITING_WORLDMAP)
      this.worldMapState = normalizeWorldMapState(raw || {})
    },

    saveWorldMapState(nextState) {
      const normalized = normalizeWorldMapState(nextState || this.worldMapState)
      this.worldMapState = normalized
      setItem(STORAGE_KEYS.WRITING_WORLDMAP, normalized)
      this.saveCurrentSession()
    },

    setHistoryNode(node) {
      this.historyNode = node && typeof node === 'object' ? cloneState(node, null) : null
      this.saveCurrentSession()
      return this.historyNode
    },

    getCurrentCreativeSourceRefs(messageIds = [], plotEntry = null) {
      return buildAdventureCreativeSourceRefs(this, messageIds, plotEntry)
    },

    loadWritingCharacter() {
      const session = findSession(this.sessions, this.currentSessionId)
      const sessionState = session?.worldState?.character || session?.runtimeState?.writingCharacter
      if (sessionState) {
        const normalized = normalizeWritingCharacter(sessionState)
        this.writingCharacter = normalized
        this.playerCharacter = {
          ...this.playerCharacter,
          name: normalized.name || 'User',
          gender: normalized.gender || '',
          age: normalized.age || ''
        }
        return
      }
      const raw = getItem(STORAGE_KEYS.WRITING_CHARACTER)
      const normalized = normalizeWritingCharacter(raw || {})
      this.writingCharacter = normalized
      this.playerCharacter = {
        ...this.playerCharacter,
        name: normalized.name || this.playerCharacter.name,
        gender: normalized.gender || this.playerCharacter.gender,
        age: normalized.age || this.playerCharacter.age
      }
    },

    saveWritingCharacter(nextCharacter) {
      const normalized = normalizeWritingCharacter(nextCharacter || this.writingCharacter)
      this.writingCharacter = normalized
      this.playerCharacter = {
        ...this.playerCharacter,
        name: normalized.name || this.playerCharacter.name,
        gender: normalized.gender || this.playerCharacter.gender,
        age: normalized.age || this.playerCharacter.age
      }
      setItem(STORAGE_KEYS.WRITING_CHARACTER, normalized)
      this.saveCurrentSession()
    },

    loadWritingTime() {
      const session = findSession(this.sessions, this.currentSessionId)
      const sessionState = session?.worldState?.time || session?.runtimeState?.writingTime
      if (sessionState) {
        this.writingTime = normalizeWritingTime(sessionState)
        return
      }
      const raw = getItem(STORAGE_KEYS.WRITING_TIME)
      this.writingTime = normalizeWritingTime(raw || {})
    },

    saveWritingTime(nextTime) {
      const normalized = normalizeWritingTime(nextTime || this.writingTime)
      this.writingTime = normalized
      setItem(STORAGE_KEYS.WRITING_TIME, normalized)
      this.saveCurrentSession()
    },

    loadWritingActivities() {
      const session = findSession(this.sessions, this.currentSessionId)
      const sessionState = session?.worldState?.activities || session?.runtimeState?.activities
      if (Array.isArray(sessionState)) {
        this.activities = cloneState(sessionState, [])
        return
      }
      const raw = getItem(STORAGE_KEYS.WRITING_ACTIVITIES)
      this.activities = Array.isArray(raw) ? raw : []
    },

    saveWritingActivities(nextActivities) {
      const normalized = Array.isArray(nextActivities) ? nextActivities : this.activities
      this.activities = normalized
      setItem(STORAGE_KEYS.WRITING_ACTIVITIES, normalized)
      this.saveCurrentSession()
    },

    setGoals(nextGoals) {
      this.goals = normalizeGoals(nextGoals)
      this.saveCurrentSession()
    },

    upsertGoal(goal) {
      const next = normalizeGoals([...(this.goals || []), goal])
      this.goals = next
      this.saveCurrentSession()
    },

    addEncounteredCharacter(character) {
      const name = normalizeTextValue(character?.name || character)
      if (!name) return
      const existing = (this.encounteredCharacters || []).find((item) => item?.name === name)
      const retained = (this.encounteredCharacters || []).filter((item) => item?.name !== name)
      this.encounteredCharacters = normalizeEncounteredCharacters([
        ...retained,
        { ...(existing || {}), ...(typeof character === 'object' ? character : { name }) }
      ])
      this.saveCurrentSession()
    },

    setFactionRelation(name, value) {
      const key = normalizeTextValue(name)
      if (!key) return
      this.factionRelations = normalizeFactionRelations({
        ...(this.factionRelations || {}),
        [key]: value
      })
      this.saveCurrentSession()
    },

    recordKeyChoice(choice) {
      this.keyChoices = normalizeKeyChoices([...(this.keyChoices || []), choice])
      this.saveCurrentSession()
    },

    appendPlotJournal(entry) {
      this.plotJournal = normalizePlotJournal([...(this.plotJournal || []), entry])
      this.saveCurrentSession()
    },

    refreshEmergenceCandidates(options = {}) {
      const worldStore = useWorldStore()
      const worldbook = worldStore.activeWorldbook
      const nextCandidates = normalizeEmergenceCandidates(buildEmergenceCandidates({
        geoHistoryContext: buildGeoHistoryRuntimeContext({
          worldbook,
          geoHistory: worldbook?.geoHistory,
          worldMapState: this.worldMapState,
          historyNode: this.historyNode,
          playerHistoryContext: buildPlayerHistoryContext(worldbook?.geoHistory)
        }),
        worldMapState: this.worldMapState,
        historyNode: this.historyNode,
        plotJournal: this.plotJournal,
        goals: this.goals,
        encounteredCharacters: this.encounteredCharacters,
        placeStates: this.placeStates,
        characterStates: this.characterStates,
        factionRelations: this.factionRelations,
        causalityContext: buildRuntimeCausalityContext({
          runtimeState: this.getRuntimeSnapshot()
        }),
        now: options?.now,
        limit: 2,
        dismissedIds: this.emergenceDismissedIds
      }))
      const previousIds = new Set((this.emergenceCandidates || []).map((candidate) => candidate?.id).filter(Boolean))
      this.emergenceCandidates = nextCandidates
      for (const candidate of nextCandidates) {
        if (previousIds.has(candidate.id)) continue
        this.appendRuntimeEvent({
          type: 'display_event',
          source: 'emergence',
          payload: {
            kind: 'emergence-candidate-ready',
            candidateId: candidate.id,
            candidateType: candidate.type,
            placeId: candidate.placeId || '',
            sourceRefs: candidate.sourceRefs
          }
        })
      }
      this.saveCurrentSession()
      return this.emergenceCandidates
    },

    dismissEmergenceCandidate(candidateId) {
      const id = normalizeTextValue(candidateId)
      if (!id) return
      this.emergenceDismissedIds = normalizeEmergenceDismissedIds([
        ...(this.emergenceDismissedIds || []),
        id
      ])
      this.emergenceCandidates = (this.emergenceCandidates || []).filter((candidate) => candidate?.id !== id)
      if (this.emergenceDraft?.candidateId === id && this.emergenceDraft.decision !== 'applied') {
        this.emergenceDraft = null
      }
      this.appendRuntimeEvent({
        type: 'display_event',
        source: 'emergence',
        payload: {
          kind: 'emergence-candidate-dismissed',
          candidateId: id
        }
      })
      this.saveCurrentSession()
    },

    setEmergenceDraft(draft) {
      this.emergenceDraft = normalizeEmergenceDraft(draft)
      this.saveCurrentSession()
      return this.emergenceDraft
    },

    getEmergenceDraftState(candidateId) {
      const id = normalizeTextValue(candidateId)
      const candidate = (this.emergenceCandidates || []).find((item) => item?.id === id) || null
      const draft = this.emergenceDraft?.candidateId === id ? this.emergenceDraft : null
      return {
        candidate,
        draft,
        isGenerating: Boolean(draft?.status === 'generating'),
        isReady: Boolean(draft?.status === 'ready' && draft.event),
        isPending: Boolean(draft?.status === 'ready' && draft.event && (!draft.decision || draft.decision === 'pending')),
        isApplied: Boolean(draft?.decision === 'applied'),
        isRejected: Boolean(draft?.decision === 'rejected'),
        isRolledBack: Boolean(draft?.decision === 'rolled-back')
      }
    },

    getEmergenceStateDeltaPreview(candidateId) {
      const state = this.getEmergenceDraftState(candidateId)
      if (!state.isReady) {
        return { valid: false, state: this.getRuntimeSnapshot(), changes: [], errors: [{ code: 'draft-not-ready' }] }
      }
      const preview = buildStateDeltaPreview(this.getRuntimeSnapshot(), state.draft.event.changes)
      return {
        ...preview,
        explanation: buildStateDeltaExplanation({
          causes: state.draft.event.causes,
          consequences: state.draft.event.consequences
        })
      }
    },

    applyEmergenceRuntimeRoots(nextState, paths = []) {
      for (const path of [...new Set(paths)]) {
        switch (path) {
          case 'goals':
            this.goals = normalizeGoals(nextState.goals)
            break
          case 'encounteredCharacters':
            this.encounteredCharacters = normalizeEncounteredCharacters(nextState.encounteredCharacters)
            break
          case 'factionRelations':
            this.factionRelations = normalizeFactionRelations(nextState.factionRelations)
            break
          case 'keyChoices':
            this.keyChoices = normalizeKeyChoices(nextState.keyChoices)
            break
          case 'plotJournal':
            this.plotJournal = normalizePlotJournal(nextState.plotJournal)
            break
          case 'activities':
            this.activities = Array.isArray(nextState.activities) ? cloneState(nextState.activities, []) : []
            break
          case 'placeStates':
            this.placeStates = normalizePlaceStates(nextState.placeStates)
            break
          case 'characterStates':
            this.characterStates = normalizeCharacterStates(nextState.characterStates)
            break
          case 'characterRelations':
            this.characterRelations = normalizeCharacterRelations(nextState.characterRelations)
            break
          case 'canonicalFacts':
            this.canonicalFacts = normalizeCanonicalFacts(nextState.canonicalFacts)
            break
          case 'writingTime':
            this.writingTime = normalizeWritingTime(nextState.writingTime)
            break
          case 'worldMapState':
            this.worldMapState = normalizeWorldMapState(nextState.worldMapState || {})
            break
          case 'mechanismContext':
            this.mechanismContext = cloneState(nextState.mechanismContext, null)
            break
          case 'milestoneEvent':
            this.milestoneEvent = cloneState(nextState.milestoneEvent, null)
            break
          case 'flags':
            this.flags = cloneState(nextState.flags, {})
            break
          case 'inventory':
            this.inventory = Array.isArray(nextState.inventory) ? cloneState(nextState.inventory, []) : []
            break
          case 'quests':
            this.quests = Array.isArray(nextState.quests) ? cloneState(nextState.quests, []) : []
            break
          default:
            break
        }
      }
    },

    applyEmergenceDraft(candidateId) {
      const id = normalizeTextValue(candidateId)
      const state = this.getEmergenceDraftState(id)
      if (!state.isReady) throw new Error('事件草稿尚未生成')
      if (state.isApplied) throw new Error('事件草稿已经应用')
      if (state.isRejected) throw new Error('事件草稿已拒绝')

      const preview = this.getEmergenceStateDeltaPreview(id)
      if (!preview.valid) throw new Error('事件状态变更未通过校验')
      const changedPaths = Object.keys(preview.before)
      this.applyEmergenceRuntimeRoots(preview.state, changedPaths)
      const appliedState = this.getRuntimeSnapshot()
      const after = Object.fromEntries(changedPaths.map((path) => [
        path,
        cloneState(appliedState[path], null)
      ]))
      const transitions = describeRuntimeStateTransitions(preview.before, after)
      const event = this.appendRuntimeEvent({
        type: 'state_delta',
        source: 'runtime',
        payload: {
          kind: 'emergence-state-applied',
          candidateId: id,
          placeId: state.draft.event.placeId,
          causes: state.draft.event.causes,
          consequences: state.draft.event.consequences,
          explanation: preview.explanation,
          sourceRefs: state.draft.event.sourceRefs,
          ops: preview.appliedOps,
          inverseOps: preview.inverseOps,
          before: preview.before,
          after,
          transitions,
          contextual: false
        }
      })
      this.emergenceDraft = normalizeEmergenceDraft({
        ...state.draft,
        decision: 'applied',
        appliedEventId: event.id,
        error: '',
        updatedAt: Date.now()
      })
      this.saveCurrentSession()
      return {
        draft: this.emergenceDraft,
        event,
        preview: { ...preview, state: appliedState, after }
      }
    },

    rejectEmergenceDraft(candidateId) {
      const id = normalizeTextValue(candidateId)
      const state = this.getEmergenceDraftState(id)
      if (!state.isReady) throw new Error('事件草稿尚未生成')
      if (state.isApplied) throw new Error('事件草稿已经应用，不能拒绝')
      this.emergenceDraft = normalizeEmergenceDraft({
        ...state.draft,
        decision: 'rejected',
        error: '',
        updatedAt: Date.now()
      })
      this.appendRuntimeEvent({
        type: 'display_event',
        source: 'runtime',
        payload: {
          kind: 'emergence-draft-rejected',
          candidateId: id,
          placeId: state.draft.event.placeId,
          contextual: false
        }
      })
      this.saveCurrentSession()
      return this.emergenceDraft
    },

    rollbackEmergenceDraft(candidateId) {
      const id = normalizeTextValue(candidateId)
      const state = this.getEmergenceDraftState(id)
      if (!state.isApplied || !state.draft.appliedEventId) throw new Error('没有可回滚的事件应用')
      const appliedEvent = (this.runtimeEvents || []).find((event) => event?.id === state.draft.appliedEventId)
      if (!appliedEvent) throw new Error('找不到事件应用记录')

      const rollback = rollbackStateDelta(this.getRuntimeSnapshot(), appliedEvent)
      if (!rollback.valid) {
        this.emergenceDraft = normalizeEmergenceDraft({
          ...state.draft,
          error: `回滚冲突：${rollback.conflicts.join('、') || '状态已变化'}`,
          updatedAt: Date.now()
        })
        this.saveCurrentSession()
        return { success: false, rollback, draft: this.emergenceDraft }
      }

      const changedPaths = Object.keys(rollback.before)
      this.applyEmergenceRuntimeRoots(rollback.state, changedPaths)
      const rolledBackState = this.getRuntimeSnapshot()
      const after = Object.fromEntries(changedPaths.map((path) => [
        path,
        cloneState(rolledBackState[path], null)
      ]))
      const transitions = describeRuntimeStateTransitions(rollback.before, after)
      const rollbackEvent = this.appendRuntimeEvent({
        type: 'state_delta',
        source: 'runtime',
        parentId: appliedEvent.id,
        payload: {
          kind: 'emergence-state-rollback',
          candidateId: id,
          rollbackOf: appliedEvent.id,
          explanation: '因为原事件应用已被撤回，所以恢复应用前的状态',
          inverseOps: rollback.inverseOps,
          before: rollback.before,
          after,
          transitions,
          contextual: false
        }
      })
      this.emergenceDraft = normalizeEmergenceDraft({
        ...state.draft,
        decision: 'rolled-back',
        rollbackEventId: rollbackEvent.id,
        error: '',
        updatedAt: Date.now()
      })
      this.saveCurrentSession()
      return {
        success: true,
        rollback: { ...rollback, state: rolledBackState, after },
        event: rollbackEvent,
        draft: this.emergenceDraft
      }
    },

    async generateEmergenceDraft(candidateId) {
      const id = normalizeTextValue(candidateId)
      const candidate = (this.emergenceCandidates || []).find((item) => item?.id === id)
      if (!candidate) throw new Error('找不到剧情候选')
      if (this.emergenceDraft?.status === 'generating') throw new Error('事件正在具体化，请稍候')

      this.loadApiSettings()
      const now = Date.now()
      this.setEmergenceDraft({
        candidateId: id,
        status: 'generating',
        event: null,
        error: '',
        generatedAt: now,
        updatedAt: now
      })

      try {
        const worldStore = useWorldStore()
        const result = await generateEmergenceEventDraft({
          candidate,
          worldbook: worldStore.activeWorldbook,
          runtimeState: this.getRuntimeSnapshot(),
          chatHistory: this.chatHistory,
          settings: this.apiSettings,
          worldId: this.worldId || worldStore.activeWorldbook?.id || ''
        })
        if (!result?.success || !result.event) throw new Error(result?.error || '事件具体化失败')

        const draft = this.setEmergenceDraft({
          candidateId: id,
          status: 'ready',
          event: result.event,
          error: '',
          generatedAt: now,
          updatedAt: Date.now()
        })
        this.appendRuntimeEvent({
          type: 'display_event',
          source: 'emergence',
          payload: {
            kind: 'emergence-draft-ready',
            candidateId: id,
            placeId: result.event.placeId,
            contextual: false
          }
        })
        this.saveCurrentSession()
        return draft
      } catch (error) {
        return this.setEmergenceDraft({
          candidateId: id,
          status: 'error',
          event: null,
          error: error?.message || '事件具体化失败',
          generatedAt: now,
          updatedAt: Date.now()
        })
      }
    },

    clearEmergenceDraft() {
      this.emergenceDraft = null
      this.saveCurrentSession()
    },

    async persistLatestPlayerHistoryNode() {
      const worldStore = useWorldStore()
      const worldbook = worldStore.activeWorldbook
      if (!worldbook?.id || !this.currentSessionId) return null

      const node = buildPlayerHistoryNodeFromPlotJournal(
        this.latestPlotJournalEntry() ? [this.latestPlotJournalEntry()] : [],
        this.historyNode,
        {
          placeId: this.worldMapState?.placeId,
          placeRef: this.historyNode?.placeRef,
          worldStateSnapshot: {
            turn: this.chatHistory.filter((message) => message?.role === 'assistant').length,
            worldMapState: this.worldMapState,
            writingTime: this.writingTime,
            factionRelations: this.factionRelations,
            goals: this.goals,
            encounteredCharacters: this.encounteredCharacters
          }
        }
      )
      if (!node) return null

      const existingPlayerNodes = Array.isArray(worldbook.geoHistory?.playerNodes)
        ? worldbook.geoHistory.playerNodes
        : []
      const nodeKey = getPlayerHistoryNodeKey(node)
      if (existingPlayerNodes.some((item) => getPlayerHistoryNodeKey(item) === nodeKey)) {
        return existingPlayerNodes.find((item) => getPlayerHistoryNodeKey(item) === nodeKey) || node
      }

      try {
        const geoHistory = appendPlayerHistoryNode(worldbook.geoHistory, node)
        const updated = await worldStore.updateWorldbook(worldbook.id, { geoHistory })
        const persisted = updated?.geoHistory?.playerNodes?.find((item) => getPlayerHistoryNodeKey(item) === nodeKey) || node
        this.appendRuntimeEvent({
          type: 'display_event',
          source: 'runtime',
          payload: {
            kind: 'player-history-writeback',
            playerHistoryNodeId: persisted.id,
            sourceNodeId: persisted.sourceNodeId,
            placeId: persisted.placeId || '',
            contextual: false
          }
        })
        this.saveCurrentSession()
        return persisted
      } catch (error) {
        return null
      }
    },

    setAdventureTriggerDraft(type, draft) {
      const triggerType = type === 'storyboard' ? 'storyboard' : 'prose'
      this.adventureTriggers = {
        ...(this.adventureTriggers || cloneState(DEFAULT_ADVENTURE_STATE.adventureTriggers, { prose: null, storyboard: null })),
        [triggerType]: normalizeAdventureTriggerDraft(draft, triggerType)
      }
      this.saveCurrentSession()
      return this.adventureTriggers[triggerType]
    },

    clearAdventureTriggerDraft(type) {
      const triggerType = type === 'storyboard' ? 'storyboard' : 'prose'
      this.adventureTriggers = {
        ...(this.adventureTriggers || cloneState(DEFAULT_ADVENTURE_STATE.adventureTriggers, { prose: null, storyboard: null })),
        [triggerType]: null
      }
      this.saveCurrentSession()
    },

    latestPlotJournalEntry() {
      return this.plotJournal?.[this.plotJournal.length - 1] || null
    },

    getAdventureTriggerState(type, nowInput = Date.now()) {
      const triggerType = type === 'storyboard' ? 'storyboard' : 'prose'
      const latestEntry = this.latestPlotJournalEntry()
      const draft = this.adventureTriggers?.[triggerType] || null
      const now = normalizeNumber(nowInput, Date.now())
      const recentHistory = (this.adventureTriggerHistory || [])
        .filter((item) => now - Number(item?.createdAt || 0) <= ADVENTURE_TRIGGER_WINDOW_MS)
      const usesRemaining = Math.max(0, ADVENTURE_TRIGGER_MAX_PER_WINDOW - recentHistory.length)
      const cooldownRemainingMs = Math.max(0, Number(this.adventureTriggerCooldownUntil || 0) - now)
      const hasDraftForLatestEntry = Boolean(draft && latestEntry && draft.sourcePlotId === (latestEntry.id || latestEntry.chapterId))
      const isAccepted = Boolean(hasDraftForLatestEntry && draft?.status === 'accepted')
      const cooldownRemainingSeconds = Math.ceil(cooldownRemainingMs / 1000)
      let blockReason = ''

      if (!latestEntry?.summary) {
        blockReason = '当前剧情还不足以生成草稿'
      } else if (this.adventureTriggerPendingType === triggerType) {
        blockReason = 'AI 正在处理草稿，请稍候'
      } else if (cooldownRemainingMs > 0) {
        blockReason = `按钮冷却中，请在 ${cooldownRemainingSeconds} 秒后重试`
      } else if (usesRemaining <= 0) {
        blockReason = '本分钟触发次数已达上限，请稍后再试'
      } else if (isAccepted) {
        blockReason = '这段剧情的草稿已保存'
      }

      return {
        type: triggerType,
        latestEntry,
        draft,
        isReady: Boolean(latestEntry?.summary),
        isGenerating: this.adventureTriggerPendingType === triggerType,
        isAccepted,
        cooldownRemainingMs,
        cooldownRemainingSeconds,
        usesRemaining,
        blockReason,
        canGenerate: Boolean(latestEntry?.summary) && this.adventureTriggerPendingType !== triggerType && cooldownRemainingMs === 0 && usesRemaining > 0 && !isAccepted,
        hasDraftForLatestEntry
      }
    },

    registerAdventureTriggerUsage(type) {
      const triggerType = type === 'storyboard' ? 'storyboard' : 'prose'
      const now = Date.now()
      const history = normalizeAdventureTriggerHistory([
        ...(this.adventureTriggerHistory || []).filter((item) => now - Number(item?.createdAt || 0) <= ADVENTURE_TRIGGER_WINDOW_MS),
        { type: triggerType, createdAt: now }
      ])
      this.adventureTriggerHistory = history
      this.adventureTriggerCooldownUntil = now + ADVENTURE_TRIGGER_COOLDOWN_MS
      this.saveCurrentSession()
    },

    buildAdventureTriggerTitle(type, plotEntry) {
      const triggerType = type === 'storyboard' ? 'storyboard' : 'prose'
      const chapterId = normalizeTextValue(plotEntry?.chapterId || '')
      if (triggerType === 'storyboard') {
        return chapterId ? `${chapterId} 分镜草稿` : '冒险分镜草稿'
      }
      return chapterId ? `${chapterId} 章节草稿` : '冒险章节草稿'
    },

    async generateAdventureTriggerDraft(type) {
      const triggerType = type === 'storyboard' ? 'storyboard' : 'prose'
      const triggerState = this.getAdventureTriggerState(triggerType)
      if (!triggerState.isReady || !triggerState.latestEntry) {
        throw new Error('当前剧情还不足以生成草稿')
      }
      if (triggerState.isGenerating) {
        throw new Error('AI 正在处理草稿，请稍候')
      }
      if (triggerState.cooldownRemainingMs > 0) {
        throw new Error('按钮冷却中，请稍后再试')
      }
      if (triggerState.usesRemaining <= 0) {
        throw new Error('本分钟触发次数已达上限，请稍后再试')
      }

      this.loadApiSettings()
      this.adventureTriggerPendingType = triggerType
      const plotEntry = triggerState.latestEntry
      const title = this.buildAdventureTriggerTitle(triggerType, plotEntry)

      this.setAdventureTriggerDraft(triggerType, {
        type: triggerType,
        title,
        chapterId: plotEntry.chapterId,
        sourcePlotId: plotEntry.id || plotEntry.chapterId,
        summary: plotEntry.summary,
        sourceMessageIds: plotEntry.sourceMessageIds || [],
        updatedAt: Date.now(),
        generatedAt: Date.now(),
        status: 'generating',
        ...(triggerType === 'storyboard' ? { shots: [] } : { content: '' })
      })

      try {
        const worldStore = useWorldStore()
        const payload = {
          worldbook: worldStore.activeWorldbook,
          runtimeState: this.getRuntimeSnapshot(),
          chatHistory: this.chatHistory,
          plotEntry,
          settings: this.apiSettings,
          sessionTitle: findSession(this.sessions, this.currentSessionId)?.title || ''
        }

        const result = triggerType === 'storyboard'
          ? await generateAdventureStoryboardDraft(payload)
          : await generateAdventureProseDraft(payload)

        if (!result?.success) {
          throw new Error(triggerType === 'storyboard' ? '整理分镜失败，请稍后重试' : '章节草稿生成失败，请稍后重试')
        }

        this.registerAdventureTriggerUsage(triggerType)
        return this.setAdventureTriggerDraft(triggerType, {
          type: triggerType,
          title,
          chapterId: plotEntry.chapterId,
          sourcePlotId: plotEntry.id || plotEntry.chapterId,
          summary: plotEntry.summary,
          sourceMessageIds: plotEntry.sourceMessageIds || [],
          generatedAt: Date.now(),
          updatedAt: Date.now(),
          status: 'ready',
          ...(triggerType === 'storyboard'
            ? { shots: result.shots || [] }
            : { content: result.content || '' })
        })
      } catch (error) {
        this.setAdventureTriggerDraft(triggerType, {
          type: triggerType,
          title,
          chapterId: plotEntry.chapterId,
          sourcePlotId: plotEntry.id || plotEntry.chapterId,
          summary: plotEntry.summary,
          sourceMessageIds: plotEntry.sourceMessageIds || [],
          generatedAt: Date.now(),
          updatedAt: Date.now(),
          status: 'error',
          error: error?.message || '草稿生成失败',
          ...(triggerType === 'storyboard' ? { shots: [] } : { content: '' })
        })
        throw error
      } finally {
        this.adventureTriggerPendingType = null
      }
    },

    async acceptAdventureTriggerDraft(type) {
      const triggerType = type === 'storyboard' ? 'storyboard' : 'prose'
      const draft = this.adventureTriggers?.[triggerType]
      if (!draft || draft.status !== 'ready') {
        throw new Error('当前没有可采纳的草稿')
      }

      const plotEntry = this.latestPlotJournalEntry()
      const projectId = this.worldId || resolveActiveWorldbookId() || null
      const sourceMessageIds = Array.isArray(draft.sourceMessageIds) ? draft.sourceMessageIds : []
      const creativeSourceRefs = this.getCurrentCreativeSourceRefs(sourceMessageIds, plotEntry)

      if (triggerType === 'storyboard') {
        const asset = addNarrativeAsset({
          title: draft.title || this.buildAdventureTriggerTitle('storyboard', plotEntry),
          content: formatAdventureStoryboardSeedContent(draft),
          kind: 'storyboard-seed',
          projectId,
          status: 'inbox',
          source: {
            type: 'experience-session',
            id: this.currentSessionId || '',
            messageIds: sourceMessageIds
          },
          sourceRefs: creativeSourceRefs
        })
        const storyboardSourceRefs = mergeSourceRefs([
          ...asset.sourceRefs,
          createNarrativeAssetSourceRef(asset)
        ])

        const storyboard = saveValidatedStoryboardVersion({
          projectId,
          source: {
            sourceType: 'narrative-asset',
            sourceId: asset.id,
            title: asset.title
          },
          sourceRefs: storyboardSourceRefs,
          shots: draft.shots || [],
          taskType: 'adventure.trigger.storyboard',
          parameters: {
            chapterId: draft.chapterId || '',
            sessionId: this.currentSessionId || '',
            sourcePlotId: draft.sourcePlotId || ''
          }
        })

        const acceptedDraft = this.setAdventureTriggerDraft(triggerType, {
          ...draft,
          status: 'accepted',
          assetId: asset.id,
          storyboardDocumentId: storyboard.document.id,
          storyboardVersionId: storyboard.version.versionId,
          acceptedAt: Date.now(),
          updatedAt: Date.now()
        })
        return {
          type: triggerType,
          draft: acceptedDraft,
          asset,
          storyboard
        }
      }

      const asset = addNarrativeAsset({
        title: draft.title || this.buildAdventureTriggerTitle('prose', plotEntry),
        content: draft.content || '',
        kind: 'draft-prose',
        projectId,
        status: 'inbox',
          source: {
            type: 'experience-session',
            id: this.currentSessionId || '',
            messageIds: sourceMessageIds
          },
          sourceRefs: creativeSourceRefs
        })

      const acceptedDraft = this.setAdventureTriggerDraft(triggerType, {
        ...draft,
        status: 'accepted',
        assetId: asset.id,
        acceptedAt: Date.now(),
        updatedAt: Date.now()
      })
      return {
        type: triggerType,
        draft: acceptedDraft,
        asset
      }
    },

    dismissAdventureTriggerDraft(type) {
      this.clearAdventureTriggerDraft(type)
    },

    buildPlotJournalEntry() {
      const history = Array.isArray(this.chatHistory) ? this.chatHistory : []
      const bodyMessages = history.filter((message) => message?.role === 'user' || message?.role === 'assistant')
      const lastEntry = this.plotJournal?.[this.plotJournal.length - 1] || null
      const sourceStartIndex = normalizeNumber(lastEntry?.sourceEndIndex, 0)
      const pendingMessages = bodyMessages.slice(sourceStartIndex)
      const assistantTurns = pendingMessages.filter((message) => message.role === 'assistant').length

      if (assistantTurns < PLOT_JOURNAL_TURN_INTERVAL) {
        return null
      }

      const summary = compactPlotJournalSummary(pendingMessages)
      if (!summary) {
        return null
      }

      const chapterNumber = (this.plotJournal?.length || 0) + 1
      const participants = normalizeEncounteredCharacters(this.encounteredCharacters)
        .slice(-4)
        .map((character) => character.name)
      const locations = [
        this.worldMapState?.currentCountry,
        this.worldMapState?.currentCity,
        this.worldMapState?.currentScene
      ].map(normalizeTextValue).filter(Boolean)
      const keyChoices = normalizeKeyChoices(this.keyChoices)
        .slice(-3)
        .map((choice) => choice.label)
      const unresolvedHooks = normalizeGoals(this.goals)
        .filter((goal) => goal.status !== 'completed')
        .slice(0, 3)
        .map((goal) => goal.title)

      return {
        chapterId: `chapter-${chapterNumber}`,
        summary,
        participants,
        locations,
        keyChoices,
        unresolvedHooks,
        sourceMessageIds: pendingMessages.map((_, index) => `chat-${sourceStartIndex + index + 1}`),
        sourceStartIndex,
        sourceEndIndex: bodyMessages.length,
        createdAt: Date.now()
      }
    },

    maybeAppendPlotJournalEntry() {
      const entry = this.buildPlotJournalEntry()
      if (!entry) return null
      this.appendPlotJournal(entry)
      // Keep the journal API synchronous for existing callers; worldbook
      // writeback is best-effort and must never delay the next AI turn.
      void this.persistLatestPlayerHistoryNode()
      return entry
    },

    // --- 会话管理 ---
    loadSessions() {
      const raw = getItem(STORAGE_KEYS.WRITING_SESSIONS)
      this.sessions = Array.isArray(raw) ? raw : []
    },

    saveSessions() {
      getSaveSessionsDebouncer(this)()
    },

    flushSaveSessions() {
      const debounced = saveSessionDebouncers.get(this)
      if (debounced) debounced.flush()
      else setItem(STORAGE_KEYS.WRITING_SESSIONS, this.sessions)
    },

    getLatestSessionForWorldbook(worldbookId) {
      if (!worldbookId) return null
      const target = worldbookId
      const sorted = [...this.sessions].sort(
        (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
      )
      return (
        sorted.find((s) => (s.worldbookId || s.worldId) === target) || null
      )
    },

    createSession(options = {}) {
      const { title = '新会话', worldbookId = null, inheritRuntimeState = false } = options || {}
      const currentWorldbookId = worldbookId || resolveActiveWorldbookId() || this.worldId || ''
      const runtimeState = inheritRuntimeState
        ? this.getRuntimeSnapshot()
        : createEmptySessionRuntime()

      const session = {
        id: 'sess_' + Date.now(),
        schemaVersion: 1,
        title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        worldId: currentWorldbookId,
        worldbookId: currentWorldbookId,
        runtimeState,
        messages: cloneState(runtimeState.messages, []),
        chatHistory: cloneState(runtimeState.chatHistory, []),
        worldState: {
          character: cloneState(runtimeState.writingCharacter, DEFAULT_WRITING_CHARACTER),
          time: cloneState(runtimeState.writingTime, DEFAULT_WRITING_TIME),
          worldMap: cloneState(runtimeState.worldMapState, DEFAULT_WORLD_MAP_STATE),
          activities: cloneState(runtimeState.activities, [])
        }
      }
      this.sessions.push(session)
      this.currentSessionId = session.id
      if (!inheritRuntimeState) {
        this.resetRuntimeState()
        this.worldId = currentWorldbookId
      }
      this.saveSessions()
      return session
    },

    saveCurrentSession() {
      if (!this.currentSessionId) return
      const idx = this.sessions.findIndex(s => s.id === this.currentSessionId)
      if (idx === -1) return
      this.messages = normalizeNarrativeMessages(this.messages)
      const runtimeState = this.getRuntimeSnapshot()
      const worldbookId = this.worldId || this.sessions[idx].worldbookId || this.sessions[idx].worldId || resolveActiveWorldbookId() || ''
      this.sessions[idx].schemaVersion = this.sessions[idx].schemaVersion || 1
      this.sessions[idx].messages = cloneState(this.messages, [])
      this.sessions[idx].chatHistory = cloneState(this.chatHistory, [])
      this.sessions[idx].runtimeState = runtimeState
      this.sessions[idx].worldState = {
        character: cloneState(this.writingCharacter, DEFAULT_WRITING_CHARACTER),
        time: cloneState(this.writingTime, DEFAULT_WRITING_TIME),
        worldMap: cloneState(this.worldMapState, DEFAULT_WORLD_MAP_STATE),
        activities: cloneState(this.activities, [])
      }
      // R1a：回合事务记录随 session 持久化（LRU ≤50，含全量 preRuntimeSnapshot）
      this.sessions[idx].turnRecords = normalizeTurnRecords(this.turnRecords)
      this.sessions[idx].lastCommittedTurnId = this.lastCommittedTurnId || null
      this.sessions[idx].activeBranchId = this.activeBranchId || 'main'  // P0-4：活动分支持久化
      this.sessions[idx].worldId = worldbookId
      this.sessions[idx].worldbookId = worldbookId
      this.sessions[idx].updatedAt = Date.now()
      // 更新标题为第一条消息的前30字
      if (this.messages.length > 1) {
        const firstMsg = this.messages.find(m => m.role === 'assistant' && m.content)
        if (firstMsg) {
          this.sessions[idx].title = firstMsg.content.slice(0, 30) + (firstMsg.content.length > 30 ? '...' : '')
        }
      }
      this.saveSessions()
    },

    loadSession(id) {
      this.cancelNarrativeGeneration('session-changed')
      const session = this.sessions.find(s => s.id === id)
      if (!session) return null
      this.currentSessionId = session.id
      const runtimeState = session.runtimeState || {}
      this.messages = normalizeNarrativeMessages(cloneState(session.messages || runtimeState.messages || [], []))
      this.chatHistory = cloneState(session.chatHistory || runtimeState.chatHistory || [], [])
      const character = cloneState(session.worldState?.character || runtimeState.writingCharacter || DEFAULT_WRITING_CHARACTER, DEFAULT_WRITING_CHARACTER)
      this.writingCharacter = normalizeWritingCharacter(character)
      this.writingTime = normalizeWritingTime(session.worldState?.time || runtimeState.writingTime || DEFAULT_WRITING_TIME)
      this.placeStates = normalizePlaceStates(runtimeState.placeStates)
      this.characterStates = normalizeCharacterStates(runtimeState.characterStates)
      this.characterRelations = normalizeCharacterRelations(runtimeState.characterRelations)
      this.canonicalFacts = normalizeCanonicalFacts(runtimeState.canonicalFacts)
      this.worldMapState = normalizeWorldMapState(session.worldState?.worldMap || runtimeState.worldMapState || DEFAULT_WORLD_MAP_STATE)
      this.historyNode = cloneState(runtimeState.historyNode || null, null)
      this.narrativeSceneSummary = normalizeNarrativeSceneSummary(runtimeState.narrativeSceneSummary)
      this.activities = cloneState(session.worldState?.activities || runtimeState.activities || [], [])
      const adventureState = normalizeAdventureState(runtimeState)
      this.goals = adventureState.goals
      this.encounteredCharacters = adventureState.encounteredCharacters
      this.factionRelations = adventureState.factionRelations
      this.keyChoices = adventureState.keyChoices
      this.plotJournal = adventureState.plotJournal
      this.adventureTriggers = cloneState(adventureState.adventureTriggers, DEFAULT_ADVENTURE_STATE.adventureTriggers)
      this.adventureTriggerHistory = cloneState(adventureState.adventureTriggerHistory, [])
      this.adventureTriggerCooldownUntil = adventureState.adventureTriggerCooldownUntil || 0
      this.emergenceCandidates = cloneState(adventureState.emergenceCandidates, [])
      this.emergenceDismissedIds = cloneState(adventureState.emergenceDismissedIds, [])
      this.emergenceDraft = cloneState(adventureState.emergenceDraft, null)
      this.adventureTriggerPendingType = null
      // 同时恢复 playerCharacter
      this.playerCharacter = {
        name: runtimeState.playerCharacter?.name || this.writingCharacter?.name || 'User',
        avatar: runtimeState.playerCharacter?.avatar || this.playerCharacter?.avatar || '',
        gender: runtimeState.playerCharacter?.gender || this.writingCharacter?.gender || '',
        age: runtimeState.playerCharacter?.age || this.writingCharacter?.age || ''
      }
      this.player = cloneState(runtimeState.player || this.player, { vitality: 100, maxVitality: 100, mood: 80, maxMood: 100, money: 100, level: 1, exp: 0 })
      this.inventory = cloneState(runtimeState.inventory || this.inventory, [])
      this.quests = cloneState(runtimeState.quests || this.quests, [])
      this.flags = cloneState(runtimeState.flags || this.flags, {})
      this.npcRelations = cloneState(runtimeState.npcRelations || this.npcRelations, {})
      this.discoveredPlaces = cloneState(runtimeState.discoveredPlaces || this.discoveredPlaces, [])
      this.completedQuests = cloneState(runtimeState.completedQuests || this.completedQuests, [])
      this.activeMechanism = runtimeState.activeMechanism ?? session.activeMechanism ?? null
      this.mechanismContext = cloneState(runtimeState.mechanismContext || session.mechanismContext || null, null)
      this.milestoneEvent = cloneState(runtimeState.milestoneEvent || session.milestoneEvent || null, null)
      this.dialogueMode = !!runtimeState.dialogueMode
      this.dialogueCharacter = cloneState(runtimeState.dialogueCharacter || null, null)
      this.aiCharacter = cloneState(runtimeState.aiCharacter || this.aiCharacter, { name: 'Assistant', avatar: '' })
      this.runtimeEvents = capRuntimeEvents(
        Array.isArray(runtimeState.runtimeEvents) ? runtimeState.runtimeEvents : [],
        RUNTIME_EVENT_LIMIT
      )
      // R1a：恢复回合事务记录（供 regenerate 回滚）
      this.turnRecords = normalizeTurnRecords(session.turnRecords || {})
      this.lastCommittedTurnId = session.lastCommittedTurnId || null
      this.activeBranchId = session.activeBranchId || 'main'  // P0-4：恢复活动分支
      this.pendingTurnRecord = null
      this.worldId = session.worldbookId || session.worldId || this.worldId || ''
      this.isPlaying = true
      this.saveSessions()
      return session
    },

    deleteSession(id) {
      this.sessions = this.sessions.filter(s => s.id !== id)
      if (this.currentSessionId === id) {
        this.currentSessionId = null
      }
      this.saveSessions()
    },

    setQuickNoteImportMode(enabled) {
      this.quickNoteImportMode = !!enabled
      if (!enabled) this.quickNoteSelectedMessageIndexes = []
    },

    toggleQuickNoteMessageSelection(index) {
      const idx = Number(index)
      if (!Number.isInteger(idx) || idx < 0) return
      const next = [...this.quickNoteSelectedMessageIndexes]
      const found = next.indexOf(idx)
      if (found >= 0) next.splice(found, 1)
      else next.push(idx)
      this.quickNoteSelectedMessageIndexes = next.sort((a, b) => a - b)
    },

    clearQuickNoteMessageSelection() {
      this.quickNoteSelectedMessageIndexes = []
    },

    selectedQuickNoteMessages() {
      const picked = new Set(this.quickNoteSelectedMessageIndexes)
      return this.messages
        .map((message, index) => ({ message, index }))
        .filter(({ message, index }) => {
          const role = message.role || message.type || 'assistant'
          return picked.has(index) && role !== 'system' && String(message.content || '').trim()
        })
        .map(({ message }) => String(message.content || '').trim())
    },

    getRuntimeSnapshot() {
      return {
        messages: cloneState(this.messages, []),
        chatHistory: cloneState(this.chatHistory, []),
        time: cloneState(this.time, { day: 1, period: '早晨' }),
        player: cloneState(this.player, { vitality: 100, maxVitality: 100, mood: 80, maxMood: 100, money: 100, level: 1, exp: 0 }),
        inventory: cloneState(this.inventory, []),
        quests: cloneState(this.quests, []),
        flags: cloneState(this.flags, {}),
        activities: cloneState(this.activities, []),
        goals: cloneState(this.goals, DEFAULT_ADVENTURE_STATE.goals),
        encounteredCharacters: cloneState(this.encounteredCharacters, DEFAULT_ADVENTURE_STATE.encounteredCharacters),
        factionRelations: cloneState(this.factionRelations, DEFAULT_ADVENTURE_STATE.factionRelations),
        keyChoices: cloneState(this.keyChoices, DEFAULT_ADVENTURE_STATE.keyChoices),
        plotJournal: cloneState(this.plotJournal, DEFAULT_ADVENTURE_STATE.plotJournal),
        adventureTriggers: cloneState(this.adventureTriggers, DEFAULT_ADVENTURE_STATE.adventureTriggers),
        adventureTriggerHistory: cloneState(this.adventureTriggerHistory, []),
        adventureTriggerCooldownUntil: this.adventureTriggerCooldownUntil,
        emergenceCandidates: cloneState(this.emergenceCandidates, []),
        emergenceDismissedIds: cloneState(this.emergenceDismissedIds, []),
        emergenceDraft: cloneState(this.emergenceDraft, null),
        npcRelations: cloneState(this.npcRelations, {}),
        discoveredPlaces: cloneState(this.discoveredPlaces, []),
        completedQuests: cloneState(this.completedQuests, []),
        writingCharacter: cloneState(this.writingCharacter, DEFAULT_WRITING_CHARACTER),
        writingTime: cloneState(this.writingTime, DEFAULT_WRITING_TIME),
        placeStates: cloneState(this.placeStates, {}),
        characterStates: cloneState(this.characterStates, {}),
        characterRelations: cloneState(this.characterRelations, {}),
        canonicalFacts: cloneState(this.canonicalFacts, {}),
        worldMapState: cloneState(this.worldMapState, DEFAULT_WORLD_MAP_STATE),
        historyNode: cloneState(this.historyNode, null),
        narrativeSceneSummary: cloneState(this.narrativeSceneSummary, null),
        activeMechanism: this.activeMechanism,
        mechanismContext: cloneState(this.mechanismContext, null),
        milestoneEvent: cloneState(this.milestoneEvent, null),
        playerCharacter: cloneState(this.playerCharacter, { name: 'User', avatar: '' }),
        aiCharacter: cloneState(this.aiCharacter, { name: 'Assistant', avatar: '' }),
        dialogueMode: this.dialogueMode,
        dialogueCharacter: cloneState(this.dialogueCharacter, null),
        runtimeEvents: capRuntimeEvents(
          Array.isArray(this.runtimeEvents) ? this.runtimeEvents : [],
          RUNTIME_EVENT_LIMIT
        )
      }
    },

    // R1a：从 preRuntimeSnapshot 恢复 runtime state（回合事务失败/regenerate 回滚用）。
    // 复用 loadSession 的 normalize 模式；不恢复 messages/chatHistory（由调用方单独处理）。
    applyRuntimeSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return
      const s = snapshot
      this.placeStates = normalizePlaceStates(s.placeStates)
      this.characterStates = normalizeCharacterStates(s.characterStates)
      this.characterRelations = normalizeCharacterRelations(s.characterRelations)
      this.canonicalFacts = normalizeCanonicalFacts(s.canonicalFacts)
      this.worldMapState = normalizeWorldMapState(s.worldMapState || DEFAULT_WORLD_MAP_STATE)
      this.historyNode = cloneState(s.historyNode || null, null)
      this.narrativeSceneSummary = normalizeNarrativeSceneSummary(s.narrativeSceneSummary)
      this.activities = cloneState(s.activities || [], [])
      const adventureState = normalizeAdventureState(s)
      this.goals = adventureState.goals
      this.encounteredCharacters = adventureState.encounteredCharacters
      this.factionRelations = adventureState.factionRelations
      this.keyChoices = adventureState.keyChoices
      this.plotJournal = adventureState.plotJournal
      this.adventureTriggers = cloneState(adventureState.adventureTriggers, DEFAULT_ADVENTURE_STATE.adventureTriggers)
      this.adventureTriggerHistory = cloneState(adventureState.adventureTriggerHistory, [])
      this.adventureTriggerCooldownUntil = adventureState.adventureTriggerCooldownUntil || 0
      this.emergenceCandidates = cloneState(adventureState.emergenceCandidates, [])
      this.emergenceDismissedIds = cloneState(adventureState.emergenceDismissedIds, [])
      this.emergenceDraft = cloneState(adventureState.emergenceDraft, null)
      this.adventureTriggerPendingType = null
      this.player = cloneState(s.player || this.player, { vitality: 100, maxVitality: 100, mood: 80, maxMood: 100, money: 100, level: 1, exp: 0 })
      this.inventory = cloneState(s.inventory || this.inventory, [])
      this.quests = cloneState(s.quests || this.quests, [])
      this.flags = cloneState(s.flags || this.flags, {})
      this.npcRelations = cloneState(s.npcRelations || this.npcRelations, {})
      this.discoveredPlaces = cloneState(s.discoveredPlaces || this.discoveredPlaces, [])
      this.completedQuests = cloneState(s.completedQuests || this.completedQuests, [])
      this.activeMechanism = s.activeMechanism ?? null
      this.mechanismContext = cloneState(s.mechanismContext || null, null)
      this.milestoneEvent = cloneState(s.milestoneEvent || null, null)
      this.dialogueMode = !!s.dialogueMode
      this.dialogueCharacter = cloneState(s.dialogueCharacter || null, null)
      this.writingCharacter = normalizeWritingCharacter(s.writingCharacter || DEFAULT_WRITING_CHARACTER)
      this.writingTime = normalizeWritingTime(s.writingTime || DEFAULT_WRITING_TIME)
      this.runtimeEvents = capRuntimeEvents(
        Array.isArray(s.runtimeEvents) ? s.runtimeEvents : [],
        RUNTIME_EVENT_LIMIT
      )
      // 立即落盘（不依赖 500ms debouncer），崩溃/刷新不丢恢复结果
      this.flushSaveSessions()
    },

    appendRuntimeEvent(input = {}) {
      const current = Array.isArray(this.runtimeEvents) ? this.runtimeEvents : []
      const previous = current[current.length - 1]
      const requestedParentId = String(input?.parentId == null ? '' : input.parentId).trim()
      const requestedBranchId = String(input?.branchId == null ? '' : input.branchId).trim() || 'main'
      const event = createRuntimeEvent({
        ...(input || {}),
        parentId: requestedParentId || (previous?.branchId === requestedBranchId ? previous.id : '')
      })
      this.runtimeEvents = capRuntimeEvents(current.concat([event]), RUNTIME_EVENT_LIMIT)
      return event
    },

    getRuntimeCausalityReport() {
      return buildRuntimeEventCausality(this.runtimeEvents)
    },

    resolveRuntimeConflict(input = {}) {
      const request = input && typeof input === 'object' ? input : {}
      const report = this.getRuntimeCausalityReport()
      const requestedKey = String(request.conflictKey || '').trim()
      const conflict = report.activeConflicts.find((item) => (
        requestedKey
          ? item.conflictKey === requestedKey
          : item.eventId === String(request.eventId || '').trim()
            && item.code === String(request.code || '').trim()
      ))
      if (!conflict) {
        return { ok: false, error: '待审阅冲突不存在或已经处理' }
      }

      const isBranchMerge = conflict.code === 'branch-merge-conflict'
      const resolution = {
        conflictKey: buildRuntimeConflictKey(conflict),
        conflictEventId: conflict.eventId,
        conflictCode: conflict.code,
        resolution: isBranchMerge ? 'choose-branch' : 'accept-current',
        chosenBranchId: isBranchMerge ? String(request.chosenBranchId || '').trim() : '',
        path: String(conflict.path || '').trim()
      }
      if (!canResolveRuntimeConflict(conflict, resolution)) {
        return {
          ok: false,
          error: isBranchMerge ? '所选分支与当前合并结果不一致' : '该冲突需要先修复事件结构'
        }
      }

      const event = this.appendRuntimeEvent({
        type: 'display_event',
        source: 'user',
        parentId: conflict.eventId,
        branchId: conflict.branchId || 'main',
        payload: {
          kind: 'runtime-conflict-resolution',
          contextual: false,
          conflictResolution: resolution
        }
      })
      this.saveCurrentSession()
      return { ok: true, event, conflict }
    },

    // --- 压缩上下文：精简聊天历史，减少 token 用量 ---
    async compressContext() {
      this.loadApiSettings()
      const result = await compressChatHistory(this.chatHistory, {
        settings: this.apiSettings,
        worldId: this.worldId,
        sessionId: this.currentSessionId,
        keepRecentCount: 6,
        maxSummaryChars: 1400
      })

      if (!result.compressed) return result

      this.chatHistory = result.newHistory
      this.refreshNarrativeSceneSummary()
      this.saveCurrentSession()
      return result
    },

    summarizeMessages(messages) {
      return buildHeuristicContextSummary(messages, { maxSummaryChars: 1400 })
    },

    refreshNarrativeSceneSummary() {
      const worldStore = useWorldStore()
      const projectId = this.worldId || worldStore.activeWorldbook?.id || ''
      const resolved = resolveNarrativeSceneSummary({
        messages: this.chatHistory,
        previousSummary: this.narrativeSceneSummary,
        projectId,
        sessionId: this.currentSessionId || ''
      })
      this.narrativeSceneSummary = resolved.summary
      return resolved
    },

    // --- 对话模式 ---
    toggleDialogueMode() {
      this.dialogueMode = !this.dialogueMode
      if (!this.dialogueMode) {
        this.dialogueCharacter = null
      }
      this.saveCurrentSession()
    },

    selectDialogueCharacter(character) {
      this.dialogueCharacter = character
      this.dialogueMode = false
      this.saveCurrentSession()
    },

    clearDialogueCharacter() {
      this.dialogueCharacter = null
      this.dialogueMode = false
      this.saveCurrentSession()
    },

    loadDialogueCharacters() {
      const saved = localStorage.getItem('dialogue_characters')
      if (saved) {
        this.dialogueCharacters = JSON.parse(saved)
      }
    },

    saveDialogueCharacter(character) {
      const exists = this.dialogueCharacters.find(c => c.id === character.id)
      if (!exists) {
        this.dialogueCharacters.push(character)
        localStorage.setItem('dialogue_characters', JSON.stringify(this.dialogueCharacters))
      }
    },

    deleteDialogueCharacter(id) {
      this.dialogueCharacters = this.dialogueCharacters.filter(c => c.id !== id)
      if (this.dialogueCharacter?.id === id) {
        this.dialogueCharacter = null
      }
      localStorage.setItem('dialogue_characters', JSON.stringify(this.dialogueCharacters))
    },

    // --- 机制触发系统 ---
    detectMechanismTriggers(content) {
      if (!content || typeof content !== 'string') return null

      // 更严格的触发条件：需要明确的场景描述
      const triggers = {
        combat: {
          patterns: [
            /战斗[开始爆发即将]/,
            /拔[出剑].*迎战/,
            /敌人.*攻击/,
            /挥剑.*冲向/,
            /陷入.*苦战/,
            /抽[出枪].*射击/,
            /扣下扳机/,
            /火[光焰].*喷[射出]/,
            /冲入.*房间/,
            /闪避.*攻击/,
            /举起.*武器/
          ],
          excludePatterns: [
            /想起.*战斗/,
            /回忆.*战斗/,
            /听说.*战斗/,
            /关于.*战斗/
          ]
        },
        trade: {
          patterns: [
            /商店.*老板/,
            /摊位.*摆满/,
            /商人.*问道/,
            /购买.*商品/,
            /交易.*完成/
          ],
          excludePatterns: [
            /听说.*交易/,
            /回忆.*交易/
          ]
        },
        quest: {
          patterns: [
            /任务目标[是为]/,
            /委托[你你去]/,
            /悬赏.*公告/,
            /接受.*任务/
          ],
          excludePatterns: []
        },
        dialogue: {
          patterns: [
            /"([^"]{5,})"/,  // 引号内至少5个字
            /“([^”]{5,})”/,
            /「([^」]{5,})」/
          ],
          excludePatterns: []
        }
      }

      for (const [type, config] of Object.entries(triggers)) {
        const { patterns, excludePatterns } = config

        // 先检查排除模式
        if (excludePatterns.some((exclude) => exclude.test(content))) {
          continue
        }

        // 再检查触发模式
        for (const pattern of patterns) {
          const match = content.match(pattern)
          if (match) {
            const payload = {
              type,
              match: match[0],
              context: match[1] || match[2] || match[0],
              preview: String(content).replace(/\s+/g, ' ').trim().slice(0, 120)
            }

            // 额外检查：确保不是叙述性提及
            const beforeText = content.slice(0, match.index)
            if (/(回忆|想起|听说|关于|曾经)/.test(beforeText.slice(-20))) {
              continue
            }

            if (type === 'dialogue') {
              return {
                ...payload,
                ...this.extractDialogueMechanism(content, match)
              }
            }

            return payload
          }
        }
      }

      return null
    },

    extractDialogueMechanism(content, match) {
      const fullText = String(content || '')
      const quoteText = String(match?.[0] || '').trim()
      const quoteBody = String(
        match?.[1]
        || match?.[2]
        || quoteText.replace(/^["“「]|["”」]$/g, '')
        || quoteText
      ).trim()
      const speaker = this.extractDialogueSpeaker(fullText, match)

      return {
        speaker,
        dialogue: quoteBody,
        preview: quoteText ? quoteText.slice(0, 120) : fullText.replace(/\s+/g, ' ').trim().slice(0, 120)
      }
    },

    extractDialogueSpeaker(content, match) {
      const fullText = String(content || '')
      const matchIndex = Number.isInteger(match?.index) ? match.index : fullText.indexOf(match?.[0] || '')
      if (matchIndex < 0) return ''

      const prefix = fullText.slice(0, matchIndex).replace(/\s+/g, ' ').trim()
      const tail = prefix.slice(-40)
      const speakerPatterns = [
        /([^\s，。！？、“”"'《》]{2,12}?)(?:低声说|轻声说|沉声说|喃喃道|回应道|开口道|说道|问道|答道|笑道|喊道|叹道|说|道)(?:[:：]?)$/,
        /([^\s，。！？、“”"'《》]{2,12})[:：]?$/
      ]

      for (const pattern of speakerPatterns) {
        const found = tail.match(pattern)
        if (found?.[1]) {
          const candidate = found[1].trim()
          if (!/^(我|你|他|她|它|这|那|一个|一位|对方|别人)$/.test(candidate)) {
            return candidate
          }
        }
      }

      return ''
    },

    activateMechanism(type, context = null) {
      const validTypes = ['combat', 'trade', 'quest', 'dialogue']
      if (!validTypes.includes(type)) return

      this.activeMechanism = type
      this.mechanismContext = context
    },

    deactivateMechanism() {
      this.activeMechanism = null
      this.mechanismContext = null
    },

    // --- 里程碑事件系统 ---
    detectMilestoneEvent(content, previousLocation = null) {
      if (!content || typeof content !== 'string') return null

      // 更严格的场景切换检测：需要明确的探索/发现意味
      const locationPatterns = [
        /首次进入(.+?)[，。！？]/,
        /发现[了](.+?)[，。！？]/,
        /踏入[从未到过]?[的]?(.+?)[，。！？]/,
        /抵达[了]([一这那][^，。！？]{2,10})[，。！？]/
      ]

      for (const pattern of locationPatterns) {
        const match = content.match(pattern)
        if (match && match[1]) {
          const newLocation = match[1].trim()
          if (newLocation.length >= 2 && newLocation.length <= 20) {
            return {
              type: 'location-unlock',
              data: {
                location: newLocation,
                previousLocation,
                description: content.slice(0, 200)
              }
            }
          }
        }
      }

      // 不再自动检测角色登场 - 太容易误触发
      return null
    },

    // 内联事件检测（用于标记，不弹窗）
    detectInlineEvents(content, messageId) {
      if (!content || typeof content !== 'string') return []

      const events = []

      // 检测对话引号
      const dialogueMatches = content.matchAll(/"([^"]{3,})"|「([^」]{3,})」/g)
      for (const match of dialogueMatches) {
        const dialogueText = match[1] || match[2]
        if (dialogueText && dialogueText.length >= 3) {
          events.push({
            type: 'dialogue',
            text: match[0],
            data: { dialogue: dialogueText },
            messageId
          })
        }
      }

      // 检测重要物品
      const itemPatterns = [
        /获得[了]?(.+?道具|.+?武器|.+?装备|.+?物品)/,
        /发现[了]?(.+?道具|.+?武器|.+?装备|.+?物品)/
      ]
      for (const pattern of itemPatterns) {
        const match = content.match(pattern)
        if (match && match[1]) {
          events.push({
            type: 'item',
            text: match[0],
            data: { item: match[1].trim() },
            messageId
          })
          break
        }
      }

      return events
    },

    addInlineEvents(events) {
      if (!Array.isArray(events) || events.length === 0) return
      // 只保留最近消息的内联事件
      this.inlineEvents = events
    },

    clearInlineEvents() {
      this.inlineEvents = []
    },

    triggerMilestoneEvent(event) {
      if (!event || !event.type) return
      this.milestoneEvent = event
    },

    clearMilestoneEvent() {
      this.milestoneEvent = null
    },

    async sendAction(text, options = {}) {
      if (!text.trim()) return

      const { hidden = false, narrativeMode = '', directorNote = '' } = options
      // P1-5：导演注消费 —— options 显式传入优先，否则消费 pendingDirectorNote（dispatcher 设置）
      const effectiveDirectorNote = directorNote || this.pendingDirectorNote || ''
      // 发送时标记 pending 已被消费（成功提交后清空；失败保留在 generateAIResponse catch）
      const consumedPendingDirectorNote = effectiveDirectorNote === this.pendingDirectorNote
      if (consumedPendingDirectorNote) this.pendingDirectorNote = null

      // 隐藏命令不显示在 UI 中，但加入 AI 上下文
      let userMessageId = ''
      if (!hidden) {
        userMessageId = createMessageId('user')
        this.messages.push({
          id: userMessageId,
          role: 'user',
          content: text,
          timestamp: Date.now(),
          branchId: this.activeBranchId  // R1b：区分分支
        })
      }
      this.chatHistory.push({ role: 'user', content: text })
      this.appendRuntimeEvent({
        type: 'turn',
        source: 'user',
        payload: {
          preview: String(text || '').slice(0, 200),
          hidden: !!hidden
        }
      })
      this.saveCurrentSession()

      if (this.useAI) {
        await this.generateAIResponse({ narrativeMode, directorNote: effectiveDirectorNote, userMessageId })
      } else {
        this.isLoading = true
        try {
          const response = await apiSendAction(this.gameId, text)
          this.updateState(response)
          if (response.events) {
            for (const event of response.events) {
              if (event.type !== 'system' && event.type !== 'time_advance') {
                this.messages.push({
                  id: createMessageId('assistant'),
                  role: 'assistant',
                  content: event.description,
                  timestamp: Date.now()
                })
              }
            }
          }
          if (response.timeAdvanced) {
            this.messages.push({
              id: createMessageId('system'),
              role: 'system',
              content: `时间已推进：${response.timeDescription}`,
              timestamp: Date.now()
            })
          }
          this.saveCurrentSession()
        } catch (e) {
          this.lastError = e.message
          this.messages.push({ id: createMessageId('system'), role: 'system', content: `错误：${e.message}`, timestamp: Date.now() })
        } finally {
          this.isLoading = false
        }
      }
    },

    // --- 修改：更新消息后同步记忆 ---
    updateMessage(index, newContent) {
      if (this.messages[index]) {
        this.messages[index].content = newContent;
        this.messages[index].presentation = parseNarrativePresentation(newContent, {
          messageId: this.messages[index].id,
          complete: true,
          fallbackSpeaker: getTrustedMessageSpeaker(this.messages[index]),
          role: this.messages[index].role
        })
        this.rebuildChatHistory(); // 同步 AI 记忆
        this.saveCurrentSession()
      }
    },

    // --- 修改：删除消息后同步记忆 ---
    deleteMessage(index) {
      if (this.messages[index]) {
        this.messages.splice(index, 1);
        this.rebuildChatHistory(); // 同步 AI 记忆
        this.saveCurrentSession()
      }
    },

    // --- 新增：核心”执行”功能 ---
    // 点击某条消息的”执行”按钮时调用
    // R1a：根据消息 id 反查所属的 turnRecord。
    // 优先精确匹配 assistantMessageIds；其次匹配 userMessageIds（用于从 user 消息 regenerate）。
    findTurnByMessageId(messageId) {
      if (!messageId) return null
      const records = Object.values(this.turnRecords || {})
      const byAssistant = records.find((r) => r.assistantMessageIds?.includes(String(messageId)))
      if (byAssistant) return byAssistant
      return records.find((r) => r.userMessageIds?.includes(String(messageId))) || null
    },

    async regenerateFrom(index) {
      debugLog('[regenerateFrom] START, messages count before slice:', this.messages.length, 'index:', index)
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
      // 被重写部分（index 之后）的旧分支消息标记 superseded（被新分支替代，过滤隐藏），
      // 共享前缀（index 及之前）无 branchId 总是显示。
      const oldBranchId = this.activeBranchId || 'main'
      const newBranchId = `branch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
      this.activeBranchId = newBranchId
      // 标记被重写部分为 superseded（含旧分支和 main 的旧回复）
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

      // 3. 如果开启了 AI，立即触发重新生成
      if (this.useAI) {
        // 标记为重写后续，避免触发初始化逻辑
        this._isRegenerating = true
        debugLog('[regenerateFrom] Starting, _isRegenerating:', this._isRegenerating)
        await this.generateAIResponse()
        this._isRegenerating = false
        debugLog('[regenerateFrom] Done, _isRegenerating:', this._isRegenerating)
      }
    },

    // R1b：切换候选/分支。恢复该分支的 post snapshot + 重建 chatHistory。
    switchBranch(branchId) {
      if (!branchId || branchId === this.activeBranchId) return
      const turn = Object.values(this.turnRecords || {}).find((r) => r?.branchId === branchId)
      if (turn?.postRuntimeSnapshot) {
        this.applyRuntimeSnapshot(turn.postRuntimeSnapshot)
      }
      // 重算 superseded：目标分支的消息解除标记，其他分支的消息标记（隐藏）
      for (const m of this.messages || []) {
        if (!m || typeof m !== 'object') continue
        if (m.branchId && m.branchId !== branchId) m.superseded = true
        else m.superseded = false
      }
      this.activeBranchId = branchId
      this.rebuildChatHistory()
      this.saveCurrentSession()
    },

    // R6：统一动作 dispatcher —— 按钮/快捷键/命令走同一入口。
    // 首批动作映射到现有 store 方法；返回 { ok, result? } 供调用方判断。
    async executeExperienceAction(input) {
      const action = normalizeExperienceAction(input)
      if (!action) return { ok: false, error: 'UNKNOWN_ACTION' }
      const { type, payload } = action
      try {
        switch (type) {
          case 'stop':
            this.cancelNarrativeGeneration('action:stop')
            return { ok: true }
          case 'retry':
            // payload: { index } —— 重写后续
            if (typeof payload.index === 'number') {
              await this.regenerateFrom(payload.index)
              return { ok: true }
            }
            return { ok: false, error: 'MISSING_INDEX' }
          case 'branch':
            // payload: { index } —— 从该消息处建立分支（保留旧消息，切新分支）
            if (typeof payload.index === 'number') {
              await this.regenerateFrom(payload.index)
              return { ok: true }
            }
            return { ok: false, error: 'MISSING_INDEX' }
          case 'director-note':
            // payload: { text } —— 设置仅下一轮导演注（由发送链路消费）
            this.pendingDirectorNote = String(payload.text || '').trim() || null
            return { ok: true }
          case 'speaker':
            // payload: { name } —— 手动点名角色（仅当前回合）
            if (payload.name) {
              this.dialogueCharacter = { name: String(payload.name), ...(payload.details || {}) }
              return { ok: true }
            }
            return { ok: false, error: 'MISSING_NAME' }
          case 'compress':
            await this.compressContext()
            return { ok: true }
          case 'continue':
            // P1-6：继续上一回复 —— 若最后一条是 assistant，追加"继续"引导重新生成
            {
              const last = this.messages[this.messages.length - 1]
              if (this.isLoading) return { ok: false, error: 'BUSY' }
              await this.generateAIResponse({ narrativeMode: last?.role === 'assistant' ? 'continue' : '' })
              return { ok: true }
            }
          case 'export':
            // P1-6：导出当前会话（消息 + 回合记录 + 活动分支），供备份/分享
            return {
              ok: true,
              result: {
                sessionId: this.currentSessionId || '',
                branchId: this.activeBranchId || 'main',
                messages: (this.messages || []).map((m) => ({
                  id: m?.id || null,
                  role: m?.role || m?.type || '',
                  content: m?.content || '',
                  branchId: m?.branchId || null,
                  superseded: Boolean(m?.superseded),
                })),
                turnRecords: this.turnRecords || {},
                lastCommittedTurnId: this.lastCommittedTurnId || null,
              }
            }
          default:
            return { ok: false, error: 'UNKNOWN_ACTION' }
        }
      } catch (e) {
        return { ok: false, error: e?.message || 'ACTION_FAILED' }
      }
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
      // P0-2：过滤 superseded（被其它分支替代的旧回复）和非活动分支消息，
      //       避免旧分支污染新一轮上下文。
      const activeBranch = this.activeBranchId || 'main'
      const history = this.messages
        .filter((m) => m && !m.superseded && (!m.branchId || m.branchId === activeBranch))
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

    cancelNarrativeGeneration(reason = 'user-cancelled') {
      const controller = narrativeAbortControllers.get(this)
      if (controller && !controller.signal.aborted) {
        const error = new Error(reason)
        error.code = 'NARRATIVE_AGENT_ABORTED'
        controller.abort(error)
      }
      this.narrativeAgentStatus = null
    },

    setNarrativeAgentStatus(status) {
      this.narrativeAgentStatus = status && typeof status === 'object'
        ? { ...status }
        : null
      if (typeof window !== 'undefined' && this.narrativeAgentStatus) {
        window.dispatchEvent(new CustomEvent('narrative-agent-status', {
          detail: this.narrativeAgentStatus
        }))
      }
    },

    // 体验生成生命周期；资料选择与 provider 循环由 orchestrator 负责。
    async generateAIResponse({ narrativeMode = '', directorNote = '', userMessageId = '' } = {}) {
      this.cancelNarrativeGeneration('superseded')
      const controller = new AbortController()
      const requestId = `narrative_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      const productionObserver = createNarrativeProductionObserver()
      narrativeAbortControllers.set(this, controller)
      this.isLoading = true
      this.lastError = null
      let messageIndex = -1
      let placeholderId = ''
      let productionMode = 'continue'
      let productionOutcome = 'error'
      let productionError = null
      let productionKernel = null
      let completedAgentRun = null
      // R1a：回合事务。在 provider 调用前抓取 preRuntimeSnapshot，失败时回滚。
      let turnRecord = null
      try {
        this.loadApiSettings()

        // R1a：生成前快照 —— 覆盖当前位置/时间/角色/关系/事实/目标/事件/记忆游标。
        // 必须在本回合所有 state 修改（extractAndUpdateState 等）之前抓取。
        turnRecord = createNarrativeTurnRecord({
          id: requestId,
          parentTurnId: this.lastCommittedTurnId || null,
          // P0-1：真实生成必须落在当前活动分支，并记录本回合 user 消息 id
          branchId: this.activeBranchId || 'main',
          userMessageIds: userMessageId ? [userMessageId] : [],
          preRuntimeSnapshot: this.getRuntimeSnapshot(),
        })
        this.pendingTurnRecord = turnRecord

        const worldStore = useWorldStore()
        const worldbook = worldStore.activeWorldbook
        const hasAssistantHistory = this.chatHistory.some(m => m.role === 'assistant')
        const isInitGeneration = this._isRegenerating ? false : !hasAssistantHistory
        productionMode = isInitGeneration
          ? 'init'
          : narrativeMode === 'auto-advance' ? 'auto' : 'continue'
        const narrativeProjectId = this.worldId || worldbook?.id || ''
        const narrativeSessionId = this.currentSessionId || ''
        const sceneSummaryResolution = resolveNarrativeSceneSummary({
          messages: this.chatHistory,
          previousSummary: this.narrativeSceneSummary,
          projectId: narrativeProjectId,
          sessionId: narrativeSessionId
        })
        this.narrativeSceneSummary = sceneSummaryResolution.summary
        const narrativeKernel = buildNarrativeKernel({
          worldbook,
          runtimeState: {
            worldMapState: this.worldMapState,
            writingTime: this.writingTime,
            placeStates: this.placeStates,
            characterStates: this.characterStates,
            characterRelations: this.characterRelations,
            canonicalFacts: this.canonicalFacts,
            runtimeEvents: this.runtimeEvents,
            encounteredCharacters: this.encounteredCharacters,
            goals: this.goals,
            keyChoices: this.keyChoices,
            playerCharacter: this.playerCharacter,
            dialogueCharacter: this.dialogueCharacter,
            historyNode: this.historyNode
          },
          messages: this.chatHistory,
          sceneSummary: this.narrativeSceneSummary,
          projectId: narrativeProjectId,
          sessionId: narrativeSessionId,
          authorNote: directorNote  // R2：本轮导演注
        })
        productionKernel = narrativeKernel
        const narrativeMemories = listScopedActiveMemoryCandidates({
          projectId: narrativeProjectId,
          sessionId: narrativeSessionId,
          limitPerScope: 100
        }).filter((memory) => ['project', 'session'].includes(memory.scope))
        const narrativeIndex = getNarrativeResourceIndex({
          projectId: narrativeProjectId,
          sessionId: narrativeSessionId,
          worldbook,
          memories: narrativeMemories
        })
        const narrativeRegistry = createNarrativeToolRegistry({
          index: narrativeIndex,
          projectId: narrativeProjectId,
          sessionId: narrativeSessionId,
          currentPlaceId: this.worldMapState?.placeId || ''
        })
        this.lastNarrativeKernel = narrativeKernel
        this.lastWorldbookContext = null
        this.lastMemoryContext = ''
        this.lastMemoryRecall = {
          source: 'narrative-tools',
          includedCount: 0,
          excludedCount: 0,
          totalItems: narrativeIndex.counts?.memory || 0,
          contentChars: 0,
          items: [],
          included: [],
          excluded: [],
          counts: { project: 0, session: 0 }
        }

        messageIndex = this.messages.length
        const placeholder = ensureNarrativeMessage({
          role: 'assistant',
          name: this.dialogueCharacter?.name || this.aiCharacter.name,
          content: '',
          timestamp: Date.now(),
          dialogueMode: !!this.dialogueCharacter,
          isStreaming: true,
          branchId: this.activeBranchId  // R1b：区分分支
        }, messageIndex)
        placeholderId = placeholder.id
        this.messages.push(placeholder)
        const getPlaceholder = () => this.messages.find((message) => message?.id === placeholderId)

        let fullContent = ''
        let cleanContent = ''
        const maxTokens = isInitGeneration ? 1500 : productionMode === 'auto' ? 460 : 800
        const agentRun = await runNarrativeAgentGeneration({
          kernel: narrativeKernel,
          registry: narrativeRegistry,
          mode: productionMode,
          formatInstructions: buildNarrativeFormatInstructions(),
          worldId: this.worldId,
          settings: this.apiSettings,
          requestId,
          signal: controller.signal,
          maxTokens,
          onStatus: (status) => {
            productionObserver.observeStatus(status)
            if (narrativeAbortControllers.get(this) === controller) {
              this.setNarrativeAgentStatus({
                ...status,
                requestId
              })
            }
          },
          callbacks: {
            onChunk: (chunk) => {
              productionObserver.observeChunk(chunk)
              if (chunk.content) {
                fullContent += chunk.content
                const targetMessage = getPlaceholder()
                if (!targetMessage) return
                const parsed = parseNarrativePresentation(fullContent, {
                  messageId: targetMessage.id,
                  complete: false,
                  fallbackSpeaker: getTrustedMessageSpeaker(targetMessage),
                  role: targetMessage.role
                })
                cleanContent = parsed.content
                targetMessage.content = cleanContent
                targetMessage.presentation = parsed
              }
            },
            onComplete: () => {
              const targetMessage = getPlaceholder()
              if (targetMessage) {
                targetMessage.isStreaming = false
                const parsed = parseNarrativePresentation(fullContent, {
                  messageId: targetMessage.id,
                  complete: true,
                  fallbackSpeaker: getTrustedMessageSpeaker(targetMessage),
                  role: targetMessage.role
                })
                cleanContent = parsed.content
                targetMessage.content = cleanContent
                targetMessage.presentation = parsed
              }
            },
            onError: (error) => {
              console.error('Stream error:', error)
            }
          }
        })
        completedAgentRun = agentRun
        const completedMessage = getPlaceholder()
        messageIndex = this.messages.findIndex((message) => message?.id === placeholderId)
        this.lastNarrativeAgentTrace = agentRun.trace
        this.lastNarrativeContextAudit = buildNarrativeContextAudit({
          kernel: narrativeKernel,
          index: narrativeIndex,
          toolTrace: agentRun.trace
        })
        this.lastContextLedger = createNarrativeAgentContextLedger({
          run: agentRun,
          kernel: narrativeKernel,
          sessionId: narrativeSessionId,
          worldbookId: narrativeProjectId
        })

        cleanContent = parseNarrativePresentation(fullContent, {
          messageId: completedMessage?.id,
          complete: true,
          fallbackSpeaker: getTrustedMessageSpeaker(completedMessage),
          role: completedMessage?.role
        }).content
        if (!cleanContent || messageIndex < 0) {
          throw Object.assign(new Error('模型没有返回可用正文'), {
            code: 'NARRATIVE_STREAM_EMPTY'
          })
        }
        this.chatHistory.push({ role: 'assistant', content: cleanContent })

        // 追加运行时事件侧车 (v1: capped append-only envelope)
        this.appendRuntimeEvent({
          type: 'turn',
          source: 'assistant',
          payload: {
            preview: String(cleanContent || '').slice(0, 200),
            messageIndex
          }
        })

        // P0-3：回合事务提交**延迟**到所有 state 修改之后（见 productionOutcome 前）。
        // 正文已写入但 turn record 尚未 committed —— 后续步骤（状态提取/机制/记忆）失败
        // 时 catch 会回滚 preRuntimeSnapshot，不留"正文已提交、状态未提交"的半成功回合。

        // 保存当前会话
        if (this.currentSessionId) {
          this.saveCurrentSession()
        }

        // 记录重要的叙事事件到记忆系统
        if (cleanContent && cleanContent.length > 20) {
          // 检测是否有重要事件（对话、物品获得、地点发现等）
          const hasDialogue = /"[^"]{5,}"|“[^”]{5,}”|「[^」]{5,}」/.test(cleanContent)
          const hasItem = /获得|发现.*物品|得到/.test(cleanContent)
          const hasLocation = /首次进入|发现.*地方|抵达|踏入/.test(cleanContent)

          if (hasDialogue || hasItem || hasLocation) {
            const eventType = hasLocation ? 'location_discovery' : hasItem ? 'item_acquisition' : 'dialogue'
            // R5：记忆候选结构化上下文 —— 谁、在哪、何时、哪个回合
            // （metadata 原样落库，供追溯"谁对谁说了什么关键事实"）
            const speaker = this.dialogueCharacter?.name || this.playerCharacter?.name || '主角'
            const place = this.worldMapState?.currentScene || ''
            const time = this.writingTime ? `${this.writingTime.year || ''}-${this.writingTime.month || ''}-${this.writingTime.day || ''}` : ''
            recordMemory(
              cleanContent,
              eventType,
              {
                character: speaker,
                scope: 'session',
                scopeId: this.currentSessionId || '',
                sourceRef: `gameStore:${this.currentSessionId || 'unknown'}:${messageIndex}`,
                speaker,
                place,
                time,
                turnId: turnRecord?.id || '',
              }
            ).then((res) => {
              // P1-6：记忆候选入回合事务 —— 记录本回合产生的候选 id，供追溯/分支隔离
              if (res?.candidate?.id && turnRecord) {
                turnRecord.memoryCandidateIds = [...new Set([
                  ...(turnRecord.memoryCandidateIds || []),
                  res.candidate.id
                ])]
              }
            }).catch(() => {}) // 静默失败
          }
        }

        // 内联事件标记保留（对话、物品等可点击查看）
        const inlineEvents = this.detectInlineEvents(cleanContent, messageIndex)
        if (inlineEvents.length > 0) {
          this.addInlineEvents(inlineEvents)
        }

        // 从 AI 回复中提取状态更新
        this.extractAndUpdateState(cleanContent)

        // R1b：state 提取完成后补抓 post snapshot（候选切换时恢复该分支的 state）
        if (turnRecord) {
          turnRecord.postRuntimeSnapshot = this.getRuntimeSnapshot()
        }

        // 检测机制触发（战斗、交易、任务、对话）
        const mechanism = this.detectMechanismTriggers(cleanContent)
        if (mechanism) {
          const targetMessage = getPlaceholder()
          if (targetMessage) {
            targetMessage.mechanismTrigger = mechanism
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('story-mechanism-ready', {
              detail: mechanism
            }))
          }
          if (this.currentSessionId) {
            this.saveCurrentSession()
          }
        }

        // P0-3：回合事务提交 —— 所有 state 修改（extractAndUpdateState/机制/记忆）完成后，
        // 才把 turn record 标记 committed。正文、状态、回执作为同一事务原子提交。
        if (turnRecord) {
          const targetMsg = getPlaceholder()
          const receipt = buildTurnReceipt({
            ledger: this.lastContextLedger,
            run: completedAgentRun,
            sceneSummary: this.narrativeSceneSummary,
            directorNote,
          })
          commitNarrativeTurnRecord(turnRecord, {
            assistantMessageIds: targetMsg?.id ? [targetMsg.id] : [],
            directorNote: String(directorNote || '').trim() || null,
            receipt,
          })
          this.turnRecords[turnRecord.id] = turnRecord
          this.lastCommittedTurnId = turnRecord.id
          this.pendingTurnRecord = null
          this.lastTurnReceipt = receipt  // P1-5：体验页渲染最近一次回执
        }

        productionOutcome = 'success'
      } catch (e) {
        productionError = e
        productionOutcome = controller.signal.aborted || e?.code === 'NARRATIVE_AGENT_ABORTED'
          ? 'cancelled'
          : 'error'
        const placeholderIndex = this.messages.findIndex((message) => message?.id === placeholderId)
        if (placeholderIndex >= 0) {
          this.messages.splice(placeholderIndex, 1)
        }
        // R1a：回合事务失败回滚 —— 恢复生成前的 runtime state。
        // 取消/失败都不应留下"半提交"的 state（地点/时间/角色被改了但正文没提交）。
        if (turnRecord?.preRuntimeSnapshot) {
          failNarrativeTurnRecord(turnRecord)
          this.applyRuntimeSnapshot(turnRecord.preRuntimeSnapshot)
          this.pendingTurnRecord = null
        }
        // P1-5：导演注失败保留 —— 本回合的导演注未消费，恢复到 pending 供重试
        if (directorNote && !this.pendingDirectorNote) {
          this.pendingDirectorNote = String(directorNote).trim() || null
        }
        if (!controller.signal.aborted && e?.code !== 'NARRATIVE_AGENT_ABORTED') {
          console.error('AI Error:', e)
          this.lastError = e.message
          this.messages.push({ id: createMessageId('system'), role: 'system', content: `AI 错误：${e.message}`, timestamp: Date.now() })
          this.setNarrativeAgentStatus({
            phase: 'error',
            code: e?.code || 'NARRATIVE_AGENT_FAILED',
            message: e.message,
            at: Date.now()
          })
        }
      } finally {
        const ownsGeneration = narrativeAbortControllers.get(this) === controller
        if (ownsGeneration) {
          narrativeAbortControllers.delete(this)
          this.isLoading = false
          if (this.narrativeAgentStatus?.phase === 'complete') {
            this.narrativeAgentStatus = null
          }
        }
        const timing = productionObserver.snapshot()
        const targetMessage = this.messages.find((message) => message?.id === placeholderId)
        const trace = completedAgentRun?.trace || null
        const summaryBlock = (productionKernel?.blocks || []).find((block) => block?.kind === 'summary')
        const isTypedFailureVisible = productionOutcome !== 'error'
          || this.narrativeAgentStatus?.phase === 'error'
          || this.messages.some((message) => (
            message?.role === 'system'
            && String(message?.content || '').startsWith('AI 错误：')
          ))
        recordNarrativeProductionRun({
          runId: requestId,
          provider: this.apiSettings?.provider,
          model: this.apiSettings?.model,
          mode: productionMode,
          outcome: productionOutcome,
          errorCode: productionError?.code,
          retryable: productionError?.retryable,
          protocolOk: productionOutcome === 'success'
            ? true
            : (/^NARRATIVE_(PROVIDER_|AGENT_DECISION_INVALID)/.test(productionError?.code || '')
                ? false
                : null),
          protocol: trace?.protocol || 'agent-sse-v1',
          capabilitySource: trace?.capabilitySource || (this.apiSettings?.capabilities ? 'probe' : 'static-default'),
          toolRepairCount: trace?.toolRepairCount ?? trace?.repairCount,
          reasoningRoundTrip: trace?.reasoningRoundTrip,
          terminalMode: trace?.terminalMode,
          groundingPolicy: trace?.groundingPolicy?.level,
          orphanedCallCount: trace?.orphanedCallCount,
          fallbackReason: trace?.fallbackReason,
          transcriptRevision: trace?.transcriptRevision,
          timing,
          tools: {
            rounds: completedAgentRun?.toolRounds ?? timing.toolRounds,
            calls: completedAgentRun?.totalCalls ?? timing.totalCalls,
            evidenceCount: completedAgentRun?.finalToolResults?.length ?? timing.evidenceCount,
            errorCount: (trace?.calls || []).filter((call) => call?.errorCode).length
          },
          usage: {
            inputTokens: completedAgentRun?.usage?.inputTokens,
            outputTokens: completedAgentRun?.usage?.outputTokens,
            totalTokens: completedAgentRun?.usage?.totalTokens,
            estimatedFinalTokens: timing.estimatedOutputTokens
          },
          context: {
            kernelChars: productionKernel?.budget?.usedChars,
            summaryChars: summaryBlock?.chars,
            finalToolResultChars: trace?.finalResultChars
          },
          cleanup: {
            renderSettled: productionOutcome === 'success'
              ? Boolean(targetMessage && !targetMessage.isStreaming && targetMessage.content)
              : !targetMessage,
            requestReleased: narrativeAbortControllers.get(this) !== controller,
            loadingOwnerSettled: !ownsGeneration || this.isLoading === false,
            failureVisible: isTypedFailureVisible
          }
        })
      }
    },

    // 从 AI 回复中提取并更新状态
    extractAndUpdateState(content) {
      if (!content || typeof content !== 'string') return

      debugLog('[extractAndUpdateState] 开始提取状态更新')

      // 提取时间变化
      this.extractTimeChanges(content)

      // 提取地点变化
      this.extractLocationChanges(content)

      // 提取角色状态变化
      this.extractCharacterChanges(content)

      // 提取活动事件
      this.extractActivityEvents(content)

      // 轻状态：目标 / 已遇角色 / 关键选择 / 阵营关系
      this.extractAdventureState(content)

      // 剧情日志：每累计约 8 轮 assistant 回复，压成 1 条可写回的摘要
      this.maybeAppendPlotJournalEntry()

      // 只在完整回复完成并提取状态后收集候选，不在流式文本期间弹出事件。
      this.refreshEmergenceCandidates()
    },

    // 提取时间变化
    extractTimeChanges(content) {
      const currentTime = { ...this.writingTime }
      let updated = false

      // 检测"次日"、"第二天"等日期推进
      if (/次日|第二天|翌日|隔天/.test(content)) {
        const currentDay = parseInt(currentTime.day) || 1
        currentTime.day = String(currentDay + 1)
        updated = true
        debugLog('[extractTimeChanges] 检测到日期推进，新日期:', currentTime.day)
      }

      // 检测完整日期格式：X年X月X日（最优先）
      const fullDateMatch = content.match(/(\d{1,4})年(\d{1,2})月(\d{1,2})日/)
      if (fullDateMatch) {
        const year = fullDateMatch[1]
        const month = fullDateMatch[2]
        const day = fullDateMatch[3]

        if (parseInt(year) > 0 && parseInt(year) < 10000) {
          currentTime.year = year
          updated = true
        }
        if (parseInt(month) >= 1 && parseInt(month) <= 12) {
          currentTime.month = month
          updated = true
        }
        if (parseInt(day) >= 1 && parseInt(day) <= 31) {
          currentTime.day = day
          updated = true
        }
        debugLog('[extractTimeChanges] 检测到完整日期:', year, month, day)
      } else {
        // 单独检测年份（避免匹配年龄）
        const yearMatch = content.match(/(\d{2,4})年(?!纪|代|龄)/)
        if (yearMatch && yearMatch[1]) {
          const year = yearMatch[1]
          if (year !== currentTime.year && parseInt(year) > 0 && parseInt(year) < 10000) {
            currentTime.year = year
            updated = true
            debugLog('[extractTimeChanges] 检测到年份:', year)
          }
        }

        // 单独检测月份
        const monthMatch = content.match(/(\d{1,2})月/)
        if (monthMatch && monthMatch[1]) {
          const month = parseInt(monthMatch[1])
          if (month >= 1 && month <= 12 && String(month) !== currentTime.month) {
            currentTime.month = String(month)
            updated = true
            debugLog('[extractTimeChanges] 检测到月份:', month)
          }
        }

        // 单独检测日期
        const dayMatch = content.match(/(\d{1,2})日/)
        if (dayMatch && dayMatch[1]) {
          const day = parseInt(dayMatch[1])
          if (day >= 1 && day <= 31 && String(day) !== currentTime.day) {
            currentTime.day = String(day)
            updated = true
            debugLog('[extractTimeChanges] 检测到日期:', day)
          }
        }
      }

      // 检测纪年/年号
      const eraMatch = content.match(/([^\s，。！？\d]{2,6})(元年|二年|三年|\d+年)/)
      if (eraMatch && eraMatch[1]) {
        currentTime.eraName = eraMatch[1]
        currentTime.eraId = 'chinese'
        updated = true
        debugLog('[extractTimeChanges] 检测到纪年:', eraMatch[1])
      }

      if (updated) {
        this.saveWritingTime(currentTime)
      }
    },

    // 提取地点变化
    extractLocationChanges(content) {
      // 匹配地点变化的模式
      const locationPatterns = [
        /来到[了]?([^\s，。！？]{2,20})/,
        /到达[了]?([^\s，。！？]{2,20})/,
        /进入[了]?([^\s，。！？]{2,20})/,
        /抵达[了]?([^\s，。！？]{2,20})/,
        /身处([^\s，。！？]{2,20})/,
        /位于([^\s，。！？]{2,20})/,
        /站在([^\s，。！？]{2,20})/,
        /位于([^\s，。！？]{2,20})/
      ]

      for (const pattern of locationPatterns) {
        const match = content.match(pattern)
        if (match && match[1]) {
          let location = match[1].trim()
          // 清理常见的后缀词
          location = location.replace(/[的地得]$/, '')
          if (location.length >= 2 && location.length <= 15) {
            debugLog('[extractLocationChanges] 检测到地点变化:', location)
            this.saveWorldMapState({
              ...this.worldMapState,
              currentScene: location
            })
            return // 只更新第一个匹配的
          }
        }
      }
    },

    // 提取角色状态变化
    extractCharacterChanges(content) {
      const char = { ...this.writingCharacter }
      let updated = false

      // 提取角色名字（如果未设置或为默认值）
      if (!char.name || char.name === 'User') {
        const namePatterns = [
          // 直接称呼（最常见）
          /你叫([^\s，。！？]{2,8})/,
          /你的名字[叫是]([^\s，。！？]{2,8})/,
          /名叫([^\s，。！？]{2,8})/,
          /名为([^\s，。！？]{2,8})/,
          // 自我介绍
          /我是([^\s，。！？]{2,8})[，。！？]/,
          /我叫([^\s，。！？]{2,8})[，。！？]/,
          // 身份描述
          /你是([^\s，。！？]{2,8})[，。！？，一个]/,
          /作为一个叫([^\s，。！？]{2,8})的/,
          // 第三人称叙事开头
          /^([^\s，。！？]{2,8})[说想看走站坐躺醒]/m,
          // 常见句式
          /一个叫([^\s，。！？]{2,8})的/,
          /名叫([^\s，。！？]{2,8})的[男女]/,
          // 名字后面跟描述
          /^([^\s，。！？]{2,8})，.{0,30}(醒来|睁眼|起身)/m
        ]
        for (const pattern of namePatterns) {
          const match = content.match(pattern)
          if (match && match[1]) {
            const name = match[1].trim()
            // 过滤掉常见的非名字词
            const excludeWords = ['你', '我', '他', '她', '它', '这', '那', '一个', '一位', '自己', '年轻', '少年', '少女', '男子', '女子', '男人', '女人', '老人', '青年', '中年']
            if (!excludeWords.includes(name) && !/\d/.test(name) && name.length >= 2 && name.length <= 8) {
              char.name = name
              updated = true
              debugLog('[extractCharacterChanges] 检测到角色名:', char.name)
              break
            }
          }
        }
      }

      // 提取性别
      if (!char.gender) {
        const genderPatterns = [
          /你是一个(\d{1,3})岁的(男|女)/,
          /你是个(\d{1,3})岁的(男|女)/,
          /你是(男|女)的/,
          /一个(男|女)[性孩人]/,
          /(男|女)主人公/,
          /作为(男|女)/,
          /性别[是为](男|女)/,
          /(男|女)士/,
          /(男|女)孩/
        ]
        for (const pattern of genderPatterns) {
          const match = content.match(pattern)
          if (match) {
            // 有些模式性别在第二个捕获组
            char.gender = match[2] || match[1]
            if (char.gender === '男' || char.gender === '女') {
              updated = true
              debugLog('[extractCharacterChanges] 检测到性别:', char.gender)
              break
            }
          }
        }
      }

      // 提取年龄
      if (!char.age) {
        const agePatterns = [
          /(\d{1,3})岁的[男女]/,
          /一个(\d{1,3})岁的/,
          /年龄[是为](\d{1,3})/,
          /今年(\d{1,3})岁/
        ]
        for (const pattern of agePatterns) {
          const match = content.match(pattern)
          if (match && match[1]) {
            const age = parseInt(match[1])
            if (age > 0 && age < 200) {
              char.age = age + '岁'
              updated = true
              debugLog('[extractCharacterChanges] 检测到年龄:', char.age)
              break
            }
          }
        }
      }

      // 检测情绪变化关键词
      const moodKeywords = {
        happy: ['开心', '高兴', '兴奋', '喜悦', '欣慰', '满足', '快乐', '愉快'],
        sad: ['悲伤', '难过', '伤心', '沮丧', '失落', '忧郁', '悲痛'],
        angry: ['愤怒', '生气', '恼火', '恼怒', '气恼', '愤慨'],
        afraid: ['害怕', '恐惧', '惊恐', '惶恐', '不安', '担忧'],
        surprised: ['惊讶', '吃惊', '意外', '震惊', '惊奇']
      }

      let moodDelta = 0
      for (const [mood, keywords] of Object.entries(moodKeywords)) {
        for (const keyword of keywords) {
          if (content.includes(keyword)) {
            if (mood === 'happy') moodDelta += 5
            else if (mood === 'sad') moodDelta -= 5
            else if (mood === 'angry') moodDelta -= 3
            else if (mood === 'afraid') moodDelta -= 4
            else if (mood === 'surprised') moodDelta += 1
          }
        }
      }

      if (moodDelta !== 0) {
        const currentMood = char.mood || 50
        char.mood = Math.max(0, Math.min(100, currentMood + moodDelta))
        updated = true
        debugLog('[extractCharacterChanges] 情绪变化:', moodDelta, '新情绪值:', char.mood)
      }

      // 如果有变化，保存
      if (updated) {
        this.saveWritingCharacter(char)
      }
    },

    // 提取活动事件
    extractActivityEvents(content) {
      const eventPatterns = [
        // 获得物品 - 需要完整的物品名
        { pattern: /获得了?(.+?)(?:。|，|\s)/, type: 'event' },
        // 完成决定 - 需要完整的决定内容
        { pattern: /做出了?(?:一个|项)?(.+?)(?:决定|选择)(?:。|，)/, type: 'decision' },
        // 遇到 NPC - 需要完整描述
        { pattern: /遇到了?(.+?)(?:，|。)/, type: 'encounter' },
        // 完成里程碑
        { pattern: /完成了?(.+?)(?:任务|委托|目标)(?:。|，)/, type: 'milestone' }
      ]

      for (const { pattern, type } of eventPatterns) {
        const match = content.match(pattern)
        if (match && match[0]) {
          const title = match[0].trim()
          if (title.length >= 4 && title.length <= 50) {
            this.addActivity({
              title,
              type,
              date: this.formatCurrentTime()
            })
          }
        }
      }
    },

    // 格式化当前时间
    formatCurrentTime() {
      const time = this.writingTime
      if (!time) return ''
      const era = time.eraName || ''
      const year = time.year || ''
      const month = time.month || ''
      const day = time.day || ''
      return `${era}${year}年${month}月${day}日`.replace(/年年/, '年')
    },

    // 添加活动
    addActivity(activity) {
      const activities = this.activities || []
      activities.push({
        id: `act_${Date.now()}`,
        title: activity.title,
        type: activity.type || 'event',
        date: activity.date || '',
        placeId: activity.placeId || this.worldMapState?.placeId || '',
        createdAt: Date.now()
      })
      // 保留最近 20 条
      this.saveWritingActivities(activities.slice(-20))
    },

    extractAdventureState(content) {
      const text = String(content || '')
      if (!text.trim()) return

      this.extractGoalState(text)
      this.extractEncounteredCharacters(text)
      this.extractKeyChoices(text)
      this.extractFactionRelations(text)
    },

    extractGoalState(content) {
      const goalPatterns = [
        /(?:目标|任务目标|当前目标)[：:\s]+([^。！？\n]{4,40})/,
        /(?:你需要|你必须|你得)([^。！？\n]{4,36})/
      ]

      for (const pattern of goalPatterns) {
        const match = content.match(pattern)
        const title = normalizeTextValue(match?.[1])
        if (!title) continue
        this.upsertGoal({
          title,
          source: 'ai-extract',
          status: /完成|达成|解决/.test(content) ? 'completed' : 'active',
          updatedAt: Date.now()
        })
        return
      }
    },

    extractEncounteredCharacters(content) {
      const worldStore = useWorldStore()
      const candidates = getWorldbookEntryNames(worldStore.activeWorldbook, 'character', 24)
      for (const name of candidates) {
        if (!name || !content.includes(name)) continue
        this.addEncounteredCharacter({
          name,
          source: 'worldbook-match',
          lastSeenAt: Date.now()
        })
      }
    },

    extractKeyChoices(content) {
      const choicePatterns = [
        /(?:你决定|你选择|最终决定|最后选择)([^。！？\n]{3,36})/,
        /(?:答应了|拒绝了|站在了)([^。！？\n]{3,36})/
      ]

      for (const pattern of choicePatterns) {
        const match = content.match(pattern)
        const label = normalizeTextValue(match?.[0] || match?.[1])
        if (!label) continue
        this.recordKeyChoice({
          label,
          source: 'ai-extract',
          createdAt: Date.now()
        })
      }
    },

    extractFactionRelations(content) {
      const worldStore = useWorldStore()
      const factions = getWorldbookEntryNames(worldStore.activeWorldbook, 'organization', 20)
      for (const name of factions) {
        if (!name || !content.includes(name)) continue
        let delta = 0
        if (new RegExp(`${name}.{0,12}(信任|支持|帮助|保护)`).test(content)) delta += 8
        if (new RegExp(`${name}.{0,12}(怀疑|敌视|威胁|施压|逼迫)`).test(content)) delta -= 8
        if (delta !== 0) {
          const current = Number(this.factionRelations?.[name] || 0)
          this.setFactionRelation(name, current + delta)
        }
      }
    },

    resetGameState() {
      this.resetRuntimeState()
    },

    resetRuntimeState() {
      this.cancelNarrativeGeneration('runtime-reset')
      const runtime = createEmptySessionRuntime()
      this.gameId = null
      this.messages = runtime.messages
      this.chatHistory = runtime.chatHistory
      this.time = runtime.time
      this.player = runtime.player
      this.inventory = runtime.inventory
      this.quests = runtime.quests
      this.flags = runtime.flags
      this.activities = runtime.activities
      this.goals = runtime.goals
      this.encounteredCharacters = runtime.encounteredCharacters
      this.factionRelations = runtime.factionRelations
      this.keyChoices = runtime.keyChoices
      this.plotJournal = runtime.plotJournal
      this.adventureTriggers = runtime.adventureTriggers
      this.adventureTriggerHistory = runtime.adventureTriggerHistory
      this.adventureTriggerCooldownUntil = runtime.adventureTriggerCooldownUntil
      this.emergenceCandidates = runtime.emergenceCandidates
      this.emergenceDismissedIds = runtime.emergenceDismissedIds
      this.emergenceDraft = runtime.emergenceDraft
      this.adventureTriggerPendingType = null
      this.npcRelations = runtime.npcRelations
      this.discoveredPlaces = runtime.discoveredPlaces
      this.completedQuests = runtime.completedQuests
      this.writingCharacter = runtime.writingCharacter
      this.writingTime = runtime.writingTime
      this.placeStates = runtime.placeStates
      this.characterStates = runtime.characterStates
      this.characterRelations = runtime.characterRelations
      this.canonicalFacts = runtime.canonicalFacts
      this.worldMapState = runtime.worldMapState
      this.historyNode = runtime.historyNode
      this.isPlaying = false
      this.activeMechanism = runtime.activeMechanism
      this.mechanismContext = runtime.mechanismContext
      this.milestoneEvent = runtime.milestoneEvent
      this.playerCharacter = runtime.playerCharacter
      this.aiCharacter = runtime.aiCharacter
      this.dialogueMode = runtime.dialogueMode
      this.dialogueCharacter = runtime.dialogueCharacter
      this.inlineEvents = []
      this.lastWorldbookContext = null
      this.lastMemoryContext = ''
      this.lastContextLedger = null
      this.lastMemoryRecall = null
      this.lastNarrativeKernel = null
      this.lastNarrativeContextAudit = null
      this.lastNarrativeAgentTrace = null
      this.narrativeAgentStatus = null
      this.narrativeSceneSummary = null
      this.isLoading = false
      this.lastError = null
      this.quickNoteImportMode = false
      this.quickNoteSelectedMessageIndexes = []
      this.runtimeEvents = Array.isArray(runtime.runtimeEvents) ? runtime.runtimeEvents : []
    },

    resetGlobalWritingAssets() {
      setItem(STORAGE_KEYS.WRITING_CHARACTER, DEFAULT_WRITING_CHARACTER)
      setItem(STORAGE_KEYS.WRITING_TIME, DEFAULT_WRITING_TIME)
      setItem(STORAGE_KEYS.WRITING_WORLDMAP, DEFAULT_WORLD_MAP_STATE)
      setItem(STORAGE_KEYS.WRITING_ACTIVITIES, [])
      this.loadWritingCharacter()
      this.loadWritingTime()
      this.loadWorldMapState()
      this.loadWritingActivities()
    },

    async initGame() {
      this.loadWritingCharacter()
      this.loadWritingTime()
      this.loadWorldMapState()
      this.loadWritingActivities()
      this.isPlaying = true

      // 获取世界书结构化设定
      const worldStore = useWorldStore()
      const worldbook = worldStore.activeWorldbook

      // 更新 worldId
      if (worldbook?.id) {
        this.worldId = worldbook.id
        // 更新当前 session 的 worldId
        if (this.currentSessionId) {
          const idx = this.sessions.findIndex(s => s.id === this.currentSessionId)
          if (idx !== -1) {
            this.sessions[idx].worldId = worldbook.id
            this.sessions[idx].updatedAt = Date.now()
            this.saveSessions()
          }
        }
      }

      const systemContent = [
        '你是一个小说叙述者，请用生动的中文描述场景并与玩家互动。',
        buildNarrativeFormatInstructions()
      ].join('\n\n')

      // 设置系统提示词
      this.chatHistory = [{
        role: 'system',
        content: systemContent
      }]

      // 清空消息，等待 AI 生成初始内容
      this.messages = []
      this.saveCurrentSession()

      // 如果 AI 开启，自动生成初始内容
      if (this.useAI) {
        // 添加一个空的用户消息触发 AI 响应
        this.chatHistory.push({ role: 'user', content: '开始故事' })
        await this.generateAIResponse()
      }
    },

    async startGame(worldId) {
      this.isLoading = true
      try {
        const response = await apiSendAction(null, worldId, true)
        this.gameId = response.gameId
        this.worldId = worldId
        this.isPlaying = true
        
        const welcomeText = `欢迎来到${response.world?.config?.name || '这个世界'}！游戏开始。`
        
        this.messages = [{
          type: 'system',
          content: welcomeText,
          timestamp: Date.now()
        }]
        this.chatHistory = [{
          role: 'system',
          content: `欢迎来到${response.world?.config?.name || '这个世界'}！你是这个世界的冒险者。`
        }]
      } catch (e) {
        this.lastError = e.message
      } finally {
        this.isLoading = false
      }
    },

    updateState(response) {
      // ... 保持不变 ...
      if (response.state) {
        if (response.state.time) this.time = response.state.time
        if (response.state.player) this.player = response.state.player
        if (response.state.inventory) this.inventory = response.state.inventory
        if (response.state.quests) this.quests = response.state.quests
        if (response.state.flags) this.flags = response.state.flags
        if (response.state.worldState) this.worldState = response.state.worldState
        if (response.state.npcRelations) this.npcRelations = response.state.npcRelations
        if (response.state.discoveredPlaces) this.discoveredPlaces = response.state.discoveredPlaces
        if (response.state.completedQuests) this.completedQuests = response.state.completedQuests
      }
    },

    toggleAI() {
      this.useAI = !this.useAI
      if (this.useAI) {
        this.loadApiSettings()
      }
    },

    loadApiSettings() {
      // 文本模型配置现在走「配置列表 + 新增」模式 (textProviderConfigStore);
      // 内置 MiniMax 时 apiKey 为哨兵, 由服务器替换为 env key。
      const resolved = toResolvedTextApiSettings(resolveSelectedTextProviderConfig())
      if (resolved) {
        this.apiSettings = {
          provider: resolved.provider || 'openai',
          baseUrl: resolved.baseUrl || '',
          apiKey: resolved.apiKey || '',
          model: resolved.model || ''
        }
      }
    }
  }
})
