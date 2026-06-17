import { defineStore } from 'pinia'
import { sendAction as apiSendAction, getState, buildContextMessage, recordMemory } from '../services/api'
import { runGenerationStreamTask } from '../services/generationService'
import {
  formatAdventureStoryboardSeedContent,
  generateAdventureProseDraft,
  generateAdventureStoryboardDraft
} from '../services/generationAdventureTriggers'
import { buildHeuristicContextSummary, compressChatHistory } from '../services/contextCompression'
import { buildWorldbookContext } from '../services/worldbookContextBuilder'
import { buildScopedMemoryContext } from '../services/memoryCandidates'
import { buildMem0MemoryContext } from '../services/memorySync'
import { addNarrativeAsset } from '../services/narrativeAssets'
import { saveValidatedStoryboardVersion } from '../services/storyboardStore'
import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage'
import { debounce, flushPending } from '../composables/useDebounce'
import { useWorldStore } from './worldStore'

const DEFAULT_WORLD_MAP_STATE = {
  map: { countries: [] },
  currentCountry: '',
  currentCity: '',
  currentScene: ''
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
  adventureTriggerHistory: []
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
    currentScene: raw?.currentScene || ''
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

function normalizeAdventureState(raw = {}) {
  return {
    goals: normalizeGoals(raw?.goals),
    encounteredCharacters: normalizeEncounteredCharacters(raw?.encounteredCharacters),
    factionRelations: normalizeFactionRelations(raw?.factionRelations),
    keyChoices: normalizeKeyChoices(raw?.keyChoices),
    plotJournal: normalizePlotJournal(raw?.plotJournal),
    adventureTriggers: normalizeAdventureTriggersState(raw?.adventureTriggers),
    adventureTriggerHistory: normalizeAdventureTriggerHistory(raw?.adventureTriggerHistory),
    adventureTriggerCooldownUntil: normalizeNumber(raw?.adventureTriggerCooldownUntil, 0)
  }
}

function getWorldbookEntryNames(worldbook, type, limit = 20) {
  const normalizedType = normalizeTextValue(type).toLowerCase()
  const entries = Array.isArray(worldbook?.entries) ? worldbook.entries : []
  return entries
    .filter((entry) => normalizeTextValue(entry?.type).toLowerCase() === normalizedType)
    .map((entry) => normalizeTextValue(entry?.name || entry?.keys?.[0]))
    .filter(Boolean)
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
    adventureTriggerCooldownUntil: 0
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
    writingCharacter: normalizeWritingCharacter(DEFAULT_WRITING_CHARACTER),
    writingTime: normalizeWritingTime(DEFAULT_WRITING_TIME),
    activities: [],
    goals: [],
    encounteredCharacters: [],
    factionRelations: {},
    keyChoices: [],
    plotJournal: [],
    adventureTriggers: cloneState(DEFAULT_ADVENTURE_STATE.adventureTriggers, { prose: null, storyboard: null }),
    adventureTriggerHistory: [],
    adventureTriggerCooldownUntil: 0,
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
      const incoming = normalizeEncounteredCharacters([...(this.encounteredCharacters || []), character])
      this.encounteredCharacters = incoming
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
          }
        })

        const storyboard = saveValidatedStoryboardVersion({
          projectId,
          source: {
            sourceType: 'narrative-asset',
            sourceId: asset.id,
            title: asset.title
          },
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
        }
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
      const session = this.sessions.find(s => s.id === id)
      if (!session) return null
      this.currentSessionId = session.id
      const runtimeState = session.runtimeState || {}
      this.messages = cloneState(session.messages || runtimeState.messages || [], [])
      this.chatHistory = cloneState(session.chatHistory || runtimeState.chatHistory || [], [])
      const character = cloneState(session.worldState?.character || runtimeState.writingCharacter || DEFAULT_WRITING_CHARACTER, DEFAULT_WRITING_CHARACTER)
      this.writingCharacter = normalizeWritingCharacter(character)
      this.writingTime = normalizeWritingTime(session.worldState?.time || runtimeState.writingTime || DEFAULT_WRITING_TIME)
      this.worldMapState = normalizeWorldMapState(session.worldState?.worldMap || runtimeState.worldMapState || DEFAULT_WORLD_MAP_STATE)
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
        npcRelations: cloneState(this.npcRelations, {}),
        discoveredPlaces: cloneState(this.discoveredPlaces, []),
        completedQuests: cloneState(this.completedQuests, []),
        writingCharacter: cloneState(this.writingCharacter, DEFAULT_WRITING_CHARACTER),
        writingTime: cloneState(this.writingTime, DEFAULT_WRITING_TIME),
        worldMapState: cloneState(this.worldMapState, DEFAULT_WORLD_MAP_STATE),
        activeMechanism: this.activeMechanism,
        mechanismContext: cloneState(this.mechanismContext, null),
        milestoneEvent: cloneState(this.milestoneEvent, null),
        playerCharacter: cloneState(this.playerCharacter, { name: 'User', avatar: '' }),
        aiCharacter: cloneState(this.aiCharacter, { name: 'Assistant', avatar: '' }),
        dialogueMode: this.dialogueMode,
        dialogueCharacter: cloneState(this.dialogueCharacter, null)
      }
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
      this.saveCurrentSession()
      return result
    },

    summarizeMessages(messages) {
      return buildHeuristicContextSummary(messages, { maxSummaryChars: 1400 })
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

      const { hidden = false } = options

      // 隐藏命令不显示在 UI 中，但加入 AI 上下文
      if (!hidden) {
        this.messages.push({
          role: 'user',
          content: text,
          timestamp: Date.now()
        })
      }
      this.chatHistory.push({ role: 'user', content: text })
      this.saveCurrentSession()

      if (this.useAI) {
        await this.generateAIResponse()
      } else {
        this.isLoading = true
        try {
          const response = await apiSendAction(this.gameId, text)
          this.updateState(response)
          if (response.events) {
            for (const event of response.events) {
              if (event.type !== 'system' && event.type !== 'time_advance') {
                this.messages.push({
                  role: 'assistant',
                  content: event.description,
                  timestamp: Date.now()
                })
              }
            }
          }
          if (response.timeAdvanced) {
            this.messages.push({
              role: 'system',
              content: `时间已推进：${response.timeDescription}`,
              timestamp: Date.now()
            })
          }
          this.saveCurrentSession()
        } catch (e) {
          this.lastError = e.message
          this.messages.push({ role: 'system', content: `错误：${e.message}`, timestamp: Date.now() })
        } finally {
          this.isLoading = false
        }
      }
    },

    // --- 修改：更新消息后同步记忆 ---
    updateMessage(index, newContent) {
      if (this.messages[index]) {
        this.messages[index].content = newContent;
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
    async regenerateFrom(index) {
      debugLog('[regenerateFrom] START, messages count before slice:', this.messages.length, 'index:', index)
      // 1. 确保游戏在播放状态
      this.isPlaying = true

      // 2. 截断消息列表，只保留到当前点击的这一条
      this.messages = this.messages.slice(0, index + 1);
      debugLog('[regenerateFrom] messages count after slice:', this.messages.length)

      // 3. 重新构建 AI 记忆
      this.rebuildChatHistory();
      debugLog('[regenerateFrom] chatHistory after rebuild:', this.chatHistory.map(m => m.role + ':' + m.content?.slice(0, 30)))

      // 4. 如果开启了 AI，立即触发重新生成
      if (this.useAI) {
        // 标记为重写后续，避免触发初始化逻辑
        this._isRegenerating = true
        debugLog('[regenerateFrom] Starting, _isRegenerating:', this._isRegenerating)
        await this.generateAIResponse()
        this._isRegenerating = false
        debugLog('[regenerateFrom] Done, _isRegenerating:', this._isRegenerating)
      }
    },

    // --- 新增：辅助方法，确保界面和 AI 记忆完全一致 ---
    rebuildChatHistory() {
      // 从当前的 messages 完整重建 chatHistory
      // 保留 user 和 assistant 消息（不包括 system）
      const history = this.messages
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
        content: '你是一个小说叙述者，请用生动的语言描述场景并与玩家互动。'
      };

      this.chatHistory = [systemPrompt, ...history];
    },

    // --- 新增：提取出来的 AI 生成逻辑（流式输出）---
    async generateAIResponse() {
      this.isLoading = true;
      try {
        this.loadApiSettings();

        const worldStore = useWorldStore()
        const worldbook = worldStore.activeWorldbook
        const hasAssistantHistory = this.chatHistory.some(m => m.role === 'assistant')
        const isInitGeneration = this._isRegenerating ? false : !hasAssistantHistory

        const worldbookContext = buildWorldbookContext({
          worldbook,
          chatHistory: this.chatHistory,
          runtimeState: {
            writingCharacter: cloneState(this.writingCharacter, DEFAULT_WRITING_CHARACTER),
            writingTime: cloneState(this.writingTime, DEFAULT_WRITING_TIME),
            worldMapState: cloneState(this.worldMapState, DEFAULT_WORLD_MAP_STATE),
            activities: cloneState(this.activities, []),
            goals: cloneState(this.goals, DEFAULT_ADVENTURE_STATE.goals),
            encounteredCharacters: cloneState(this.encounteredCharacters, DEFAULT_ADVENTURE_STATE.encounteredCharacters),
            factionRelations: cloneState(this.factionRelations, DEFAULT_ADVENTURE_STATE.factionRelations),
            keyChoices: cloneState(this.keyChoices, DEFAULT_ADVENTURE_STATE.keyChoices),
            plotJournal: cloneState(this.plotJournal, DEFAULT_ADVENTURE_STATE.plotJournal),
            playerCharacter: cloneState(this.playerCharacter, { name: 'User', avatar: '', gender: '', age: '' }),
            dialogueCharacter: cloneState(this.dialogueCharacter, null)
          },
          tokenBudget: 2000,
          scanDepth: 3,
          includeStarterEntries: isInitGeneration
        })
        this.lastWorldbookContext = worldbookContext
        const worldBookMsg = worldbookContext.messages[0] || null
        debugLog('Matched world book entries:', worldbookContext.matchedEntries.length, worldBookMsg?.content?.slice(0, 100))

        const contextDetail = {
          character: cloneState(this.writingCharacter, DEFAULT_WRITING_CHARACTER),
          time: cloneState(this.writingTime, DEFAULT_WRITING_TIME),
          location: cloneState(this.worldMapState, DEFAULT_WORLD_MAP_STATE),
          scene: null,
          activities: cloneState(this.activities, []),
          goals: cloneState(this.goals, DEFAULT_ADVENTURE_STATE.goals),
          encounteredCharacters: cloneState(this.encounteredCharacters, DEFAULT_ADVENTURE_STATE.encounteredCharacters),
          factionRelations: cloneState(this.factionRelations, DEFAULT_ADVENTURE_STATE.factionRelations),
          keyChoices: cloneState(this.keyChoices, DEFAULT_ADVENTURE_STATE.keyChoices),
          plotJournal: cloneState(this.plotJournal, DEFAULT_ADVENTURE_STATE.plotJournal)
        }

        // 注入写作上下文（对话模式时传入对话角色）
        // 小说体验模式下排除时间信息，避免 AI 每次都强调时间
        const contextMsg = buildContextMessage(this.dialogueCharacter, { excludeTime: true, contextDetail })
        const localMemoryContext = buildScopedMemoryContext({
          projectId: this.worldId || worldbook?.id || '',
          sessionId: this.currentSessionId || '',
          limitPerScope: 4,
          maxItemChars: 180
        })
        const memoryQuery = [
          worldBookMsg?.content || '',
          contextMsg?.content || '',
          ...this.chatHistory.slice(-6).map((message) => String(message?.content || '').trim())
        ].filter(Boolean).join('\n')

        let memoryContext = localMemoryContext
        if (!memoryContext) {
          memoryContext = await buildMem0MemoryContext({
            currentSituation: memoryQuery,
            projectId: this.worldId || worldbook?.id || '',
            sessionId: this.currentSessionId || '',
            limitPerScope: 4,
            maxItemChars: 180
          })
        }

        this.lastMemoryContext = memoryContext
        const memoryMsg = memoryContext ? { role: 'system', content: memoryContext } : null

        // 构建消息序列：世界书 + 写作上下文 + 聊天历史
        let messagesToSend = [...this.chatHistory]
        if (worldBookMsg) {
          messagesToSend = [worldBookMsg, ...messagesToSend]
        }
        if (memoryMsg) {
          messagesToSend = [memoryMsg, ...messagesToSend]
        }
        if (contextMsg) {
          messagesToSend = [contextMsg, ...messagesToSend]
        }

        debugLog('Messages to send:', messagesToSend.length, 'entries')

        // 先添加一个空的 AI 消息占位符
        const messageIndex = this.messages.length
        this.messages.push({
          role: 'assistant',
          name: this.dialogueCharacter?.name || this.aiCharacter.name,
          content: '',
          timestamp: Date.now(),
          dialogueMode: !!this.dialogueCharacter,
          isStreaming: true
        })

        // 使用流式 API
        let fullContent = ''

        const maxTokens = isInitGeneration ? 1500 : 800

        await runGenerationStreamTask({
          taskType: isInitGeneration ? 'narrative.init' : 'narrative.continue',
          baseMessages: messagesToSend,
          worldId: this.worldId,
          settings: this.apiSettings,
          generationOptions: {
            max_tokens: maxTokens,
            attemptName: isInitGeneration ? 'narrative-init' : 'narrative-continue'
          },
          callbacks: {
            onChunk: (chunk) => {
              if (chunk.content) {
                fullContent += chunk.content
                // 实时更新消息内容
                if (this.messages[messageIndex]) {
                  this.messages[messageIndex].content = fullContent
                }
              }
            },
            onComplete: (result) => {
              // 标记流式结束
              if (this.messages[messageIndex]) {
                this.messages[messageIndex].isStreaming = false
              }
            },
            onError: (error) => {
              console.error('Stream error:', error)
              if (this.messages[messageIndex]) {
                this.messages[messageIndex].isStreaming = false
                this.messages[messageIndex].content = `生成出错：${error.message}`
              }
            }
          }
        })

        // 更新 chatHistory
        this.chatHistory.push({ role: 'assistant', content: fullContent });

        // 保存当前会话
        if (this.currentSessionId) {
          this.saveCurrentSession()
        }

        // 记录重要的叙事事件到记忆系统
        if (fullContent && fullContent.length > 20) {
          // 检测是否有重要事件（对话、物品获得、地点发现等）
          const hasDialogue = /"[^"]{5,}"|“[^”]{5,}”|「[^」]{5,}」/.test(fullContent)
          const hasItem = /获得|发现.*物品|得到/.test(fullContent)
          const hasLocation = /首次进入|发现.*地方|抵达|踏入/.test(fullContent)

          if (hasDialogue || hasItem || hasLocation) {
            const eventType = hasLocation ? 'location_discovery' : hasItem ? 'item_acquisition' : 'dialogue'
            recordMemory(
              fullContent,
              eventType,
              {
                character: this.playerCharacter?.name || '主角',
                scope: 'session',
                scopeId: this.currentSessionId || '',
                sourceRef: `gameStore:${this.currentSessionId || 'unknown'}:${messageIndex}`
              }
            ).catch(() => {}) // 静默失败
          }
        }

        // 内联事件标记保留（对话、物品等可点击查看）
        const inlineEvents = this.detectInlineEvents(fullContent, messageIndex)
        if (inlineEvents.length > 0) {
          this.addInlineEvents(inlineEvents)
        }

        // 从 AI 回复中提取状态更新
        this.extractAndUpdateState(fullContent)

        // 检测机制触发（战斗、交易、任务、对话）
        const mechanism = this.detectMechanismTriggers(fullContent)
        if (mechanism) {
          if (this.messages[messageIndex]) {
            this.messages[messageIndex].mechanismTrigger = mechanism
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
      } catch (e) {
        console.error('AI Error:', e)
        this.lastError = e.message;
        this.messages.push({ role: 'system', content: `AI 错误：${e.message}`, timestamp: Date.now() });
      } finally {
        this.isLoading = false;
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
      this.adventureTriggerPendingType = null
      this.npcRelations = runtime.npcRelations
      this.discoveredPlaces = runtime.discoveredPlaces
      this.completedQuests = runtime.completedQuests
      this.writingCharacter = runtime.writingCharacter
      this.writingTime = runtime.writingTime
      this.worldMapState = runtime.worldMapState
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
      this.isLoading = false
      this.lastError = null
      this.quickNoteImportMode = false
      this.quickNoteSelectedMessageIndexes = []
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

      // 构建系统提示词
      const systemParts = ['你是一个小说叙述者，请用生动的语言描述场景并与玩家互动。']

      // 世界设定描述
      const worldDesc = worldbook?.worldDescription || worldbook?.description || ''
      if (worldDesc.trim()) {
        systemParts.push(`\n\n【世界设定】\n${worldDesc.trim()}`)
      }

      // 写作风格
      if (worldbook?.writingStyle?.trim()) {
        systemParts.push(`\n\n【写作风格】\n${worldbook.writingStyle.trim()}`)
      }

      // 禁止内容
      if (worldbook?.forbidden?.trim()) {
        systemParts.push(`\n\n【禁止内容】\n${worldbook.forbidden.trim()}`)
      }

      // 示例
      if (worldbook?.examples?.trim()) {
        systemParts.push(`\n\n【示例】\n${worldbook.examples.trim()}`)
      }

      // 添加约束
      systemParts.push('\n\n请在叙事中严格遵循上述设定。')

      // 检查是否需要初始化角色/时间/地点
      const isFreshSession = !Array.isArray(this.messages) || this.messages.length === 0
      const needInitCharacter = !this.writingCharacter?.name || this.writingCharacter.name === 'User'
      const needInitTime = !this.writingTime?.year
      const needInitLocation = !this.worldMapState?.currentScene

      // 添加初始化指令
      systemParts.push(`\n\n【初始化要求】
这是故事的开始，你的回复需要包含以下两个部分：

第一部分——世界观旁白（用斜体 *包裹*）：
以旁白视角介绍故事发生的时代背景、世界特点、社会风貌或重要设定。让读者对即将展开的故事有一个宏观的认知。文字应富有文学性，营造氛围。

第二部分——故事开篇：
自然地引出主角，在叙述中明确交代：
${needInitCharacter ? '- 角色姓名（用"你叫XXX"句式）\n- 角色性别与年龄（如"25岁的年轻男子"）' : ''}
${needInitTime ? '- 故事时间（"XXXX年X月X日"格式）' : ''}
${needInitLocation ? '- 当前地点（"来到/身处XXX"）' : ''}
- 开篇场景，渲染氛围，埋下悬念

示例：

*大历三百二十七年，天下三分，北有强秦虎视眈眈，南有楚国偏安一隅，西凉铁骑时常犯境。这是一个英雄辈出的时代，也是一个命如草芥的乱世。朝廷腐败，民不聊生，江湖上却流传着无数关于绝世武功与神秘宝藏的传说。*

你叫【全新姓名】，一个【年龄】岁的【身份】。本次是全新会话，不要复用之前任何会话里出现过的名字，优先生成一个自然、独立、没有重复感的姓名。故事从这里开始，你背着简单的行囊，来到一座陌生的城镇。天色渐晚，青石板铺就的街道两旁，茶幡在微风中轻轻摇曳。远处传来小贩的吆喝声，空气中弥漫着炊烟的气息。你站在城门口，望着这座陌生的小城，心中盘算着接下来的路该如何走...`)

      if (isFreshSession) {
        systemParts.push('\n\n【新会话约束】这是首次开局，请强制生成与旧会话不同的主角名字；如果需要命名，请不要沿用示例中的占位内容。')
      }

      const systemContent = systemParts.join('')

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
      const saved = localStorage.getItem('apiSettings')
      if (saved) {
        this.apiSettings = { ...this.apiSettings, ...JSON.parse(saved) }
      }
    }
  }
})
