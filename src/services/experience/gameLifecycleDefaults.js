// Experience 生命周期默认值（B14）：runtime-only reset 的字段补丁唯一 owner。
// 范围合同（与迁出前一致）：
// - runtime reset：清回合内容/派生缓存/生成状态，保留 sessions、currentSessionId、
//   apiSettings、narrativeExpansion、useAI 与全局写作素材存储；
// - resetGameState = runtime reset（不动会话列表）；
// - resetGlobalWritingAssets：只写全局写作素材四个存储键，不属于本补丁。
// 输入无、输出一个显式字段补丁；调用方 cancel 生成后 Object.assign 落到 Pinia。

import { createEmptySessionRuntime } from './gameSessionNormalization.js'

export function buildRuntimeResetPatch() {
  const runtime = createEmptySessionRuntime()
  return {
    // 会话/世界标识归零（runtime 语义：无活动游戏）
    gameId: null,
    messages: runtime.messages,
    chatHistory: runtime.chatHistory,
    time: runtime.time,
    player: runtime.player,
    inventory: runtime.inventory,
    quests: runtime.quests,
    flags: runtime.flags,
    activities: runtime.activities,
    goals: runtime.goals,
    encounteredCharacters: runtime.encounteredCharacters,
    factionRelations: runtime.factionRelations,
    keyChoices: runtime.keyChoices,
    plotJournal: runtime.plotJournal,
    adventureTriggers: runtime.adventureTriggers,
    adventureTriggerHistory: runtime.adventureTriggerHistory,
    adventureTriggerCooldownUntil: runtime.adventureTriggerCooldownUntil,
    emergenceCandidates: runtime.emergenceCandidates,
    emergenceDismissedIds: runtime.emergenceDismissedIds,
    emergenceDraft: runtime.emergenceDraft,
    adventureTriggerPendingType: null,
    npcRelations: runtime.npcRelations,
    discoveredPlaces: runtime.discoveredPlaces,
    completedQuests: runtime.completedQuests,
    writingCharacter: runtime.writingCharacter,
    writingTime: runtime.writingTime,
    placeStates: runtime.placeStates,
    characterStates: runtime.characterStates,
    characterRelations: runtime.characterRelations,
    canonicalFacts: runtime.canonicalFacts,
    worldMapState: runtime.worldMapState,
    historyNode: runtime.historyNode,
    isPlaying: false,
    activeMechanism: runtime.activeMechanism,
    mechanismContext: runtime.mechanismContext,
    milestoneEvent: runtime.milestoneEvent,
    playerCharacter: runtime.playerCharacter,
    aiCharacter: runtime.aiCharacter,
    dialogueMode: runtime.dialogueMode,
    dialogueCharacter: runtime.dialogueCharacter,
    inlineEvents: [],
    lastWorldbookContext: null,
    lastMemoryContext: '',
    lastContextLedger: null,
    lastMemoryRecall: null,
    lastNarrativeKernel: null,
    lastNarrativeContextAudit: null,
    lastNarrativeAgentTrace: null,
    narrativeAgentStatus: null,
    narrativeSceneSummary: null,
    sceneThread: null,
    isLoading: false,
    lastError: null,
    quickNoteImportMode: false,
    quickNoteSelectedMessageIndexes: [],
    runtimeEvents: Array.isArray(runtime.runtimeEvents) ? runtime.runtimeEvents : []
    // 显式不在补丁内（保留）：sessions、currentSessionId、apiSettings、
    // narrativeExpansion、useAI、pendingTurnRecord、turnRecords、
    // activeBranchId、lastCommittedTurnId、lastTurnReceipt、worldId
  }
}
