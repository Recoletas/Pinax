import { defineStore } from 'pinia'
import { sendAction as apiSendAction } from '../services/api'
import {
  resolveSelectedTextProviderConfig,
  toResolvedTextApiSettings
} from '../services/textProviderConfigStore'
import {
  buildNarrativeFormatInstructions,
  getTrustedMessageSpeaker,
  normalizeNarrativeMessages,
  parseNarrativePresentation
} from '../services/narrativePresentation'
// P4：可信说话者注册表（verified/unresolved/message-fallback）
import { buildSpeakerRegistry as buildSpeakerRegistryEntries } from '../../shared/narrativeSpeakerContract'
import { buildHeuristicContextSummary, compressChatHistory } from '../services/contextCompression'
import {
  appendPlayerHistoryNode,
  buildPlayerHistoryNodeFromPlotJournal,
  getPlayerHistoryNodeKey
} from '../services/experience/playerHistory'
import {
  archiveMemoryCandidate
} from '../services/memory/memoryCandidates'
import {
  RUNTIME_EVENT_LIMIT,
  capRuntimeEvents,
  createRuntimeEvent
} from '../services/experience/runtimeEvents'
import {
  buildRuntimeConflictKey,
  buildRuntimeEventCausality,
  canResolveRuntimeConflict
} from '../services/experience/runtimeEventCausality'
import { gameEmergenceActions } from '../services/experience/gameEmergenceCoordinator.js'
import { adventureTriggerActions } from '../services/experience/adventureTriggerCoordinator.js'
import {
  normalizeNarrativeSceneSummary,
  resolveNarrativeSceneSummary
} from '../services/agents/narrativeSceneSummary'
import { normalizeNarrativeSceneThread, sceneThreadRevision, SCENE_THREAD_LIMITS } from '../../shared/narrativeSceneThreadContract'
import { getItem, setItem, getTextItem, STORAGE_KEYS } from '../composables/useStorage'
import { useWorldStore } from './worldStore'
import {
  createMessageId,
  normalizeTurnRecords,
} from '../../shared/narrativeTurnContract.js'
import { normalizeExperienceAction } from '../../shared/experienceActionContract.js'
import { normalizeNarrativeIntent } from '../../shared/narrativeGenerationIntentContract.js'
import {
  DEFAULT_ADVENTURE_STATE,
  DEFAULT_WORLD_MAP_STATE,
  DEFAULT_WRITING_CHARACTER,
  DEFAULT_WRITING_TIME,
  cloneState,
  createEmptySessionRuntime,
  findSession,
  getWorldbookEntryNames,
  normalizeAdventureState,
  normalizeCanonicalFacts,
  normalizeCharacterRelations,
  normalizeCharacterStates,
  normalizeEncounteredCharacters,
  normalizeFactionRelations,
  normalizeGoals,
  normalizeKeyChoices,
  normalizePlaceStates,
  normalizePlotJournal,
  normalizeTextValue,
  normalizeWorldMapState,
  normalizeWritingCharacter,
  normalizeWritingTime
} from '../services/experience/gameSessionNormalization.js'
import {
  buildCreatedSessionRecord,
  buildCurrentSessionFields,
  deriveSessionTitle,
  findLatestSessionForWorldbook,
  flushSessionListWriter,
  getSessionListWriter
} from '../services/experience/gameSessionScheduler.js'
import { buildRuntimeSnapshot, projectRuntimeSnapshot } from '../services/experience/gameRuntimeProjection.js'
import { gameAuthoringObserverActions } from '../services/experience/gameAuthoringObserverCoordinator.js'
import { buildRuntimeResetPatch } from '../services/experience/gameLifecycleDefaults.js'
import {
  detectMechanismTriggersFromContent,
  extractDialogueMechanism,
  extractDialogueSpeaker
} from '../services/experience/experienceMechanismProjection.js'
import { cancelExperienceTurn, runExperienceTurn } from '../services/experience/experienceTurnCoordinator.js'
// C 线跑团（nightly-20260916）：会话级轻规则状态归一化与发送门禁。
// 域逻辑在 src/services/experience/roleplay/，这里只保留三个窄接缝。
// （normalizeRoleplaySessionState 由 roleplayWorkflow 再导出，控制 import 行数预算。）
import { assertRoleplaySendAllowed, loadRoleplayStateForSession } from '../services/experience/roleplay/roleplayWorkflow.js'
import {
  buildAdventureCreativeSourceRefs as buildCreativeSourceRefs,
  buildPlotJournalEntry as buildJournalEntry
} from '../services/experience/gameJournalProjection.js'
import {
  computeFactionDeltas,
  filterMentionedNames,
  parseActivityEvents,
  parseGoalIntent,
  parseKeyChoiceLabels,
  parseLocationChange,
  parseWritingCharacterChange,
  parseWritingTimeChange
} from '../services/experience/gameStateExtraction.js'
import { gameBranchWorkflowActions } from '../services/experience/gameBranchWorkflow.js'


function buildAdventureCreativeSourceRefs(store, messageIds = [], plotEntry = null) {
  // 纯投影在 gameJournalProjection（B8）；store 只补充 active worldbook 回退
  return buildCreativeSourceRefs(store, messageIds, plotEntry, {
    projectIdFallback: resolveActiveWorldbookId()
  })
}


function debugLog(...args) {
  // import.meta.env 仅由打包器注入；plain node 下为 undefined（脚本矩阵环境）
  if (import.meta.env?.DEV) globalThis.console?.debug?.(...args)
}

function resolveActiveWorldbookId() {
  try {
    const worldStore = useWorldStore()
    return worldStore.activeWorldbook?.id || null
  } catch {
    return null
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
    // Q1：叙事展开度（紧凑/标准/展开），只影响生成目标长度与 token 预算。
    narrativeExpansion: 'standard',
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
    // Q2：SceneThread 软状态（随 pre/post 快照、分支、撤销、刷新、备份恢复）
    sceneThread: null,

    // 运行时事件侧车 (v1 append-only, ≤200 events per session)
    runtimeEvents: [],

    // R1a：回合事务记录（id → NarrativeTurnRecord，LRU ≤50）。
    // 每条含 preRuntimeSnapshot，供 regenerate/失败回滚恢复 runtime state。
    turnRecords: {},
    lastCommittedTurnId: null,
    pendingTurnRecord: null,
    // R1b：当前活跃分支。regenerate 时新建分支并切换，displayMessages 按它过滤。
    activeBranchId: 'main',
    // P1-3：新分支的分叉父 turn（重生成时记录，collectBranchTurnChain 回退用）
    pendingBranchParentTurnId: null,
    // R6：仅下一轮导演注（由 executeExperienceAction 'director-note' 设置，发送时消费）
    pendingDirectorNote: null,
    // P1-5：最近一次已提交回合的回执（低敏摘要，体验页渲染用）
    lastTurnReceipt: null,

    // C 线跑团：会话级轻规则状态（null = 旧会话自由叙事，不迁移、不弹窗）。
    // pending 检定、回执热窗口与归档 outbox 挂在这里，随会话同一次 durable 写入落盘。
    roleplaySession: null,
    // CX05：未知/未来版本的 roleplay 原始数据（只读透传）；当前版本数据存在时为 null。
    roleplayFutureRaw: null,

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

    ...gameEmergenceActions,

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
      } catch {
        return null
      }
    },

    ...adventureTriggerActions,

    buildPlotJournalEntry() {
      return buildJournalEntry({
        chatHistory: this.chatHistory,
        plotJournal: this.plotJournal,
        encounteredCharacters: this.encounteredCharacters,
        worldMapState: this.worldMapState,
        keyChoices: this.keyChoices,
        goals: this.goals
      })
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
      // 500ms trailing 去抖；写手属于 scheduler 模块，store 只提供只读 getter
      getSessionListWriter(this, { getSessions: () => this.sessions })()
    },

    flushSaveSessions() {
      // 返回最近/本次写盘结果（true/false），让保存失败对调用方可观测
      return flushSessionListWriter(this, { getSessions: () => this.sessions })
    },

    // B-R2：外层事务（switchBranch/undo-extension/生成失败恢复/regenerateFrom
    // 出口）的最终一致态提交点：先用 canonical 组装器把当前 runtime 同步进
    // 会话记录，再立即写盘。事务中间态不得调用本方法。
    commitCurrentSessionNow() {
      this.saveCurrentSession()
      return this.flushSaveSessions()
    },

    getLatestSessionForWorldbook(worldbookId) {
      return findLatestSessionForWorldbook(this.sessions, worldbookId)
    },

    createSession(options = {}) {
      const { title = '新会话', worldbookId = null, inheritRuntimeState = false } = options || {}
      const currentWorldbookId = worldbookId || resolveActiveWorldbookId() || this.worldId || ''
      const runtimeState = inheritRuntimeState
        ? this.getRuntimeSnapshot()
        : createEmptySessionRuntime()

      const session = buildCreatedSessionRecord({
        id: 'sess_' + Date.now(),
        title,
        worldbookId: currentWorldbookId,
        runtimeState
      })
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
      const worldbookId = this.worldId || this.sessions[idx].worldbookId || this.sessions[idx].worldId || resolveActiveWorldbookId() || ''
      // 会话记录字段构造归 scheduler 模块；store 仍是 sessions 数组的唯一 owner
      const fields = buildCurrentSessionFields({
        messages: this.messages,
        chatHistory: this.chatHistory,
        runtimeState: this.getRuntimeSnapshot(),
        writingCharacter: this.writingCharacter,
        writingTime: this.writingTime,
        worldMapState: this.worldMapState,
        activities: this.activities,
        turnRecords: this.turnRecords,
        lastCommittedTurnId: this.lastCommittedTurnId,
        activeBranchId: this.activeBranchId,
        worldbookId,
        roleplaySession: this.roleplaySession,
        roleplayFutureRaw: this.roleplayFutureRaw,
        previousSchemaVersion: this.sessions[idx].schemaVersion
      })
      Object.assign(this.sessions[idx], fields)
      if (this.messages.length > 1) {
        const derivedTitle = deriveSessionTitle(this.messages)
        if (derivedTitle) this.sessions[idx].title = derivedTitle
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
      // Presentation normalization is a data migration, not only a render
      // concern. Persist it immediately so an old conversation does not
      // revert to the pre-v5 paragraph layout after the next reload.
      session.messages = cloneState(this.messages, [])
      if (session.runtimeState && Array.isArray(session.runtimeState.messages)) {
        session.runtimeState.messages = cloneState(this.messages, [])
      }
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
      this.sceneThread = normalizeNarrativeSceneThread(runtimeState.sceneThread || null)
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
      // C 线跑团：恢复已结算等待回应的检定；未知/未来版本原样保留为只读
      // futureRaw（CX05），写回路径不 normalize，避免有损覆盖。
      {
        const loaded = loadRoleplayStateForSession(session.roleplay ?? null)
        this.roleplaySession = loaded.current
        this.roleplayFutureRaw = loaded.futureRaw
      }
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

    getRuntimeSnapshot({ forSession = true } = {}) {
      // 快照构建归 projection 模块：store 只提供只读字段视图
      return buildRuntimeSnapshot({
        roleplaySession: this.roleplaySession,
        messages: this.messages,
        chatHistory: this.chatHistory,
        time: this.time,
        player: this.player,
        inventory: this.inventory,
        quests: this.quests,
        flags: this.flags,
        activities: this.activities,
        goals: this.goals,
        encounteredCharacters: this.encounteredCharacters,
        factionRelations: this.factionRelations,
        keyChoices: this.keyChoices,
        plotJournal: this.plotJournal,
        adventureTriggers: this.adventureTriggers,
        adventureTriggerHistory: this.adventureTriggerHistory,
        adventureTriggerCooldownUntil: this.adventureTriggerCooldownUntil,
        emergenceCandidates: this.emergenceCandidates,
        emergenceDismissedIds: this.emergenceDismissedIds,
        emergenceDraft: this.emergenceDraft,
        npcRelations: this.npcRelations,
        discoveredPlaces: this.discoveredPlaces,
        completedQuests: this.completedQuests,
        writingCharacter: this.writingCharacter,
        writingTime: this.writingTime,
        placeStates: this.placeStates,
        characterStates: this.characterStates,
        characterRelations: this.characterRelations,
        canonicalFacts: this.canonicalFacts,
        worldMapState: this.worldMapState,
        historyNode: this.historyNode,
        narrativeSceneSummary: this.narrativeSceneSummary,
        sceneThread: this.sceneThread,
        activeMechanism: this.activeMechanism,
        mechanismContext: this.mechanismContext,
        milestoneEvent: this.milestoneEvent,
        playerCharacter: this.playerCharacter,
        aiCharacter: this.aiCharacter,
        dialogueMode: this.dialogueMode,
        dialogueCharacter: this.dialogueCharacter,
        runtimeEvents: this.runtimeEvents
      }, { forSession })
    },

    // R1a：从 preRuntimeSnapshot 恢复 runtime state（回合事务失败/regenerate 回滚用）。
    // 复用 loadSession 的 normalize 模式；不恢复 messages/chatHistory（由调用方单独处理）。
    applyRuntimeSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return
      // 恢复补丁由 projection 模块归一化；缺失字段回退当前状态（与迁出前一致）。
      // 本层只计算并应用投影；是否以及何时落盘由外层完整事务决定。
      const patch = projectRuntimeSnapshot(snapshot, {
        roleplaySession: this.roleplaySession,
        player: this.player,
        inventory: this.inventory,
        quests: this.quests,
        flags: this.flags,
        npcRelations: this.npcRelations,
        discoveredPlaces: this.discoveredPlaces,
        completedQuests: this.completedQuests
      })
      Object.assign(this, patch)
      // B-R1：本方法只负责内存投影（normalize + 一次性更新 Pinia runtime），
      // 不自行保存、不 flush——落盘由外层事务（switchBranch/undo-extension/
      // 生成失败恢复/regenerateFrom）在最终一致态统一提交，避免中途存档
      // 把"半事务"写进存档。
      return patch
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
      // 纯检测在 experienceMechanismProjection（R-X3）；store 只接结果
      return detectMechanismTriggersFromContent(content, {
        extractDialogueMechanism: (text, match) => extractDialogueMechanism(text, match, { extractDialogueSpeaker })
      })
    },

    extractDialogueMechanism(content, match) {
      return extractDialogueMechanism(content, match, { extractDialogueSpeaker })
    },

    extractDialogueSpeaker(content, match) {
      return extractDialogueSpeaker(content, match)
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

      // C 线跑团：存在可叙述 pending 时只放行它的叙述请求，防止正文绕过已冻结骰点。
      assertRoleplaySendAllowed(this, options)

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
      // C1：hidden 控制指令（extend/advance）不写入 chatHistory、runtime user event，
      // 避免控制指令被误认为玩家行动、挤占最近历史。
      if (!hidden) {
        this.chatHistory.push({ role: 'user', content: text })
        this.appendRuntimeEvent({
          type: 'turn',
          source: 'user',
          payload: {
            preview: String(text || '').slice(0, 200),
            hidden: false
          },
          messageId: userMessageId || null,
          turnId: null
        })
      }
      this.saveCurrentSession()

      if (this.useAI) {
        // C1：推断 intent（hidden → extend/advance，可见 → respond，无历史 → open）
        const intent = hidden
          ? normalizeNarrativeIntent(options.intent || (options.source === 'auto-advance' ? 'advance' : 'extend'))
          : (this.chatHistory.filter((m) => m.role === 'assistant').length === 0 ? 'open' : 'respond')
        await this.generateAIResponse({
          narrativeMode,
          directorNote: effectiveDirectorNote,
          userMessageId,
          intent,
          roleplayActionId: options.roleplayActionId || ''
        })
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
          role: this.messages[index].role,
          // P1-4：编辑重解析也带 speakerMap（保持 speakerId 与 cast 对齐）
          speakerMap: this.messages[index].speakerMap || null,
          // P4：可信说话者注册表（未知 marker 名称 → 未署名对白）
          speakerRegistry: this.buildSpeakerRegistry()
        })
        this.rebuildChatHistory(); // 同步 AI 记忆
        this.saveCurrentSession()
      }
    },

    // P1：原子删除事务 —— 查 owning turn/segment → 统一处理 messages、chatHistory、
    // inline events、runtime event provenance、pending 记忆候选、不可达 turn GC。
    deleteMessage(index) {
      const message = this.messages[index]
      if (!message) return
      const messageId = String(message.id || '')
      // 1. 查 owning turn（按 messageId）
      const turn = messageId ? this.findTurnByMessageId(messageId) : null
      const turnId = turn?.id || null
      // 2. 移除消息
      this.messages.splice(index, 1)
      // 3. 从 turn 移除 messageId（保留分支拓扑，仅标 detached）
      if (turn) {
        turn.assistantMessageIds = (turn.assistantMessageIds || []).filter((id) => id !== messageId)
        turn.userMessageIds = (turn.userMessageIds || []).filter((id) => id !== messageId)
        turn.detachedMessageIds = [...new Set([...(turn.detachedMessageIds || []), messageId])].filter(Boolean)
      }
      // 4. 归档该 turn 的 pending/local-only 记忆候选（用户已确认/同步的不删，只标来源缺失）
      if (turnId) {
        for (const candidateId of turn.memoryCandidateIds || []) {
          try { archiveMemoryCandidate(candidateId, { note: 'message-deleted' }) } catch { /* 尽力而为 */ }
        }
        turn.memoryCandidateIds = []
      }
      // 5. 移除引用该 messageId 的 inlineEvents 与带 provenance 的 runtime events
      this.inlineEvents = (this.inlineEvents || []).filter((event) => event?.messageId !== messageId)
      this.runtimeEvents = (this.runtimeEvents || []).filter((event) => (
        event?.messageId !== messageId && event?.turnId !== turnId
      ))
      // 6. 引用感知 GC：无消息且无后代引用的 turn
      this.gcUnreachableTurns()
      this.rebuildChatHistory()
      this.saveCurrentSession()
    },

    ...gameBranchWorkflowActions,

    // P1-5：从 lastNarrativeKernel 的 cast block 构建 名字→speakerId 映射。
    // 供 dialogue block 解析时覆盖 speakerId（与 SceneCast 对齐，改名不漂移）。
    buildCastSpeakerMap() {
      const castBlock = (this.lastNarrativeKernel?.blocks || []).find((block) => block?.kind === 'cast')
      const members = castBlock?.content?.members || []
      const map = {}
      for (const member of members) {
        if (member?.name && member?.speakerId) map[member.name] = member.speakerId
      }
      return Object.keys(map).length > 0 ? map : null
    },

    // P4：构建可信说话者注册表 —— player / 当前对白角色 / SceneCast / 运行时角色 / 世界书角色。
    // 只认这些来源的名字；marker 里的未知名字 → 未署名对白（不创建 speakerId）。
    buildSpeakerRegistry() {
      const worldStore = useWorldStore()
      const worldbookEntries = Array.isArray(worldStore.activeWorldbook?.entries) ? worldStore.activeWorldbook.entries : []
      const castBlock = (this.lastNarrativeKernel?.blocks || []).find((block) => block?.kind === 'cast')
      const castMembers = castBlock?.content?.members || []
      return buildSpeakerRegistryEntries({
        player: this.playerCharacter || null,
        dialogueCharacter: this.dialogueCharacter || null,
        cast: castMembers,
        encountered: this.encounteredCharacters || [],
        worldbookCharacters: worldbookEntries
          .filter((entry) => normalizeTextValue(entry?.type).toLowerCase() === 'character')
          .map((entry) => ({ id: entry.id, name: entry.name || entry.keys?.[0] }))
      })
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
            // payload: { index } —— 从该消息处建立分支（保留旧消息，切新分支）。
            // 无 index（/branch 菜单）时，从最后一条 user 消息处分支；
            // 空会话（无 user 消息）返回明确错误，不从助手开场消息分支。
            {
              let branchIndex = payload.index
              if (typeof branchIndex !== 'number') {
                const lastUserIndex = (this.messages || []).findLastIndex((m) => m?.role === 'user')
                if (lastUserIndex < 0) return { ok: false, error: 'NO_USER_TURN' }
                branchIndex = lastUserIndex
              }
              await this.regenerateFrom(branchIndex)
              return { ok: true }
            }
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
            // C1.4：继续上一回复 —— 走 extend intent（不新增 user turn，从最后一句直接续接）
            {

              if (this.isLoading) return { ok: false, error: 'BUSY' }
              await this.generateAIResponse({ intent: 'extend' })
              return { ok: true }
            }
          case 'advance':
            // C6/评测：推进一个 advance beat（NPC/环境/既有因果），不替玩家作决定。
            {
              if (this.isLoading) return { ok: false, error: 'BUSY' }
              await this.generateAIResponse({ intent: 'advance' })
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
          case 'undo-extension':
            // C4：撤销最后一段续接 —— 移除最后一个 segment，恢复前一正文 + 状态快照，
            // 并归档该回合记忆候选、清除机制触发，作为完整事务回滚。
            {
              const targetId = String(payload.messageId || '').trim()
              const target = (this.messages || []).find((m) => m?.id === targetId)
              if (!target || !Array.isArray(target.segments) || target.segments.length <= 1) {
                return { ok: false, error: 'NO_EXTENSION' }
              }
              const removed = target.segments.slice(0, -1)
              const removedSegment = target.segments[target.segments.length - 1]
              const extensionTurn = removedSegment?.turnId ? this.turnRecords[removedSegment.turnId] : null
              if (extensionTurn?.preRuntimeSnapshot) {
                this.applyRuntimeSnapshot(extensionTurn.preRuntimeSnapshot)
              }
              if (extensionTurn) {
                // P0-3：归档本回合产生的记忆候选，避免 failed turn 被归一化丢弃后候选作为共享记忆残留。
                for (const candidateId of extensionTurn.memoryCandidateIds || []) {
                  try { archiveMemoryCandidate(candidateId, { note: 'extension-undone' }) } catch { /* 尽力而为 */ }
                }
                extensionTurn.status = 'failed'
                if (this.lastCommittedTurnId === extensionTurn.id) {
                  this.lastCommittedTurnId = extensionTurn.parentTurnId || null
                }
              }
              // P0-3：撤销可能由本段续接触发的机制面板。
              target.mechanismTrigger = null
              target.segments = removed
              target.content = removed
                .map((segment) => String(segment.cleanContent || '').trim())
                .filter(Boolean)
                .join('\n\n')
              target.presentation = {
                version: 3,
                source: 'model-structured',
                status: 'complete',
                content: target.content,
                blocks: removed.flatMap((segment) => (Array.isArray(segment.blocks) ? segment.blocks : [])),
                hasMarkers: removed.some((segment) => (Array.isArray(segment.blocks) ? segment.blocks : []).length > 0)
              }
              // P0-3：移除引用被撤销消息的未消费 inlineEvents（按 messageId 关联）。
              this.inlineEvents = (this.inlineEvents || []).filter((event) => event?.messageId !== targetId)
              this.rebuildChatHistory()
              // 最终一致态提交点（B-R2）
              this.commitCurrentSessionNow()
              return { ok: true }
            }
          default:
            return { ok: false, error: 'UNKNOWN_ACTION' }
        }
      } catch (e) {
        return { ok: false, error: e?.message || 'ACTION_FAILED' }
      }
    },

    cancelNarrativeGeneration(reason = 'user-cancelled') {
      cancelExperienceTurn(this, reason)
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
    async generateAIResponse(options = {}) {
      return runExperienceTurn(this, options)
    },

    // 从 AI 回复中提取并更新状态
    extractAndUpdateState(content) {
      if (!content || typeof content !== 'string') return

      debugLog('[extractAndUpdateState] 开始提取状态更新')

      // B12 流水线：各提取阶段相互隔离——单类解析异常记录后继续，
      // 不留下“时间已写、地点丢失”的半写状态，也不让解析异常冒泡
      // 打断回合完成流程。阶段顺序与迁出前一致。
      const stages = [
        ['time', () => this.extractTimeChanges(content)],
        ['location', () => this.extractLocationChanges(content)],
        ['character', () => this.extractCharacterChanges(content)],
        ['activity', () => this.extractActivityEvents(content)],
        ['adventure', () => this.extractAdventureState(content)],
        ['plot-journal', () => this.maybeAppendPlotJournalEntry()],
        // 只在完整回复完成并提取状态后收集候选，不在流式文本期间弹出事件。
        ['emergence', () => this.refreshEmergenceCandidates()]
      ]
      for (const [, run] of stages) {
        try {
          run()
        } catch {
          // 单级失败必须生产可观测（console.warn），不能用仅 dev 的 debugLog 静默

        }
      }
    },

    // 提取时间变化
    extractTimeChanges(content) {
      const nextWritingTime = parseWritingTimeChange(content, this.writingTime)
      if (nextWritingTime) this.saveWritingTime(nextWritingTime)
    },

    // 提取地点变化
    extractLocationChanges(content) {
      // 地点解析在 gameStateExtraction（B12）；store 只保留应用边界
      const location = parseLocationChange(content)
      if (location) {
        this.saveWorldMapState({
          ...this.worldMapState,
          currentScene: location
        })
      }
    },

    // 提取角色状态变化
    extractCharacterChanges(content) {
      const character = parseWritingCharacterChange(content, this.writingCharacter)
      if (character) this.saveWritingCharacter(character)
    },

    // 提取活动事件
    extractActivityEvents(content) {
      for (const event of parseActivityEvents(content)) {
        this.addActivity({ ...event, date: this.formatCurrentTime() })
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

    ...gameAuthoringObserverActions,

    extractGoalState(content) {
      // 解析在 gameStateExtraction（B12 第二刀）；store 只保留应用
      const intent = parseGoalIntent(content, normalizeTextValue)
      if (intent) {
        this.upsertGoal({
          title: intent.title,
          source: 'derived-parse',
          status: intent.status,
          updatedAt: Date.now()
        })
      }
    },

    extractEncounteredCharacters(content) {
      const worldStore = useWorldStore()
      const candidates = getWorldbookEntryNames(worldStore.activeWorldbook, 'character', 24)
      for (const name of filterMentionedNames(content, candidates)) {
        this.addEncounteredCharacter({
          name,
          source: 'worldbook-match',
          lastSeenAt: Date.now()
        })
      }
    },

    extractKeyChoices(content) {
      for (const label of parseKeyChoiceLabels(content, normalizeTextValue)) {
        this.recordKeyChoice({
          label,
          source: 'derived-parse',
          createdAt: Date.now()
        })
      }
    },

    extractFactionRelations(content) {
      const worldStore = useWorldStore()
      const factions = getWorldbookEntryNames(worldStore.activeWorldbook, 'organization', 20)
      for (const { name, delta } of computeFactionDeltas(content, factions)) {
        const current = Number(this.factionRelations?.[name] || 0)
        this.setFactionRelation(name, current + delta)
      }
    },

    resetGameState() {
      this.resetRuntimeState()
    },

    resetRuntimeState() {
      // 字段补丁由 lifecycle 默认值模块唯一装配（B14）；范围合同见该模块头注
      this.cancelNarrativeGeneration('runtime-reset')
      Object.assign(this, buildRuntimeResetPatch())
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
    },

    // Q1：读取叙事展开度（紧凑/标准/展开），来自独立 localStorage 键。
    resolveNarrativeExpansion() {
      const raw = String(getTextItem(STORAGE_KEYS.EXPERIENCE_NARRATIVE_EXPANSION) || '').toLowerCase()
      const valid = ['compact', 'standard', 'expanded']
      const level = valid.includes(raw) ? raw : 'standard'
      this.narrativeExpansion = level
      return level
    },

    // Q4/P6：把本轮 BeatPlan 写回 SceneThread 软状态（有效变化、人物 meaningful move）。
    // currentObjective 不被 revealOrChange 覆盖（revealOrChange 只进 establishedProgress）；
    // recentRepetitions 取 BeatPlan 的 avoidRepeats + 角色动作（action/result）+ 功能细节滚动。
    applyBeatPlanToSceneThread(thread, beatPlan) {
      if (!thread || !beatPlan || typeof beatPlan !== 'object') return thread
      const progress = []
      if (beatPlan.revealOrChange) progress.push(beatPlan.revealOrChange)
      for (const step of (Array.isArray(beatPlan.causalSteps) ? beatPlan.causalSteps : [])) {
        progress.push(step)
      }
      const moves = Array.isArray(beatPlan.characterMoves) ? beatPlan.characterMoves : []
      const cast = (Array.isArray(thread.cast) ? thread.cast : []).map((member) => {
        const move = moves.find((m) => m.character === member.name || m.character === member.characterId)
        if (!move) return member
        return {
          ...member,
          immediateIntent: move.intent || member.immediateIntent,
          lastMeaningfulMove: move.action || member.lastMeaningfulMove
        }
      })
      // P6：本轮实际发生的动作/细节 + 模型声明要避免的重复 → 滚动进 recentRepetitions
      const occurred = [
        ...(Array.isArray(beatPlan.avoidRepeats) ? beatPlan.avoidRepeats : []),
        ...moves.flatMap((move) => [move.action, move.result]),
        ...(Array.isArray(beatPlan.functionalDetails) ? beatPlan.functionalDetails.map((item) => item.detail) : [])
      ].filter(Boolean)
      const seen = new Set((thread.recentRepetitions || []).filter(Boolean))
      for (const item of occurred) {
        const cleaned = String(item).replace(/\s+/g, ' ').trim().slice(0, 200)
        if (cleaned && !seen.has(cleaned)) seen.add(cleaned)
      }
      const next = normalizeNarrativeSceneThread({
        ...thread,
        establishedProgress: progress.filter(Boolean).slice(-3),
        cast,
        // P6-2：场景目标不被单回合 revealOrChange 覆盖（目标完成/换线程时才变更）
        currentObjective: thread.currentObjective,
        recentRepetitions: [...seen].slice(-SCENE_THREAD_LIMITS.maxRecentRepetitions),
        updatedAt: Date.now()
      })
      return { ...next, revision: sceneThreadRevision(next) }
    }
  }
})
