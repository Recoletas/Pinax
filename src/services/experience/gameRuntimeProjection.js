// Experience 回合快照投影（B3）：runtime snapshot 的构建与恢复投影。
// 纯函数——输入输出都是普通数据；字段缺失回退由调用方以 fallbacks 显式传入，
// 模块不读取 store。恢复补丁经 store 的 Object.assign 落到 Pinia 唯一状态上，
// 本模块不持有任何可变状态。revision/来源规则沿用各字段原 normalize 合同，
// 不把过期历史标记为 fresh。

import { normalizeNarrativeSceneSummary } from '../agents/narrativeSceneSummary.js'
import { normalizeNarrativeSceneThread } from '../../../shared/narrativeSceneThreadContract.js'
import { capRuntimeEvents, RUNTIME_EVENT_LIMIT } from './runtimeEvents.js'
import {
  cloneState,
  normalizeAdventureState,
  normalizeCanonicalFacts,
  normalizeCharacterRelations,
  normalizeCharacterStates,
  normalizePlaceStates,
  normalizeRuntimeSnapshot,
  normalizeWorldMapState,
  normalizeWritingCharacter,
  normalizeWritingTime,
  DEFAULT_ADVENTURE_STATE,
  DEFAULT_WORLD_MAP_STATE,
  DEFAULT_WRITING_CHARACTER,
  DEFAULT_WRITING_TIME
} from './gameSessionNormalization.js'

const DEFAULT_PLAYER_STATE = Object.freeze({
  vitality: 100,
  maxVitality: 100,
  mood: 80,
  maxMood: 100,
  money: 100,
  level: 1,
  exp: 0
})

// 回合/会话快照构建：读取 state 的只读字段，克隆后按 RUNTIME_SNAPSHOT_KEYS
// 收敛（forSession 时附加 playerCharacter/aiCharacter，供 loadSession 使用）。
export function buildRuntimeSnapshot(state, { forSession = true } = {}) {
  const snapshot = {
    messages: cloneState(state.messages, []),
    chatHistory: cloneState(state.chatHistory, []),
    time: cloneState(state.time, { day: 1, period: '早晨' }),
    player: cloneState(state.player, DEFAULT_PLAYER_STATE),
    inventory: cloneState(state.inventory, []),
    quests: cloneState(state.quests, []),
    flags: cloneState(state.flags, {}),
    activities: cloneState(state.activities, []),
    goals: cloneState(state.goals, DEFAULT_ADVENTURE_STATE.goals),
    encounteredCharacters: cloneState(state.encounteredCharacters, DEFAULT_ADVENTURE_STATE.encounteredCharacters),
    factionRelations: cloneState(state.factionRelations, DEFAULT_ADVENTURE_STATE.factionRelations),
    keyChoices: cloneState(state.keyChoices, DEFAULT_ADVENTURE_STATE.keyChoices),
    plotJournal: cloneState(state.plotJournal, DEFAULT_ADVENTURE_STATE.plotJournal),
    adventureTriggers: cloneState(state.adventureTriggers, DEFAULT_ADVENTURE_STATE.adventureTriggers),
    adventureTriggerHistory: cloneState(state.adventureTriggerHistory, []),
    adventureTriggerCooldownUntil: state.adventureTriggerCooldownUntil,
    emergenceCandidates: cloneState(state.emergenceCandidates, []),
    emergenceDismissedIds: cloneState(state.emergenceDismissedIds, []),
    emergenceDraft: cloneState(state.emergenceDraft, null),
    npcRelations: cloneState(state.npcRelations, {}),
    discoveredPlaces: cloneState(state.discoveredPlaces, []),
    completedQuests: cloneState(state.completedQuests, []),
    writingCharacter: cloneState(state.writingCharacter, DEFAULT_WRITING_CHARACTER),
    writingTime: cloneState(state.writingTime, DEFAULT_WRITING_TIME),
    placeStates: cloneState(state.placeStates, {}),
    characterStates: cloneState(state.characterStates, {}),
    characterRelations: cloneState(state.characterRelations, {}),
    canonicalFacts: cloneState(state.canonicalFacts, {}),
    worldMapState: cloneState(state.worldMapState, DEFAULT_WORLD_MAP_STATE),
    historyNode: cloneState(state.historyNode, null),
    narrativeSceneSummary: cloneState(state.narrativeSceneSummary, null),
    sceneThread: cloneState(state.sceneThread, null),
    activeMechanism: state.activeMechanism,
    mechanismContext: cloneState(state.mechanismContext, null),
    milestoneEvent: cloneState(state.milestoneEvent, null),
    playerCharacter: cloneState(state.playerCharacter, { name: 'User', avatar: '' }),
    aiCharacter: cloneState(state.aiCharacter, { name: 'Assistant', avatar: '' }),
    dialogueMode: state.dialogueMode,
    dialogueCharacter: cloneState(state.dialogueCharacter, null),
    runtimeEvents: capRuntimeEvents(
      Array.isArray(state.runtimeEvents) ? state.runtimeEvents : [],
      RUNTIME_EVENT_LIMIT
    )
  }
  // P1：只保留 applyRuntimeSnapshot / loadSession 实际读取的字段，剥离 messages/chatHistory/time 等。
  return normalizeRuntimeSnapshot(snapshot, { forSession })
}

// 恢复投影：把 preRuntimeSnapshot 归一化为可直接 assign 的字段补丁。
// fallbacks：字段缺失时的当前状态回退（player/inventory/quests/flags/
// npcRelations/discoveredPlaces/completedQuests，与迁出前逐字段一致）。
export function projectRuntimeSnapshot(snapshot, fallbacks = {}) {
  const s = snapshot
  const adventureState = normalizeAdventureState(s)
  return {
    placeStates: normalizePlaceStates(s.placeStates),
    characterStates: normalizeCharacterStates(s.characterStates),
    characterRelations: normalizeCharacterRelations(s.characterRelations),
    canonicalFacts: normalizeCanonicalFacts(s.canonicalFacts),
    worldMapState: normalizeWorldMapState(s.worldMapState || DEFAULT_WORLD_MAP_STATE),
    historyNode: cloneState(s.historyNode || null, null),
    narrativeSceneSummary: normalizeNarrativeSceneSummary(s.narrativeSceneSummary),
    sceneThread: normalizeNarrativeSceneThread(s.sceneThread || null),
    activities: cloneState(s.activities || [], []),
    goals: adventureState.goals,
    encounteredCharacters: adventureState.encounteredCharacters,
    factionRelations: adventureState.factionRelations,
    keyChoices: adventureState.keyChoices,
    plotJournal: adventureState.plotJournal,
    adventureTriggers: cloneState(adventureState.adventureTriggers, DEFAULT_ADVENTURE_STATE.adventureTriggers),
    adventureTriggerHistory: cloneState(adventureState.adventureTriggerHistory, []),
    adventureTriggerCooldownUntil: adventureState.adventureTriggerCooldownUntil || 0,
    emergenceCandidates: cloneState(adventureState.emergenceCandidates, []),
    emergenceDismissedIds: cloneState(adventureState.emergenceDismissedIds, []),
    emergenceDraft: cloneState(adventureState.emergenceDraft, null),
    adventureTriggerPendingType: null,
    player: cloneState(s.player || fallbacks.player, DEFAULT_PLAYER_STATE),
    inventory: cloneState(s.inventory || fallbacks.inventory, []),
    quests: cloneState(s.quests || fallbacks.quests, []),
    flags: cloneState(s.flags || fallbacks.flags, {}),
    npcRelations: cloneState(s.npcRelations || fallbacks.npcRelations, {}),
    discoveredPlaces: cloneState(s.discoveredPlaces || fallbacks.discoveredPlaces, []),
    completedQuests: cloneState(s.completedQuests || fallbacks.completedQuests, []),
    activeMechanism: s.activeMechanism ?? null,
    mechanismContext: cloneState(s.mechanismContext || null, null),
    milestoneEvent: cloneState(s.milestoneEvent || null, null),
    dialogueMode: !!s.dialogueMode,
    dialogueCharacter: cloneState(s.dialogueCharacter || null, null),
    writingCharacter: normalizeWritingCharacter(s.writingCharacter || DEFAULT_WRITING_CHARACTER),
    writingTime: normalizeWritingTime(s.writingTime || DEFAULT_WRITING_TIME),
    runtimeEvents: capRuntimeEvents(
      Array.isArray(s.runtimeEvents) ? s.runtimeEvents : [],
      RUNTIME_EVENT_LIMIT
    )
  }
}
