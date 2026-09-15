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
import {
  formatAdventureStoryboardSeedContent,
  generateAdventureProseDraft,
  generateAdventureStoryboardDraft
} from '../services/experience/generationAdventureTriggers'
import { buildHeuristicContextSummary, compressChatHistory } from '../services/contextCompression'
import {
  appendPlayerHistoryNode,
  buildPlayerHistoryContext,
  buildPlayerHistoryNodeFromPlotJournal,
  getPlayerHistoryNodeKey
} from '../services/playerHistory'
import { buildGeoHistoryRuntimeContext } from '../services/worldHistory/runtimeContext'
import { buildEmergenceCandidates } from '../services/worldHistory/emergenceScheduler'
import { generateEmergenceEventDraft } from '../services/experience/generationEmergence'
import {
  archiveMemoryCandidate
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
  addNarrativeAssetDurable,
  createNarrativeAssetSourceRef,
  mergeSourceRefs,
  normalizeContentRef
} from '../services/narrativeAssets'
import { saveValidatedStoryboardVersion } from '../services/storyboardStore'
import { createLegacyExperienceStateBridge } from '../services/agents/authoring/legacyExperienceStateBridge'
import { createAuthoringObserverScheduler } from '../services/agents/observers/authoringObserverScheduler'
import { createAuthoringObserverRunner } from '../services/agents/observers/authoringObserverDerivation'
import { normalizeAuthoringObserverProvenance } from '../services/agents/observers/authoringObservationContract'
import { createMemoryTriggers } from '../services/memoryTriggers'
import { invalidateMemoryBySource } from '../services/memoryCandidates'
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
  ADVENTURE_TRIGGER_COOLDOWN_MS,
  ADVENTURE_TRIGGER_MAX_PER_WINDOW,
  ADVENTURE_TRIGGER_WINDOW_MS,
  DEFAULT_ADVENTURE_STATE,
  DEFAULT_WORLD_MAP_STATE,
  DEFAULT_WRITING_CHARACTER,
  DEFAULT_WRITING_TIME,
  cloneState,
  createEmptySessionRuntime,
  findSession,
  getWorldbookEntryNames,
  normalizeAdventureState,
  normalizeAdventureTriggerDraft,
  normalizeAdventureTriggerHistory,
  normalizeCanonicalFacts,
  normalizeCharacterRelations,
  normalizeCharacterStates,
  normalizeEmergenceCandidates,
  normalizeEmergenceDismissedIds,
  normalizeEmergenceDraft,
  normalizeEncounteredCharacters,
  normalizeFactionRelations,
  normalizeGoals,
  normalizeKeyChoices,
  normalizeNumber,
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
import { createAuthoringObserverHub } from '../services/experience/gameObserverRuntime.js'
import { buildRuntimeResetPatch } from '../services/experience/gameLifecycleDefaults.js'
import { cancelExperienceTurn, runExperienceTurn } from '../services/experience/experienceTurnCoordinator.js'
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
import {
  collectBranchTurnChain as collectTurnChain,
  collectVisibleMessageIds as collectChainMessageIds,
  gcUnreachableTurns as gcBranchTurns,
  latestBranchTurn as latestCommittedBranchTurn,
  markSupersededMessages
} from '../services/experience/gameBranchTurnGraph.js'


function buildAdventureCreativeSourceRefs(store, messageIds = [], plotEntry = null) {
  // 纯投影在 gameJournalProjection（B8）；store 只补充 active worldbook 回退
  return buildCreativeSourceRefs(store, messageIds, plotEntry, {
    projectIdFallback: resolveActiveWorldbookId()
  })
}


function debugLog(...args) {
  // import.meta.env 仅由打包器注入；plain node 下为 undefined（脚本矩阵环境）
  if (import.meta.env?.DEV) {
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

// Authoring runtime（模块级、非持久化）：正文提交后经统一 bridge 调度后台派生观察器。
// 观察器输出永远是低优先级 derived state / typed exception，不直接改正文和 locked canon。
// 订阅/缓冲/异常隔离的唯一 owner 是 gameObserverRuntime 的 hub（B7）；
// bridge/scheduler/memoryTriggers 的编排闭包留在 store（需要会话能力）。
let authoringObserverBridge = null
let authoringObserverScheduler = null
let authoringMemoryTriggers = null
const authoringObserverHub = createAuthoringObserverHub()


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

    // 涌现候选确认（写作工作区审阅闭环 / spec §8.3）：
    // 只走派生状态路径——留下确认 runtime event 并把候选移出待审；
    // 不直接改写 locked/canonical 设定，正文与事实仍由用户在文档中显式落笔。
    acknowledgeEmergenceCandidate(candidateId) {
      const id = normalizeTextValue(candidateId)
      const candidate = (this.emergenceCandidates || []).find((item) => item?.id === id)
      if (!candidate) return { ok: false, reason: 'candidate-missing' }
      this.emergenceDismissedIds = normalizeEmergenceDismissedIds([
        ...(this.emergenceDismissedIds || []),
        id
      ])
      this.emergenceCandidates = (this.emergenceCandidates || []).filter((item) => item?.id !== id)
      if (this.emergenceDraft?.candidateId === id && this.emergenceDraft.decision !== 'applied') {
        this.emergenceDraft = null
      }
      this.appendRuntimeEvent({
        type: 'display_event',
        source: 'emergence',
        payload: {
          kind: 'emergence-candidate-confirmed',
          candidateId: id,
          candidateType: candidate.type,
          placeId: candidate.placeId || '',
          sourceRefs: candidate.sourceRefs
        }
      })
      this.saveCurrentSession()
      return { ok: true, candidateId: id }
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
        const persistedAsset = addNarrativeAssetDurable({
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
        if (!persistedAsset.ok) throw new Error('素材保存失败，未采纳这份分镜草稿')
        const asset = persistedAsset.asset
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

      const persistedAsset = addNarrativeAssetDurable({
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
      if (!persistedAsset.ok) throw new Error('素材保存失败，未采纳这份正文草稿')
      const asset = persistedAsset.asset

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
        await this.generateAIResponse({ narrativeMode, directorNote: effectiveDirectorNote, userMessageId, intent })
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

    // P1：删除后清理完全不可达的 turn record（无 assistantMessageIds/userMessageIds、
    // 无 baseMessageId 引用、无其他 turn 把它当 parent）。仍被分支链引用的拓扑保留。
    gcUnreachableTurns() {
      // GC 判定归 branch-turn 图模块（B11）：store 只保留保留条件里的游标
      this.turnRecords = gcBranchTurns(this.turnRecords, {
        lastCommittedTurnId: this.lastCommittedTurnId,
        pendingBranchParentTurnId: this.pendingBranchParentTurnId
      })
    },

    // --- 新增：核心”执行”功能 ---
    // 点击某条消息的”执行”按钮时调用
    // R1a：根据消息 id 反查所属的 turnRecord。
    // 优先精确匹配 assistantMessageIds；其次匹配 userMessageIds（用于从 user 消息 regenerate）。
    findTurnByMessageId(messageId) {
      if (!messageId) return null
      // C4/P0-2：只认 committed 且在当前分支祖先链上的回合，避免选中 failed/撤销回合或其它分支的 extension。
      const chain = this.collectBranchTurnChain(this.activeBranchId || 'main')
      return Object.values(this.turnRecords || {})
        .filter((record) => (
          record.status === 'committed'
          && chain.has(record.id)
          && (
            record.assistantMessageIds?.includes(String(messageId))
            || record.baseMessageId === String(messageId)
            || record.userMessageIds?.includes(String(messageId))
          )
        ))
        .sort((a, b) => (b.committedAt || 0) - (a.committedAt || 0))[0] || null
    },

    // C4：当前分支最后一条可见、已提交的 assistant 消息（extend 目标）。
    findLastVisibleAssistantMessage() {
      const visibleIds = this.currentBranchVisibleMessageIds()
      return [...(this.messages || [])].reverse().find((message) => (
        message?.role === 'assistant'
        && !message.superseded
        && (!message.branchId || visibleIds.has(message.id))
      )) || null
    },

    // P0-1：当前分支可见消息 id 集合 —— 基于 turn 祖先链。
    // 从当前分支最新 committed turn 沿 parentTurnId 回溯，收集链上每个 turn 的
    // user/assistant 消息 id。嵌套分叉时，只有祖先链上的消息可见，
    // 子分支独有历史不会被误提升为共享。
    collectBranchTurnChain(branchId) {
      return collectTurnChain(this.turnRecords, {
        branchId,
        pendingBranchParentTurnId: this.pendingBranchParentTurnId,
        lastCommittedTurnId: this.lastCommittedTurnId
      })
    },

    // P0-1：当前分支可见消息 id 集合（含祖先链 turn 的消息 + 无 branchId 的共享历史）。
    currentBranchVisibleMessageIds() {
      const chain = this.collectBranchTurnChain(this.activeBranchId || 'main')
      return collectChainMessageIds(this.turnRecords, chain)
    },

    // P1-4：当前分支链上的 turn id 集合（记忆候选分支隔离用）。
    currentBranchTurnIds() {
      return this.collectBranchTurnChain(this.activeBranchId || 'main')
    },

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


    // P1-4：构建记忆候选分支过滤函数。
    // 候选 id 若出现在"非当前分支链"的 turn.memoryCandidateIds 里 → 排除（分支 A 的记忆不污染 B）。
    // 手动/共享候选（不在任何 turn 记录里）→ 保留。
    buildBranchMemoryFilter() {
      const chain = this.collectBranchTurnChain(this.activeBranchId || 'main')
      // 反向映射：候选 id → 所属 turn id
      const candidateToTurn = {}
      for (const turn of Object.values(this.turnRecords || {})) {
        for (const candidateId of turn.memoryCandidateIds || []) {
          if (!candidateToTurn[candidateId]) candidateToTurn[candidateId] = []
          candidateToTurn[candidateId].push(turn.id)
        }
      }
      return (memory) => {
        const turnIds = candidateToTurn[memory?.id]
        if (!turnIds || turnIds.length === 0) return true  // 共享/手动候选保留
        // 候选属于当前分支链上的 turn → 保留；否则排除
        return turnIds.some((turnId) => chain.has(turnId))
      }
    },

    async regenerateFrom(index) {
      debugLog('[regenerateFrom] START, messages count before slice:', this.messages.length, 'index:', index)
      // 未启用 AI 时“重新生成”没有可执行的后续动作；必须保持为严格 no-op，
      // 不能先回滚 runtime、创建临时分支或改写 superseded 标记。
      if (!this.useAI) return false

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
      // P0-3 修正：**不再清除任何 branchId** —— 可见性由 turn 链决定
      // （见 rebuildChatHistory / currentBranchVisibleMessageIds），
      // 避免嵌套分叉时把子分支独有历史误提升为全局共享。
      const oldBranchId = this.activeBranchId || 'main'
      const newBranchId = `branch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
      this.activeBranchId = newBranchId
      // P1-3：记录分叉父 turn —— 新分支尚无 committed turn 时，collectBranchTurnChain
      // 从它建链（而非依赖可能丢失的全局 lastCommittedTurnId）。
      this.pendingBranchParentTurnId = parentTurn?.id || null
      // 标记被重写部分为 superseded（保留标记，供切换按钮定位）
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

      // 3. 立即触发重新生成（useAI 已在入口守卫）
      {
        // 标记为重写后续，避免触发初始化逻辑
        this._isRegenerating = true
        // P0-3：新 turn 作为旧 turn 的 sibling（同父级），并传入源用户消息 id，
        // 让生成出的 turnRecord 正确关联到触发重生成的 user 消息。
        // P0-2：新 turn 是旧 turn 的 sibling —— parentTurnId 取旧 turn 的父 turn。
        // 首回合（parentTurn.parentTurnId 为 null）时新候选也是根 sibling（null），
        // 不能 fallback 到旧 turn.id（那会变成子回合）。
        const branchParentTurnId = parentTurn?.parentTurnId ?? null
        const sourceUserMessageId = targetMessage?.id || ''
        debugLog('[regenerateFrom] Starting, _isRegenerating:', this._isRegenerating)
        const outcome = await this.generateAIResponse({ parentTurnId: branchParentTurnId, userMessageId: sourceUserMessageId })
        // P0-1：生成失败/取消时恢复原分支 —— 复用 switchBranch 的完整恢复逻辑
        // （恢复该分支 postRuntimeSnapshot + 重算 superseded + 同步游标 + 重建 chatHistory），
        // 保证旧回复重新可见的同时，地点/时间/角色状态也回到旧分支的提交后状态。
        if (outcome !== 'success' && this.activeBranchId === newBranchId) {
          debugLog('[regenerateFrom] generation failed, restore branch:', oldBranchId)
          this.switchBranch(oldBranchId)
        }
        this._isRegenerating = false
        debugLog('[regenerateFrom] Done, _isRegenerating:', this._isRegenerating)
      }
      return true
    },

    // R1b：切换候选/分支。恢复该分支的 post snapshot + 重建 chatHistory。
    switchBranch(branchId) {
      if (!branchId || branchId === this.activeBranchId) return
      // 最新回合选择与 superseded 标记判定归 branch-turn 图模块（B11）
      const turn = latestCommittedBranchTurn(this.turnRecords, branchId)
      // P0-2：同步提交游标到目标分支最新 turn —— 否则切分支后继续生成，
      // 新 turn 会以其它分支的回合作父节点，重新造成跨分支污染。
      if (turn?.id) this.lastCommittedTurnId = turn.id
      if (turn?.postRuntimeSnapshot) {
        this.applyRuntimeSnapshot(turn.postRuntimeSnapshot)
      }
      markSupersededMessages(this.messages, branchId)
      this.activeBranchId = branchId
      this.rebuildChatHistory()
      // 最终一致态提交点（B-R2）
      this.commitCurrentSessionNow()
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
              const last = this.messages[this.messages.length - 1]
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
      // P0-1：可见性由 turn 链决定 —— 当前分支祖先链上的消息 + 无 branchId 的共享历史。
      // 不使用"清除 branchId"或简单分支过滤（嵌套分叉会污染）。
      const visibleIds = this.currentBranchVisibleMessageIds()
      const history = this.messages
        .filter((m) => m && !m.superseded && (!m.branchId || visibleIds.has(m.id)))
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
      for (const [stage, run] of stages) {
        try {
          run()
        } catch (error) {
          // 单级失败必须生产可观测（console.warn），不能用仅 dev 的 debugLog 静默
          console.warn(`[extractAndUpdateState] ${stage} 阶段解析失败（已跳过，不影响其他阶段）:`, error?.message)
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

    // Authoring runtime：惰性创建正文→观察器 bridge（模块级单例，非持久化）。
    ensureAuthoringObserverRuntime() {
      if (authoringObserverBridge) return authoringObserverBridge
      authoringObserverScheduler = createAuthoringObserverScheduler({
        // 每次重算先让同一稳定 writing unit 的旧派生失效。只处理 unit
        // 来源；chapter/turn 等宽来源不能因改一段正文而整批作废。
        invalidate: async (delta) => {
          const unitRefs = [...new Set((delta.sourceRefs || []).filter((ref) => (
            String(ref || '').startsWith('unit:')
          )))]
          for (const sourceRef of unitRefs) {
            invalidateMemoryBySource({
              sourceRef,
              currentRevision: delta.sourceDocumentRevision || delta.documentRevision || '',
              reason: 'prose-unit-revised'
            })
          }
        },
        // 真实派生：编辑空闲后对文档 delta 执行五个 observer derive workflow；
        // 常规结果写入 derived-state，typed exception 分离进入审阅队列。
        run: async (delta, execution) => {
          const runner = createAuthoringObserverRunner({
            // 候选项目归属优先用 delta 携带的 memoryProjectId（Authoring 书 ID），
            // 否则回退 active worldbook，保证写入口径与召回口径一致。
            memoryTarget: (delta) => ({
              projectId: String(delta?.memoryProjectId || '').trim() || authoringObserverHub.getActiveProjectId() || resolveActiveWorldbookId() || ''
            }),
            applyDerived: async (routine, meta) => {
              const provenance = meta?.provenance || {}
              for (const observation of routine) {
                const observationRefs = Array.isArray(observation.sourceRefs) ? observation.sourceRefs : []
                const sourceRefs = observationRefs.length && observationRefs[0] !== 'document-delta'
                  ? observationRefs
                  : (Array.isArray(provenance.sourceRefs) ? provenance.sourceRefs : [])
                const finalProvenance = normalizeAuthoringObserverProvenance({
                  ...provenance,
                  sourceRefs,
                  target: meta?.target || provenance.target
                }, meta?.target || provenance.target)
                authoringObserverHub.pushDerived({
                  ...observation,
                  schemaVersion: finalProvenance.schemaVersion,
                  derivedAt: finalProvenance.derivedAt,
                  documentId: finalProvenance.documentId,
                  target: finalProvenance.target,
                  provenance: finalProvenance,
                  baseRevision: String(meta?.baseRevision || ''),
                  projectId: finalProvenance.projectId,
                  chapterId: finalProvenance.chapterId,
                  unitId: finalProvenance.unitId,
                  unitRevision: finalProvenance.unitRevision,
                  documentRevision: finalProvenance.documentRevision,
                  sourceRefs,
                  status: observation.status === 'candidate' ? 'candidate' : 'applied'
                })
              }
              return { count: routine.length }
            },
            onException: null
          })
          return runner.run(delta, execution)
        },
        onSettled: (settled) => {
          authoringObserverHub.recordResult(settled)
          authoringObserverHub.dispatch(settled)
        }
      })
      authoringObserverBridge = createLegacyExperienceStateBridge({
        insertText: async ({ text, observerContext }) => {
          // 正文已由回合事务提交；此处只生成确定性 document receipt 供观察器对齐版本。
          const documentSequence = authoringObserverHub.nextDocumentSequence()
          return {
            revision: `${observerContext?.documentId || this.currentSessionId || 'session'}:doc-r${documentSequence}`,
            chars: String(text || '').length
          }
        },
        scheduleObservers: (delta) => {
          authoringObserverHub.recordEvent(delta)
          // Agent-off gate：关闭后不做自动派生调度。
          if (!authoringObserverHub.isAgentEnabled()) return { accepted: false, reason: 'agent-disabled' }
          authoringObserverHub.pushTriggerEvent({
            type: 'prose-commit',
            projectId: String(delta.memoryProjectId || '').trim() || authoringObserverHub.getActiveProjectId(),
            sessionId: this.currentSessionId || '',
            sourceRefs: delta.sourceRefs || [],
            revision: delta.documentRevision || '',
            emittedAt: Date.now()
          })
          return authoringObserverScheduler.scheduleObservers({
            ...delta,
            // 同章不同单元各自排队；同一单元的新 revision 则替换旧任务，
            // 让空闲观察只派生最终文本，而不是按键过程中每版都写候选。
            scheduleKey: delta.unitId
              ? `${delta.documentId || this.currentSessionId || 'session'}:unit:${delta.unitId}`
              : String(delta.documentId || this.currentSessionId || 'session')
          })
        }
      })
      return authoringObserverBridge
    },

    // 受控记忆触发边界：prose-commit 只在正文持久化成功后发射；undo 发射失效。
    ensureAuthoringMemoryTriggers() {
      if (authoringMemoryTriggers) return authoringMemoryTriggers
      authoringMemoryTriggers = createMemoryTriggers({
        // derive 真正生成候选：经 observer scheduler → runner(memoryTarget) 队列化。
        derive: async (payload) => {
          authoringObserverHub.pushTriggerEvent({ ...payload, emittedAt: Date.now() })
          if (!authoringObserverScheduler || !payload.text) {
            return { accepted: false, reason: !payload.text ? 'empty-text' : 'observer-unavailable' }
          }
          // boundary 使用独立调度键：避免与紧随其后的 prose-commit 因同 key 合并而互相取消。
          const documentId = payload.type === 'boundary'
            ? `${payload.sessionId || 'authoring'}:boundary:${payload.scopeKey || 'unknown'}`
            : (payload.sessionId || 'authoring')
          return authoringObserverScheduler.scheduleObservers({
            documentId,
            scheduleKey: documentId,
            documentRevision: payload.revision,
            text: payload.text,
            changedText: payload.changedText,
            changedRanges: payload.changedRanges,
            sourceRefs: payload.sourceRefs,
            memoryProjectId: payload.projectId,
            chapterId: payload.chapterId,
            unitId: payload.unitId,
            unitRevision: payload.unitRevision,
            sourceDocumentRevision: payload.sourceDocumentRevision
          })
        },
        invalidate: async (payload) => {
          for (const sourceRef of payload.sourceRefs || []) {
            invalidateMemoryBySource({ sourceRef, currentRevision: payload.revision, reason: payload.reason })
          }
          authoringObserverHub.pushTriggerEvent({ ...payload, type: 'invalidation', emittedAt: Date.now() })
        },
        isAgentEnabled: () => authoringObserverHub.isAgentEnabled()
      })
      return authoringMemoryTriggers
    },

    setAuthoringProjectId(projectId) {
      const next = String(projectId || '').trim()
      if (authoringObserverHub.getActiveProjectId() === next) return
      authoringObserverHub.setActiveProjectId(next)
      // B13：换书即换作用域——取消旧项目作用域的待执行派生并清空观察器
      // 缓冲/来源镜像，与页面 dismissAuxiliary 的失效合同一致；订阅保留
      //（页面仍挂载）。bridge 未创建时无可取消任务。
      authoringObserverScheduler?.cancelAll()
      authoringObserverHub.clearBuffers()
    },

    setAuthoringMemoryAgentEnabled(value) {
      authoringObserverHub.setAgentEnabled(value !== false)
    },

    resolveAuthoringMemoryProjectId() {
      return authoringObserverHub.getActiveProjectId() || resolveActiveWorldbookId() || ''
    },

    // 显式“记住”：provider 不可用也创建本地 pending 候选。
    async rememberAuthoringSelection({ content = '', sourceRefs = [], sourceRevision = '', confirm = false, projectId = '' } = {}) {
      const trimmed = String(content || '').trim()
      if (!trimmed) return { success: false, skipped: true, reason: 'empty-content' }
      const triggers = this.ensureAuthoringMemoryTriggers()
      const result = await triggers.rememberExplicitly({
        content: trimmed,
        projectId: String(projectId || '').trim() || this.resolveAuthoringMemoryProjectId(),
        sessionId: this.currentSessionId || '',
        sourceRefs: Array.isArray(sourceRefs) && sourceRefs.length ? sourceRefs : [`user-action:remember:${Date.now()}`],
        sourceRevision,
        confirm
      })
      return result
    },

    // Authoring 页面正文事务提交：调度一次有界观察派生（真正产出记忆候选）并记录 prose-commit 事件。
    noteAuthoringTextCommit({ text = '', changedText = undefined, changedRanges = undefined, sourceRefs = [], revision = '', memoryProjectId = '', sessionId = '' } = {}) {
      const contentText = String(text || '')
      if (!contentText.trim()) return { accepted: false, reason: 'empty-text' }
      // Agent-off gate：关闭后不做自动记忆派生（显式“记住”仍可本地建候选）。
      if (!authoringObserverHub.isAgentEnabled()) {
        return { accepted: false, reason: 'agent-disabled' }
      }
      const contentTextTrimmed = contentText
      // 仅显式传入项目时同步；空值不得触发换书取消/清缓冲语义（B13）
      if (String(memoryProjectId || '').trim()) this.setAuthoringProjectId(memoryProjectId)
      this.ensureAuthoringObserverRuntime()
      const memoryProjectIdResolved = String(memoryProjectId || '').trim() || this.resolveAuthoringMemoryProjectId()
      const result = authoringObserverScheduler.scheduleObservers({
        documentId: sessionId || this.currentSessionId || 'authoring',
        documentRevision: revision,
        text: contentTextTrimmed,
        changedText,
        changedRanges,
        sourceRefs,
        memoryProjectId: memoryProjectIdResolved
      })
      authoringObserverHub.pushTriggerEvent({
        type: 'prose-commit',
        projectId: memoryProjectIdResolved,
        sessionId: sessionId || this.currentSessionId || '',
        sourceRefs,
        revision,
        emittedAt: Date.now()
      })
      return result
    },

    // 章节/会话边界：对上一范围做一次去重后的有界派生，不重扫整个项目。
    async noteAuthoringBoundary({ scopeKey = '', text = '', changedText = undefined, changedRanges = undefined, sourceRefs = [], revision = '', memoryProjectId = '', sessionId = '', chapterId = '', unitId = '', unitRevision = 0, sourceDocumentRevision = '' } = {}) {
      this.ensureAuthoringObserverRuntime()
      const triggers = this.ensureAuthoringMemoryTriggers()
      return triggers.handle({
        type: 'boundary',
        projectId: String(memoryProjectId || '').trim() || this.resolveAuthoringMemoryProjectId(),
        sessionId: sessionId || this.currentSessionId || '',
        scopeKey,
        text,
        changedText,
        changedRanges,
        sourceRefs,
        revision,
        chapterId,
        unitId,
        unitRevision,
        sourceDocumentRevision
      })
    },

    getAuthoringMemoryTriggerEvents() {
      return authoringObserverHub.getTriggerEvents()
    },

    // 每次可见正文提交后调用一次：先落正文 receipt，再调度派生观察器（顺序由 bridge 保证）。
    async commitAuthoringProseResult({ text, sourceRefs = [], memoryProjectId = '', documentId = '', chapterId = '', unitId = '', unitRevision = 0, sourceDocumentRevision = '' } = {}) {
      const contentText = String(text || '')
      if (!contentText.trim()) return null
      try {
        if (String(memoryProjectId || '').trim()) this.setAuthoringProjectId(memoryProjectId)
        const bridge = this.ensureAuthoringObserverRuntime()
        const observerDocumentId = String(documentId || chapterId || this.currentSessionId || 'authoring')
        const receipt = await bridge.commitNarrativeResult({
          text: contentText,
          baseRevision: authoringObserverHub.getLastDocumentRevision(observerDocumentId),
          sourceRefs,
          // 派生候选的项目归属与召回口径保持一致。
          memoryProjectId: String(memoryProjectId || '').trim() || authoringObserverHub.getActiveProjectId(),
          observerContext: {
            documentId: observerDocumentId,
            chapterId: String(chapterId || ''),
            unitId: String(unitId || ''),
            unitRevision: Number(unitRevision || 0),
            sourceDocumentRevision: String(sourceDocumentRevision || '')
          }
        })
        authoringObserverHub.setLastDocumentRevision(observerDocumentId, receipt.revision)
        return receipt
      } catch {
        // 观察器调度失败绝不影响已提交的可见正文。
        return null
      }
    },

    async handleAuthoringProseUndo({ sourceRefs = [], revision = '', reason = 'prose-undo' } = {}) {
      await this.ensureAuthoringMemoryTriggers().invalidate({
        sourceRefs,
        revision,
        reason
      })
    },

    getAuthoringObserverEvents() {
      return authoringObserverHub.getEvents()
    },

    getAuthoringObserverExceptions() {
      return authoringObserverHub.getExceptions()
    },

    getAuthoringDerivedState() {
      return authoringObserverHub.getDerived()
    },

    subscribeAuthoringObserverResults(listener) {
      return authoringObserverHub.subscribe(listener)
    },

    resetAuthoringObserverRuntime() {
      // 取消全部待执行派生（含 boundary 独立键），避免切换/重置会话后旧任务继续执行。
      authoringObserverScheduler?.cancelAll()
      authoringObserverHub.clearBuffers()
    },

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
