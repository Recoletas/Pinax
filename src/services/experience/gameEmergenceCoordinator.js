import { useWorldStore } from '../../stores/worldStore.js'
import { buildPlayerHistoryContext } from './playerHistory.js'
import { buildGeoHistoryRuntimeContext } from '../worldHistory/runtimeContext.js'
import { buildEmergenceCandidates } from '../worldHistory/emergenceScheduler.js'
import { generateEmergenceEventDraft } from './generationEmergence.js'
import { buildStateDeltaExplanation, buildStateDeltaPreview, rollbackStateDelta } from './runtimeEvents.js'
import { buildRuntimeCausalityContext, describeRuntimeStateTransitions } from './runtimeEventCausality.js'
import { cloneState, normalizeCanonicalFacts, normalizeCharacterRelations, normalizeCharacterStates, normalizeEmergenceCandidates, normalizeEmergenceDismissedIds, normalizeEmergenceDraft, normalizeEncounteredCharacters, normalizeFactionRelations, normalizeGoals, normalizeKeyChoices, normalizePlaceStates, normalizePlotJournal, normalizeTextValue, normalizeWorldMapState, normalizeWritingTime } from './gameSessionNormalization.js'

// Complete emergence lifecycle. Pinia binds these methods to the active store.
export const gameEmergenceActions = {
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
}

