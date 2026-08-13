import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../stores/gameStore'
import { useWorldStore } from '../stores/worldStore'
import { getItem, STORAGE_KEYS } from '../composables/useStorage'
import { createMemoryCandidate } from '../services/memoryCandidates'
import { listNarrativeAssets } from '../services/narrativeAssets'
import { consumePlayableWorldHistoryIntent } from '../services/playableWorldEntry'
import {
  runGenerationTask,
  runGenerationStreamTask,
  runNarrativeAgentTurn
} from '../services/generationService'
import { seedWorldbookPresets } from '../services/seedWorldbookPresets'
import { listStoryboardDocuments } from '../services/storyboardStore'

vi.mock('../services/api', () => ({
  default: {
    post: vi.fn(() => Promise.resolve({ data: {} }))
  },
  sendAction: vi.fn(),
  getState: vi.fn(),
  recordMemory: vi.fn(),
  getOrCreatePreferenceUserId: vi.fn(() => 'user-test')
}))

vi.mock('../services/generationService', () => ({
  runGenerationTask: vi.fn(),
  runGenerationStreamTask: vi.fn(),
  runNarrativeAgentTurn: vi.fn()
}))

describe('gameStore sessions', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.mocked(runGenerationTask).mockReset()
    vi.mocked(runGenerationStreamTask).mockReset()
    vi.mocked(runNarrativeAgentTurn).mockReset()
    vi.mocked(runNarrativeAgentTurn).mockResolvedValue({
      kind: 'final_ready',
      text: '暮湾钟楼仍然沉默。',
      calls: [],
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    })
    vi.mocked(runGenerationStreamTask).mockImplementation(async ({ callbacks }) => {
      callbacks?.onChunk?.({ content: ':::narration\n暮湾钟楼仍然沉默。' })
      callbacks?.onComplete?.({ content: ':::narration\n暮湾钟楼仍然沉默。' })
      return { content: ':::narration\n暮湾钟楼仍然沉默。' }
    })
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a session with the active worldbook and empty runtime snapshot', () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = { id: 'wb_alpha', name: 'Alpha' }

    const gameStore = useGameStore()
    const session = gameStore.createSession({ title: '第一章' })

    expect(session.worldbookId).toBe('wb_alpha')
    expect(session.worldId).toBe('wb_alpha')
    expect(session.runtimeState.messages).toEqual([])
    expect(session.runtimeState.writingCharacter.name).toBe('User')
    expect(gameStore.currentSessionId).toBe(session.id)

    const explicitlyScoped = gameStore.createSession({ title: '第二章', worldbookId: 'wb_beta' })
    expect(explicitlyScoped.worldbookId).toBe('wb_beta')
    expect(explicitlyScoped.worldId).toBe('wb_beta')
  })

  it('keeps the current place on extracted activity records', () => {
    const gameStore = useGameStore()
    gameStore.worldMapState = { placeId: 'place:current', currentScene: '旧税所' }

    gameStore.addActivity({ title: '发现旧税册', type: 'event', date: '2026-07-15' })

    expect(gameStore.activities[0].placeId).toBe('place:current')
  })

  it('persists runtime edits into the active session and restores them on load', () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = { id: 'wb_alpha', name: 'Alpha' }

    const gameStore = useGameStore()
    const session = gameStore.createSession({ title: '第一章' })

    gameStore.messages = [{ role: 'assistant', content: '开场白', timestamp: 1 }]
    gameStore.chatHistory = [
      { role: 'system', content: '系统提示' },
      { role: 'assistant', content: '开场白' },
      { role: 'user', content: '我进入青石城寻找钟楼。' },
      { role: 'assistant', content: '阿离抵达城门，发现守卫正在核对通行令。' },
      { role: 'user', content: '我出示旧令牌。' },
      { role: 'assistant', content: '守卫允许她进入，但钟楼方向仍有警报声。' },
      { role: 'user', content: '我继续前往钟楼。' }
    ]
    gameStore.writingCharacter = {
      name: '阿离',
      gender: '女',
      age: '23岁',
      traits: ['冷静'],
      mood: 66,
      description: '测试角色',
      goal: '找到出口'
    }
    gameStore.writingTime = {
      eraId: 'custom',
      eraName: '永夜历',
      year: '12',
      month: '3',
      day: '8'
    }
    gameStore.worldMapState = {
      map: { countries: [{ id: 'c1', name: '东境', cities: [] }] },
      currentCountry: '东境',
      currentCity: '青石城',
      currentScene: '城门'
    }
    gameStore.activities = [{ id: 'act_1', title: '抵达城门', type: 'event' }]
    gameStore.goals = [{ id: 'goal_1', title: '拿到钟楼证据', status: 'active', source: 'test' }]
    gameStore.encounteredCharacters = [{ id: 'char_1', name: '林舟', source: 'test' }]
    gameStore.factionRelations = { 潮盐行会: -8 }
    gameStore.keyChoices = [{ id: 'choice_1', label: '答应先查钟楼', source: 'test' }]
    gameStore.plotJournal = [{ id: 'journal_1', chapterId: 'chapter-1', summary: '主角抵达城门并接下调查任务。' }]
    gameStore.dialogueMode = true
    gameStore.dialogueCharacter = { id: 'npc_1', name: '路人甲' }
    gameStore.playerCharacter = { name: '阿离', avatar: 'avatar.png' }
    gameStore.aiCharacter = { name: '叙述者', avatar: 'ai.png' }
    const sceneSummary = gameStore.refreshNarrativeSceneSummary().summary
    expect(sceneSummary?.sourceMessageCount).toBe(2)

    gameStore.saveCurrentSession()

    expect(gameStore.sessions[0].worldbookId).toBe('wb_alpha')
    expect(gameStore.sessions[0].runtimeState.writingCharacter.name).toBe('阿离')
    expect(gameStore.sessions[0].runtimeState.worldMapState.currentScene).toBe('城门')

    gameStore.resetRuntimeState()
    gameStore.loadSession(session.id)

    expect(gameStore.worldId).toBe('wb_alpha')
    expect(gameStore.messages).toHaveLength(1)
    expect(gameStore.messages[0].content).toBe('开场白')
    expect(gameStore.writingCharacter.name).toBe('阿离')
    expect(gameStore.writingTime.eraName).toBe('永夜历')
    expect(gameStore.worldMapState.currentScene).toBe('城门')
    expect(gameStore.activities).toHaveLength(1)
    expect(gameStore.goals[0].title).toBe('拿到钟楼证据')
    expect(gameStore.encounteredCharacters[0].name).toBe('林舟')
    expect(gameStore.factionRelations['潮盐行会']).toBe(-8)
    expect(gameStore.keyChoices[0].label).toBe('答应先查钟楼')
    expect(gameStore.plotJournal[0].summary).toContain('城门')
    expect(gameStore.dialogueMode).toBe(true)
    expect(gameStore.dialogueCharacter?.name).toBe('路人甲')
    expect(gameStore.playerCharacter.avatar).toBe('avatar.png')
    expect(gameStore.aiCharacter.name).toBe('叙述者')
    expect(gameStore.narrativeSceneSummary?.revision).toBe(sceneSummary.revision)
  })

  it('builds a compact plot journal entry after enough assistant turns and avoids duplicates', () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = { id: 'wb_alpha', name: 'Alpha', entries: [] }

    const gameStore = useGameStore()
    gameStore.createSession({ title: '钟楼调查', worldbookId: 'wb_alpha' })
    gameStore.worldMapState = {
      map: { countries: [{ id: 'c1', name: '东境', cities: [] }] },
      currentCountry: '东境',
      currentCity: '青石城',
      currentScene: '钟楼'
    }
    gameStore.goals = [{ id: 'goal_1', title: '拿到钟楼证据', status: 'active' }]
    gameStore.encounteredCharacters = [{ id: 'char_1', name: '林舟' }]
    gameStore.keyChoices = [{ id: 'choice_1', label: '答应先查钟楼' }]
    gameStore.chatHistory = [{ role: 'system', content: '你是叙述者。' }]

    for (let index = 1; index <= 8; index += 1) {
      gameStore.chatHistory.push({ role: 'user', content: `我在钟楼继续第 ${index} 轮调查。` })
      gameStore.chatHistory.push({
        role: 'assistant',
        content: `林舟在钟楼第 ${index} 轮提供线索，你仍然需要拿到钟楼证据。`
      })
    }

    const journalEntry = gameStore.maybeAppendPlotJournalEntry()

    expect(journalEntry).not.toBeNull()
    expect(journalEntry.summary).toContain('剧情：')
    expect(journalEntry.summary).toContain('钟楼')
    expect(journalEntry.summary).toContain('行动：')
    expect(journalEntry.participants).toContain('林舟')
    expect(journalEntry.locations).toEqual(['东境', '青石城', '钟楼'])
    expect(journalEntry.unresolvedHooks).toContain('拿到钟楼证据')
    expect(journalEntry.sourceStartIndex).toBe(0)
    expect(journalEntry.sourceEndIndex).toBe(16)
    expect(gameStore.plotJournal).toHaveLength(1)
    expect(gameStore.sessions[0].runtimeState.plotJournal).toHaveLength(1)
    expect(gameStore.maybeAppendPlotJournalEntry()).toBeNull()

    for (let index = 9; index <= 16; index += 1) {
      gameStore.chatHistory.push({ role: 'user', content: `我在钟楼继续第 ${index} 轮调查。` })
      gameStore.chatHistory.push({
        role: 'assistant',
        content: `林舟在钟楼第 ${index} 轮指出新的证据，你仍然需要完成调查。`
      })
    }

    const nextEntry = gameStore.maybeAppendPlotJournalEntry()
    expect(nextEntry).not.toBeNull()
    expect(nextEntry.chapterId).toBe('chapter-2')
    expect(nextEntry.sourceStartIndex).toBe(16)
    expect(nextEntry.sourceEndIndex).toBe(32)
    expect(gameStore.plotJournal).toHaveLength(2)
  })

  it('writes a generated plot journal window back to world history once', async () => {
    const worldStore = useWorldStore()
    const worldbook = await worldStore.createWorldbook({ name: '灰墙历史测试' })

    const gameStore = useGameStore()
    gameStore.createSession({ title: '灰墙调查', worldbookId: worldbook.id })
    gameStore.worldMapState = {
      map: { countries: [] },
      currentCountry: '东境',
      currentCity: '灰墙',
      currentScene: '旧税所',
      placeId: 'place:wb-map:site-tax-office'
    }
    gameStore.historyNode = {
      id: 'history-gray-wall',
      placeRef: {
        placeId: 'place:wb-map:site-tax-office',
        worldbookId: worldbook.id,
        mapId: 'map-1',
        siteId: 'site-tax-office'
      }
    }
    gameStore.chatHistory = [{ role: 'system', content: '你是叙述者。' }]

    for (let index = 1; index <= 8; index += 1) {
      gameStore.chatHistory.push({ role: 'user', content: `我在旧税所核对第 ${index} 页账册。` })
      gameStore.chatHistory.push({
        role: 'assistant',
        content: `林舟在灰墙旧税所确认第 ${index} 页账册，线索仍指向失踪的税册。`
      })
    }

    const journalEntry = gameStore.maybeAppendPlotJournalEntry()
    expect(journalEntry).not.toBeNull()

    await vi.waitFor(() => {
      expect(worldStore.activeWorldbook?.geoHistory?.playerNodes).toHaveLength(1)
    })

    const playerNode = worldStore.activeWorldbook.geoHistory.playerNodes[0]
    expect(playerNode.kind).toBe('player-history-v1')
    expect(playerNode.placeId).toBe('place:wb-map:site-tax-office')
    expect(playerNode.sourceNodeId).toBe('history-gray-wall')
    expect(playerNode.worldStateSnapshot.place.city).toBe('灰墙')
    expect(gameStore.runtimeEvents.some((event) => event.payload?.kind === 'player-history-writeback')).toBe(true)

    await gameStore.persistLatestPlayerHistoryNode()
    expect(worldStore.activeWorldbook.geoHistory.playerNodes).toHaveLength(1)
  })

  it('collects place-bound emergence candidates after state extraction and persists dismissal', () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = {
      id: 'wb_emergence',
      name: '地点候选测试',
      entries: [],
      geoHistory: {
        version: 1,
        placeRefs: [{ placeId: 'place:gray-wall:tax-office', name: '旧税所', siteId: 'site-tax-office' }],
        nodes: [{
          id: 'history-gray-wall',
          placeRef: { placeId: 'place:gray-wall:tax-office', siteId: 'site-tax-office' },
          unresolvedHooks: ['失踪税册仍被藏在旧税所'],
          entryIds: ['entry-tax-ledger']
        }],
        playerNodes: []
      }
    }

    const gameStore = useGameStore()
    gameStore.createSession({ title: '地点候选', worldbookId: 'wb_emergence' })
    gameStore.worldMapState = {
      ...gameStore.worldMapState,
      placeId: 'place:gray-wall:tax-office',
      currentCountry: '东境',
      currentCity: '灰墙',
      currentScene: '旧税所'
    }
    gameStore.encounteredCharacters = [{ id: 'char-lin', name: '林舟' }]
    gameStore.placeStates = {
      'place:gray-wall:tax-office': {
        status: '封锁',
        controllerId: 'faction:archive',
        danger: 82
      }
    }
    gameStore.characterStates = {
      'char-lin': {
        status: '追查中',
        alive: true,
        placeId: 'place:gray-wall:tax-office',
        goal: '找到失踪税册',
        knowledgeRefs: ['fact:ledger-seal']
      }
    }
    gameStore.characterRelations = {
      'relation:lin-keeper': {
        subjectId: 'char-lin',
        objectId: 'char-keeper',
        kind: 'guardian',
        status: 'confirmed',
        sourceRefs: ['history:gray-wall']
      }
    }
    gameStore.canonicalFacts = {
      'fact:lin-ledger-duty': {
        subjectId: 'char-lin',
        predicate: 'ledger-duty',
        value: 'recover',
        status: 'confirmed',
        sourceRefs: ['history:gray-wall']
      }
    }
    gameStore.runtimeEvents = [{
      id: 'evt-place-confirmed',
      type: 'state_delta',
      ts: 1,
      payload: {
        kind: 'place-state-confirmed',
        placeId: 'place:gray-wall:tax-office',
        after: { placeStates: gameStore.placeStates }
      }
    }, {
      id: 'evt-stale-time',
      parentId: 'evt-place-confirmed',
      type: 'state_delta',
      ts: 2,
      payload: {
        kind: 'stale-time',
        placeId: 'place:gray-wall:tax-office',
        after: { writingTime: { eraId: 'ledger-era', year: 1 } }
      }
    }, {
      id: 'evt-time-rollback',
      parentId: 'evt-stale-time',
      type: 'state_delta',
      ts: 3,
      payload: {
        kind: 'time-rollback',
        rollbackOf: 'evt-stale-time',
        placeId: 'place:gray-wall:tax-office',
        before: { writingTime: { eraId: 'ledger-era', year: 1 } },
        after: { writingTime: { eraId: 'ledger-era', year: 2 } }
      }
    }]
    const candidates = gameStore.refreshEmergenceCandidates({ now: 1710000000000 })

    expect(candidates).toHaveLength(2)
    const characterCandidate = candidates.find((candidate) => candidate.hook === '找到失踪税册')
    expect(characterCandidate).toMatchObject({
      type: 'goal-pressure',
      title: '角色目标的后续压力',
      placeId: 'place:gray-wall:tax-office',
      causalState: {
        place: {
          controllerId: 'faction:archive',
          danger: 82
        },
          character: {
            characterId: 'char-lin',
            name: '林舟',
            goal: '找到失踪税册',
            knowledgeRefs: ['fact:ledger-seal'],
            relationRefs: ['relation:lin-keeper'],
            factRefs: ['fact:lin-ledger-duty']
        },
        activeEventIds: ['evt-place-confirmed', 'evt-time-rollback']
      }
    })
    expect(characterCandidate.reasons.join(' ')).toContain('林舟的目标')
    expect(characterCandidate.reasons.join(' ')).toContain('危险度 82')
    expect(characterCandidate.sourceRefs).toEqual(expect.arrayContaining([
      { type: 'character-knowledge', id: 'fact:ledger-seal' },
      { type: 'character-relation', id: 'relation:lin-keeper' },
      { type: 'canonical-fact', id: 'fact:lin-ledger-duty' },
      { type: 'runtime-event', id: 'evt-place-confirmed' },
      { type: 'runtime-event', id: 'evt-time-rollback' }
    ]))
    expect(characterCandidate.sourceRefs).not.toContainEqual({
      type: 'runtime-event',
      id: 'evt-stale-time'
    })
    expect(gameStore.runtimeEvents.some((event) => event.payload?.kind === 'emergence-candidate-ready')).toBe(true)

    gameStore.runtimeEvents = [{
      id: 'evt-conflicted-state',
      type: 'state_delta',
      ts: 4,
      payload: {
        kind: 'conflicted-state',
        placeId: 'place:gray-wall:tax-office',
        before: {
          placeStates: {
            'place:gray-wall:tax-office': { controllerId: 'faction:archive' }
          },
          characterStates: {
            'char-lin': { alive: false }
          },
          characterRelations: {
            'relation:lin-keeper': {
              subjectId: 'char-lin',
              objectId: 'char-keeper',
              kind: 'guardian',
              status: 'confirmed'
            }
          },
          canonicalFacts: {
            'fact:lin-ledger-duty': {
              subjectId: 'char-lin',
              predicate: 'ledger-duty',
              value: 'recover',
              status: 'confirmed'
            }
          }
        },
        after: {
          placeStates: {
            'place:gray-wall:tax-office': { controllerId: 'faction:unknown' }
          },
          characterStates: {
            'char-lin': { alive: true }
          },
          characterRelations: {
            'relation:lin-keeper': {
              subjectId: 'char-lin',
              objectId: 'char-keeper',
              kind: 'sibling',
              status: 'confirmed'
            }
          },
          canonicalFacts: {
            'fact:lin-ledger-duty': {
              subjectId: 'char-lin',
              predicate: 'ledger-duty',
              value: 'destroy',
              status: 'confirmed'
            }
          }
        }
      }
    }]
    const conflictCandidates = gameStore.refreshEmergenceCandidates({ now: 1710000001000 })
    expect(conflictCandidates).toHaveLength(1)
    expect(conflictCandidates[0].hook).toBe('失踪税册仍被藏在旧税所')
    expect(conflictCandidates[0].causalState).toMatchObject({
      place: { controllerId: '' },
      character: null,
      activeEventIds: [],
      blockedConflictCodes: expect.arrayContaining([
        'place-control-conflict',
        'character-state-conflict',
        'kinship-conflict',
        'canonical-fact-conflict'
      ])
    })
    expect(conflictCandidates[0].sourceRefs).not.toContainEqual({
      type: 'runtime-event',
      id: 'evt-conflicted-state'
    })
    expect(conflictCandidates[0].sourceRefs).not.toContainEqual({
      type: 'character-relation',
      id: 'relation:lin-keeper'
    })
    expect(conflictCandidates[0].sourceRefs).not.toContainEqual({
      type: 'canonical-fact',
      id: 'fact:lin-ledger-duty'
    })

    const relationConflict = gameStore.getRuntimeCausalityReport().activeConflicts
      .find((item) => item.code === 'kinship-conflict')
    const reviewResult = gameStore.resolveRuntimeConflict({
      conflictKey: relationConflict.conflictKey
    })
    expect(reviewResult.ok).toBe(true)
    expect(reviewResult.event).toMatchObject({
      type: 'display_event',
      parentId: 'evt-conflicted-state',
      payload: {
        kind: 'runtime-conflict-resolution',
        contextual: false,
        conflictResolution: {
          conflictKey: relationConflict.conflictKey,
          conflictCode: 'kinship-conflict',
          resolution: 'accept-current'
        }
      }
    })
    expect(gameStore.getRuntimeCausalityReport().activeConflicts).not.toContainEqual(
      expect.objectContaining({ conflictKey: relationConflict.conflictKey })
    )

    gameStore.dismissEmergenceCandidate(conflictCandidates[0].id)
    expect(gameStore.emergenceCandidates).toEqual([])
    expect(gameStore.emergenceDismissedIds).toContain(conflictCandidates[0].id)

    gameStore.saveCurrentSession()
    const sessionId = gameStore.currentSessionId
    gameStore.resetRuntimeState()
    gameStore.loadSession(sessionId)
    expect(gameStore.emergenceCandidates).toEqual([])
    expect(gameStore.emergenceDismissedIds).toContain(conflictCandidates[0].id)
  })

  it('generates a constrained emergence draft and restores it with the session', async () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = {
      id: 'wb_emergence_draft',
      name: '事件具体化测试',
      entries: [],
      geoHistory: { version: 1, placeRefs: [], nodes: [], playerNodes: [] }
    }

    const gameStore = useGameStore()
    const session = gameStore.createSession({ title: '事件具体化', worldbookId: worldStore.activeWorldbook.id })
    gameStore.worldMapState = {
      ...gameStore.worldMapState,
      placeId: 'place:gray-wall:tax-office',
      currentCountry: '东境',
      currentCity: '灰墙',
      currentScene: '旧税所'
    }
    gameStore.encounteredCharacters = [{ id: 'char-lin', name: '林舟' }]
    gameStore.placeStates = {
      'place:gray-wall:tax-office': {
        status: '封存',
        controllerId: 'faction:archive',
        danger: 35
      }
    }
    gameStore.characterStates = {
      'char-lin': {
        status: '失踪',
        alive: false,
        placeId: 'place:gray-wall:tax-office',
        goal: '找回税册'
      }
    }
    gameStore.characterRelations = {
      'relation:lin-keeper': {
        subjectId: 'char-keeper',
        objectId: 'char-lin',
        kind: 'guardian',
        status: 'confirmed'
      }
    }
    gameStore.canonicalFacts = {
      'fact:ledger-status': {
        subjectId: 'ledger:missing',
        predicate: 'status',
        value: 'missing',
        status: 'confirmed'
      }
    }
    gameStore.writingTime = {
      ...gameStore.writingTime,
      eraId: 'old-ledger-era',
      eraName: '封账纪',
      year: 12,
      month: 4,
      day: 8
    }
    gameStore.emergenceCandidates = [{
      id: 'emergence_history-hook_1',
      type: 'history-hook',
      title: '未决历史线索的回响',
      summary: '在旧税所继续处理失踪税册。',
      reasons: ['当前地点：东境 / 灰墙 / 旧税所'],
      placeId: 'place:gray-wall:tax-office',
      participants: ['林舟'],
      sourceRefs: [{ type: 'geo-history', id: 'history-gray-wall' }]
    }]

    vi.mocked(runGenerationTask).mockImplementation(async ({ taskType, parseContent }) => {
      expect(taskType).toBe('emergence.event')
      const content = JSON.stringify({
        title: '旧税所的账册回响',
        summary: '林舟在旧税所找到被撕走的账页，线索因此重新指向失踪税册。',
        placeId: 'place:gray-wall:tax-office',
        participants: ['林舟'],
        causes: ['失踪税册仍未找到'],
        changes: [
          { op: 'set', path: 'flags', value: { taxLedgerSeen: true } },
          {
            op: 'merge',
            path: 'placeStates',
            value: {
              'place:gray-wall:tax-office': {
                status: '重新开放',
                controllerId: 'faction:tide',
                danger: 62
              }
            }
          },
          {
            op: 'merge',
            path: 'characterStates',
            value: {
              'char-lin': {
                status: '归队',
                alive: true,
                placeId: 'place:gray-wall:tax-office',
                goal: '追查缺页'
              }
            }
          },
          {
            op: 'merge',
            path: 'writingTime',
            value: { eraId: 'new-ledger-era', eraName: '追账纪', year: 1, month: 1, day: 1 }
          },
          {
            op: 'merge',
            path: 'characterRelations',
            value: {
              'relation:lin-keeper': {
                subjectId: 'char-keeper',
                objectId: 'char-lin',
                kind: 'adoptive-parent',
                status: 'confirmed'
              }
            }
          },
          {
            op: 'merge',
            path: 'canonicalFacts',
            value: {
              'fact:ledger-status': {
                subjectId: 'ledger:missing',
                predicate: 'status',
                value: 'recovered',
                status: 'confirmed'
              }
            }
          }
        ],
        consequences: ['账册缺页成为新的调查入口'],
        unresolvedHooks: ['账册缺页的去向'],
        choices: [
          { id: 'inspect', label: '检查被撕走的账页', intent: '追查来源', risk: '可能暴露行踪' },
          { id: 'hide', label: '先把账页藏起来', intent: '保留证据', risk: '会错过追踪时机' }
        ],
        confidence: 0.8
      })
      return { success: true, parsed: parseContent(content) }
    })

    const draft = await gameStore.generateEmergenceDraft('emergence_history-hook_1')

    expect(draft.status).toBe('ready')
    expect(draft.event.kind).toBe('emergent-event-v1')
    expect(draft.event.placeId).toBe('place:gray-wall:tax-office')
    expect(draft.event.choices).toHaveLength(2)
    expect(gameStore.getEmergenceStateDeltaPreview('emergence_history-hook_1').explanation).toContain('因为')
    expect(gameStore.getEmergenceStateDeltaPreview('emergence_history-hook_1').explanation).toContain('所以')
    expect(gameStore.runtimeEvents.some((event) => event.payload?.kind === 'emergence-draft-ready')).toBe(true)
    expect(gameStore.sessions[0].runtimeState.emergenceDraft.status).toBe('ready')

    const applied = gameStore.applyEmergenceDraft('emergence_history-hook_1')
    expect(applied.event.type).toBe('state_delta')
    expect(applied.event.payload.explanation).toContain('所以')
    expect(applied.event.payload.transitions).toMatchObject({
      placeControl: [{
        placeId: 'place:gray-wall:tax-office',
        fromControllerId: 'faction:archive',
        toControllerId: 'faction:tide'
      }],
      time: { allowEraChange: true }
    })
    expect(applied.event.payload.transitions.characters).toContainEqual({
      characterId: 'char-lin',
      kind: 'revival'
    })
    expect(applied.event.payload.transitions.relationships).toContainEqual(expect.objectContaining({
      id: 'relation:lin-keeper',
      kind: 'relationship-rewrite'
    }))
    expect(applied.event.payload.transitions.facts).toContainEqual(expect.objectContaining({
      id: 'fact:ledger-status',
      kind: 'canonical-fact-rewrite'
    }))
    expect(gameStore.flags.taxLedgerSeen).toBe(true)
    expect(gameStore.placeStates['place:gray-wall:tax-office'].controllerId).toBe('faction:tide')
    expect(gameStore.characterStates['char-lin'].alive).toBe(true)
    expect(gameStore.writingTime.eraId).toBe('new-ledger-era')
    expect(gameStore.characterRelations['relation:lin-keeper'].kind).toBe('adoptive-parent')
    expect(gameStore.canonicalFacts['fact:ledger-status'].value).toBe('recovered')
    expect(gameStore.getRuntimeCausalityReport().activeConflicts).toEqual([])
    expect(gameStore.emergenceDraft.decision).toBe('applied')

    const rolledBack = gameStore.rollbackEmergenceDraft('emergence_history-hook_1')
    expect(rolledBack.success).toBe(true)
    expect(gameStore.flags.taxLedgerSeen).toBeUndefined()
    expect(gameStore.placeStates['place:gray-wall:tax-office'].controllerId).toBe('faction:archive')
    expect(gameStore.characterStates['char-lin'].alive).toBe(false)
    expect(gameStore.writingTime.eraId).toBe('old-ledger-era')
    expect(gameStore.characterRelations['relation:lin-keeper'].kind).toBe('guardian')
    expect(gameStore.canonicalFacts['fact:ledger-status'].value).toBe('missing')
    expect(rolledBack.event.payload.transitions.time.allowEraChange).toBe(true)
    expect(gameStore.getRuntimeCausalityReport()).toMatchObject({
      isConsistent: true,
      activeConflicts: []
    })
    expect(gameStore.getRuntimeCausalityReport().staleEventIds).toContain(applied.event.id)
    expect(gameStore.emergenceDraft.decision).toBe('rolled-back')
    expect(gameStore.runtimeEvents.some((event) => event.payload?.kind === 'emergence-state-rollback')).toBe(true)

    gameStore.resetRuntimeState()
    gameStore.loadSession(session.id)
    expect(gameStore.emergenceDraft.status).toBe('ready')
    expect(gameStore.emergenceDraft.decision).toBe('rolled-back')
    expect(gameStore.emergenceDraft.event.title).toBe('旧税所的账册回响')
    expect(gameStore.characterRelations['relation:lin-keeper'].kind).toBe('guardian')
    expect(gameStore.canonicalFacts['fact:ledger-status'].value).toBe('missing')
  })

  it('rejects an emergence draft without mutating runtime state', () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = { id: 'wb_emergence_reject', name: '事件拒绝测试', entries: [] }
    const gameStore = useGameStore()
    gameStore.createSession({ title: '拒绝事件', worldbookId: worldStore.activeWorldbook.id })
    gameStore.emergenceCandidates = [{ id: 'candidate-reject', placeId: 'place:test', title: '候选', summary: '这是一个等待审阅的候选事件。' }]
    gameStore.emergenceDraft = {
      candidateId: 'candidate-reject',
      status: 'ready',
      decision: 'pending',
      event: {
        kind: 'emergent-event-v1',
        title: '待审阅事件',
        summary: '这段事件只用于验证拒绝不会改变运行时状态。',
        placeId: 'place:test',
        choices: [{ id: 'a', label: '观察' }, { id: 'b', label: '离开' }],
        changes: [{ op: 'merge', path: 'flags', value: { shouldNotApply: true } }]
      }
    }

    gameStore.rejectEmergenceDraft('candidate-reject')

    expect(gameStore.flags.shouldNotApply).toBeUndefined()
    expect(gameStore.emergenceDraft.decision).toBe('rejected')
    expect(gameStore.runtimeEvents.some((event) => event.payload?.kind === 'emergence-draft-rejected')).toBe(true)
  })

  it('generates and accepts a prose trigger draft from the latest plot journal entry', async () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = { id: 'wb_alpha', name: 'Alpha', entries: [] }

    const gameStore = useGameStore()
    const session = gameStore.createSession({ title: '钟楼调查', worldbookId: 'wb_alpha' })
    gameStore.chatHistory = [
      { role: 'system', content: '你是叙述者。' },
      { role: 'assistant', content: '钟楼顶层的风从破窗灌进来。' },
      { role: 'user', content: '我把证据藏进衣襟。' }
    ]
    gameStore.plotJournal = [{
      id: 'journal_1',
      chapterId: 'chapter-1',
      summary: '阿离在钟楼顶层与林舟对质后，决定先藏起证据，等待黎明前再交易。',
      participants: ['阿离', '林舟'],
      locations: ['东境', '青石城', '钟楼'],
      keyChoices: ['先藏起证据'],
      unresolvedHooks: ['黎明前是否交给潮盐行会'],
      sourceMessageIds: ['chat-1', 'chat-2']
    }]
    gameStore.setHistoryNode({ id: 'history-clocktower', title: '钟楼密谈', placeId: 'place:clocktower' })
    gameStore.saveWorldMapState({
      currentCountry: '东境',
      currentCity: '青石城',
      currentScene: '钟楼',
      placeId: 'place:clocktower'
    })

    vi.mocked(runGenerationTask).mockImplementation(async ({ taskType, parseContent }) => {
      expect(taskType).toBe('adventure.trigger.prose')
      const content = '钟楼上的风卷着潮腥，阿离把证据按进衣襟最内层，盯着林舟不肯先松口。她知道只要天亮前交错一步，整件事就会变成别人手里的筹码，于是她把沉默也当成了谈判的一部分。'
      return {
        success: true,
        parsed: parseContent(content)
      }
    })

    const readyDraft = await gameStore.generateAdventureTriggerDraft('prose')
    expect(readyDraft.status).toBe('ready')
    expect(readyDraft.content).toContain('钟楼')
    expect(gameStore.sessions[0].runtimeState.adventureTriggers.prose.status).toBe('ready')
    expect(gameStore.getAdventureTriggerState('prose', Date.now() + 4000).hasDraftForLatestEntry).toBe(true)

    const accepted = await gameStore.acceptAdventureTriggerDraft('prose')
    const storedAssets = listNarrativeAssets({ sourceType: 'experience-session', sourceId: session.id })

    expect(accepted.asset.kind).toBe('draft-prose')
    expect(storedAssets).toHaveLength(1)
    expect(storedAssets[0].content).toContain('钟楼上的风')
    expect(storedAssets[0].sourceRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ refType: 'session-message', refId: `${session.id}:chat-1` }),
      expect.objectContaining({ refType: 'history-node', refId: 'history-clocktower' }),
      expect.objectContaining({ refType: 'map-site', refId: 'place:clocktower' }),
      expect.objectContaining({ refType: 'plot-journal', refId: 'journal_1' })
    ]))
    expect(gameStore.adventureTriggers.prose.status).toBe('accepted')
    expect(gameStore.getAdventureTriggerState('prose', Date.now() + 4000).canGenerate).toBe(false)
    expect(gameStore.getAdventureTriggerState('prose', Date.now() + 4000).blockReason).toContain('已保存')

    gameStore.resetRuntimeState()
    gameStore.loadSession(session.id)
    expect(gameStore.adventureTriggers.prose.status).toBe('accepted')
    expect(gameStore.adventureTriggers.prose.assetId).toBe(accepted.asset.id)
  })

  it('generates and accepts a storyboard trigger draft into storyboard storage', async () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = { id: 'wb_alpha', name: 'Alpha', entries: [] }

    const gameStore = useGameStore()
    const session = gameStore.createSession({ title: '钟楼调查', worldbookId: 'wb_alpha' })
    gameStore.plotJournal = [{
      id: 'journal_1',
      chapterId: 'chapter-1',
      summary: '阿离在钟楼顶层与林舟对质后，决定先藏起证据，等待黎明前再交易。',
      participants: ['阿离', '林舟'],
      locations: ['东境', '青石城', '钟楼'],
      keyChoices: ['先藏起证据'],
      unresolvedHooks: ['黎明前是否交给潮盐行会'],
      sourceMessageIds: ['chat-1', 'chat-2']
    }]
    gameStore.setHistoryNode({ id: 'history-clocktower', title: '钟楼密谈', placeId: 'place:clocktower' })
    gameStore.saveWorldMapState({
      currentCountry: '东境',
      currentCity: '青石城',
      currentScene: '钟楼',
      placeId: 'place:clocktower'
    })

    vi.mocked(runGenerationTask).mockImplementation(async ({ taskType, parseContent }) => {
      expect(taskType).toBe('adventure.trigger.storyboard')
      const content = JSON.stringify({
        shots: [
          {
            sequence: 1,
            sourceText: '钟楼顶层的破窗在夜里大开',
            shotType: 'wide',
            camera: 'fixed',
            duration: 4,
            visual: '冷风灌入钟楼，碎玻璃发亮',
            transition: 'cut'
          },
          {
            sequence: 2,
            sourceText: '阿离把证据压进衣襟，抬眼看向林舟',
            shotType: 'medium',
            camera: 'push',
            duration: 3,
            dialogue: '先别急着开价。',
            transition: 'cut'
          },
          {
            sequence: 3,
            sourceText: '林舟站在逆光里，迟疑着没有再逼近',
            shotType: 'close_up',
            camera: 'follow',
            duration: 3,
            sound: '风声和钟楼木梁的轻响',
            transition: 'fade'
          }
        ]
      })
      return {
        success: true,
        parsed: parseContent(content)
      }
    })

    const readyDraft = await gameStore.generateAdventureTriggerDraft('storyboard')
    expect(readyDraft.status).toBe('ready')
    expect(readyDraft.shots).toHaveLength(3)

    const accepted = await gameStore.acceptAdventureTriggerDraft('storyboard')
    const storedAssets = listNarrativeAssets({ sourceType: 'experience-session', sourceId: session.id })
    const storyboardDocuments = listStoryboardDocuments({
      sourceType: 'narrative-asset',
      sourceId: accepted.asset.id
    })

    expect(accepted.asset.kind).toBe('storyboard-seed')
    expect(accepted.storyboard.validation.valid).toBe(true)
    expect(storedAssets).toHaveLength(1)
    expect(storedAssets[0].content).toContain('摘要：阿离在钟楼顶层与林舟对质后')
    expect(storyboardDocuments).toHaveLength(1)
    expect(storyboardDocuments[0].projectId).toBe('wb_alpha')
    expect(storyboardDocuments[0].sourceRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ refType: 'narrative-asset', refId: accepted.asset.id }),
      expect.objectContaining({ refType: 'history-node', refId: 'history-clocktower' }),
      expect.objectContaining({ refType: 'map-site', refId: 'place:clocktower' }),
      expect.objectContaining({ refType: 'plot-journal', refId: 'journal_1' })
    ]))
    expect(gameStore.adventureTriggers.storyboard.status).toBe('accepted')
    expect(gameStore.adventureTriggers.storyboard.storyboardDocumentId).toBe(storyboardDocuments[0].id)
    expect(gameStore.adventureTriggers.storyboard.storyboardVersionId).toBe(accepted.storyboard.version.versionId)
  })

  it('syncs direct runtime writes and leaves global storage alone when resetting runtime state', () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = { id: 'wb_alpha', name: 'Alpha' }

    const gameStore = useGameStore()
    gameStore.createSession({ title: '第一章' })

    gameStore.saveWritingCharacter({
      name: '林舟',
      gender: '男',
      age: '19岁',
      traits: ['谨慎'],
      mood: 72,
      description: '测试角色',
      goal: '回到家'
    })
    gameStore.saveWritingTime({
      eraId: 'custom',
      eraName: '新纪元',
      year: '4',
      month: '6',
      day: '21'
    })
    gameStore.saveWorldMapState({
      map: { countries: [{ id: 'c1', name: '北境', cities: [] }] },
      currentCountry: '北境',
      currentCity: '霜城',
      currentScene: '旧港口'
    })

    expect(gameStore.sessions[0].runtimeState.writingCharacter.name).toBe('林舟')
    expect(gameStore.sessions[0].runtimeState.writingTime.eraName).toBe('新纪元')
    expect(gameStore.sessions[0].runtimeState.worldMapState.currentScene).toBe('旧港口')

    gameStore.resetRuntimeState()

    expect(gameStore.messages).toEqual([])
    expect(gameStore.lastError).toBeNull()
    expect(gameStore.isLoading).toBe(false)
    expect(getItem(STORAGE_KEYS.WRITING_CHARACTER).name).toBe('林舟')
    expect(getItem(STORAGE_KEYS.WRITING_TIME).eraName).toBe('新纪元')
  })

  it('returns scoped active memories only after the model requests memory_lookup', async () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = { id: 'project-1', name: 'Alpha', entries: [] }

    const gameStore = useGameStore()
    const session = gameStore.createSession({ title: '第一章', worldbookId: 'project-1' })
    gameStore.chatHistory = [
      { role: 'system', content: '你是叙述者。' },
      { role: 'assistant', content: '你站在旧书店门外。' },
      { role: 'user', content: '继续。' }
    ]

    const records = [
      createMemoryCandidate({
        content: '旧书店在西街。',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'project-fact',
        status: 'active'
      }),
      createMemoryCandidate({
        content: '玩家刚拿到铜钥匙。',
        scope: 'session',
        scopeId: session.id,
        kind: 'plot-event',
        status: 'active'
      }),
      createMemoryCandidate({
        content: '其他作品记忆。',
        scope: 'project',
        scopeId: 'project-2',
        kind: 'project-fact',
        status: 'active'
      }),
      createMemoryCandidate({
        content: '待确认记忆。',
        scope: 'session',
        scopeId: session.id,
        kind: 'plot-event',
        status: 'pending'
      })
    ]
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify(records))

    // Q3：respond 先提交 BeatPlan，再触发 memory_lookup，最后写正文。
    vi.mocked(runNarrativeAgentTurn)
      .mockResolvedValueOnce({
        kind: 'tool_calls',
        calls: [{
          id: 'beat-plan-call',
          name: 'submit_narrative_beat_plan',
          arguments: { responseObligation: '回应玩家', causalSteps: ['承接', '发展'], revealOrChange: '变化', endCondition: '完成' }
        }]
      })
      .mockResolvedValueOnce({
        kind: 'tool_calls',
        calls: [{
          id: 'memory-call-1',
          name: 'memory_lookup',
          arguments: {
            action: 'search',
            query: '旧书店 铜钥匙',
            filters: { scopes: ['project', 'session'] },
            limit: 4
          }
        }]
      })
      .mockResolvedValueOnce({ kind: 'final_ready', text: '旧书店的铜钥匙在掌心发凉。', calls: [] })

    await gameStore.generateAIResponse()

    const finalAgentRequest = vi.mocked(runNarrativeAgentTurn).mock.calls.at(-1)[0]
    expect(finalAgentRequest.messages.map((message) => message.role)).toEqual([
      'system', 'system', 'assistant', 'user', 'assistant', 'tool', 'user', 'assistant', 'tool'
    ])
    const memoryToolResult = finalAgentRequest.messages.find((message) => (
      message.role === 'tool' && message.content.includes('旧书店在西街。')
    ))
    expect(memoryToolResult.content).toContain('旧书店在西街。')
    expect(memoryToolResult.content).toContain('玩家刚拿到铜钥匙。')
    expect(memoryToolResult.content).not.toContain('其他作品记忆')
    expect(memoryToolResult.content).not.toContain('待确认记忆')
    expect(gameStore.lastMemoryContext).toBe('')
    expect(gameStore.lastMemoryRecall.source).toBe('narrative-tools')
    expect(gameStore.lastNarrativeAgentTrace).toMatchObject({
      toolRounds: 2,
      totalCalls: 2,
      calls: [
        expect.objectContaining({ tool: 'submit_narrative_beat_plan' }),
        expect.objectContaining({ tool: 'memory_lookup' })
      ]
    })
  })

  it('stores a bounded Kernel and tool ledger without restoring eager prompt layers', async () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = {
      id: 'project-ledger',
      name: 'Ledger World',
      entries: [{
        id: 'rule-1',
        name: '常驻规则',
        type: 'rule',
        content: '所有线索必须有代价。',
        keys: [],
        injection: { mode: 'constant' }
      }]
    }

    const gameStore = useGameStore()
    const session = gameStore.createSession({ title: '账本测试', worldbookId: 'project-ledger' })
    gameStore.chatHistory = [
      { role: 'system', content: '你是叙述者。' },
      { role: 'assistant', content: '你抵达钟楼下，发现门锁上有潮盐行会的旧印。' },
      { role: 'user', content: '我向林舟询问铜钥匙。' },
      { role: 'assistant', content: '林舟说铜钥匙曾被带进钟楼。' },
      { role: 'user', content: '我检查钟楼门锁。' },
      { role: 'assistant', content: '门锁仍然完好，但锁孔里留着新鲜铜屑。' },
      { role: 'user', content: '继续。' }
    ]

    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify([
      createMemoryCandidate({
        content: '玩家已经拿到铜钥匙。',
        scope: 'session',
        scopeId: session.id,
        kind: 'plot-event',
        status: 'active'
      })
    ]))

    vi.mocked(runNarrativeAgentTurn)
      .mockResolvedValueOnce({
        kind: 'tool_calls',
        calls: [{
          id: 'beat-plan-call',
          name: 'submit_narrative_beat_plan',
          arguments: { responseObligation: '回应玩家', causalSteps: ['承接', '发展'], revealOrChange: '变化', endCondition: '完成' }
        }]
      })
      .mockResolvedValueOnce({
        kind: 'tool_calls',
        calls: [
          {
            id: 'world-rule-call',
            name: 'world_lookup',
            arguments: { action: 'search', query: '常驻规则', limit: 3 }
          },
          {
            id: 'world-rule-call-repeat',
            name: 'world_lookup',
            arguments: { action: 'search', query: '常驻规则', limit: 3 }
          }
        ]
      })
      .mockResolvedValueOnce({ kind: 'final_ready', text: '核对规则后，钟楼方向传来一声闷响。', calls: [] })

    await gameStore.generateAIResponse()

    const sentMessages = vi.mocked(runNarrativeAgentTurn).mock.calls.at(-1)[0].messages
    expect(sentMessages.length).toBeGreaterThan(3)
    expect(sentMessages[0].role).toBe('system')
    expect(sentMessages[1].role).toBe('system')
    expect(sentMessages[1].content).toContain('本轮作者注释')
    // C2.2：transcript 注入真实历史后，前两条 system 之后是历史 assistant/user。
    expect(sentMessages[2].role).toBe('assistant')
    expect(sentMessages.at(-1).role).toBe('tool')
    expect(sentMessages[0].content).toContain('所有线索必须有代价')
    expect(sentMessages[0].content).toContain(':::narration')
    expect(sentMessages[0].content).not.toContain('【写作上下文】')
    expect(sentMessages[0].content).not.toContain('【已确认记忆】')
    expect(sentMessages[0].content).not.toContain('【世界书：Ledger World】')

    const sources = new Set(gameStore.lastContextLedger.parts.map((part) => part.source))
    expect(sources.has('worldbook')).toBe(true)
    expect(sources.has('generation')).toBe(true)
    expect(sources.has('chat')).toBe(true)
    expect(sources.has('memory')).toBe(false)
    expect(gameStore.lastContextLedger.parts.every((part) => !Object.prototype.hasOwnProperty.call(part, 'content'))).toBe(true)
    expect(gameStore.lastContextLedger.parts.every((part) => part.preview.length <= 120)).toBe(true)
    expect(gameStore.lastNarrativeKernel).toMatchObject({
      schemaVersion: 1,
      projectId: 'project-ledger',
      sessionId: session.id
    })
    expect(gameStore.lastNarrativeKernel.blocks.map((block) => block.kind)).toEqual([
      'rules',
      'turn',
      'scene',
      'summary',
      'recent',
      'continuity',
      'style'
    ])
    expect(gameStore.lastNarrativeContextAudit).toMatchObject({
      schemaVersion: 1,
      mode: 'agent-tools',
      kernelRevision: gameStore.lastNarrativeKernel.revision,
      indexed: {
        counts: expect.objectContaining({ world: 1, memory: 1 })
      },
      tools: { rounds: 2, calls: 3 }
    })
    expect(gameStore.lastNarrativeContextAudit.queryPreview).toBe('继续。')
    expect(gameStore.lastContextLedger.parts.map((part) => part.partition)).toEqual(
      expect.arrayContaining(['kernel', 'summary', 'tool'])
    )
    expect(gameStore.lastContextLedger.parts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'generation',
        partition: 'tool',
        purpose: 'narrative-agent-runtime',
        chars: 0
      })
    ]))
    expect(gameStore.lastNarrativeContextAudit.tools).toMatchObject({
      retainedResults: 3,
      prunedResults: 0
    })
    const productionMetrics = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.NARRATIVE_PRODUCTION_METRICS)
    )
    expect(productionMetrics.events).toHaveLength(1)
    expect(productionMetrics.events[0]).toMatchObject({
      mode: 'continue',
      outcome: 'success',
      protocolOk: true,
      tools: {
        rounds: 2,
        calls: 3,
        evidenceCount: 3,
        errorCount: 0
      },
      cleanup: {
        renderSettled: true,
        requestReleased: true,
        loadingOwnerSettled: true
      }
    })
    expect(JSON.stringify(productionMetrics)).not.toContain('所有线索必须有代价')
    expect(JSON.stringify(productionMetrics)).not.toContain('secret-provider-key')
  })

  it('keeps memory tool evidence bounded and excludes pending or cross-project records', async () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = { id: 'project-1', name: 'Alpha', entries: [] }

    const gameStore = useGameStore()
    const session = gameStore.createSession({ title: '钟楼调查', worldbookId: 'project-1' })
    gameStore.chatHistory = [
      { role: 'system', content: '你是叙述者。' },
      { role: 'assistant', content: '你来到旧书店门口，钟楼就在街角。' },
      { role: 'user', content: '我进入旧书店寻找铜钥匙。' }
    ]

    const records = [
      createMemoryCandidate({
        id: 'mem-project-bookstore',
        content: '旧书店在西街尽头，是钟楼调查的起点。',
        scope: 'project',
        scopeId: 'project-1',
        kind: 'project-fact',
        status: 'active',
        confidence: 0.5,
        updatedAt: 5
      }),
      createMemoryCandidate({
        id: 'mem-session-key',
        content: '主角在钟楼顶层拿到了铜钥匙。',
        scope: 'session',
        scopeId: session.id,
        kind: 'plot-event',
        status: 'active',
        confidence: 0.9,
        updatedAt: 10
      }),
      createMemoryCandidate({
        id: 'mem-session-unrelated',
        content: '潮盐行会在城门外集合。',
        scope: 'session',
        scopeId: session.id,
        kind: 'plot-event',
        status: 'active',
        confidence: 0.9,
        updatedAt: 20
      }),
      createMemoryCandidate({
        id: 'mem-other-project',
        content: '另一部作品的旧书店线索。',
        scope: 'project',
        scopeId: 'project-2',
        kind: 'project-fact',
        status: 'active'
      }),
      createMemoryCandidate({
        id: 'mem-pending',
        content: '未确认：钟楼顶层还有密室。',
        scope: 'session',
        scopeId: session.id,
        kind: 'plot-event',
        status: 'pending'
      })
    ]
    localStorage.setItem(STORAGE_KEYS.MEMORY_CANDIDATES, JSON.stringify(records))

    vi.mocked(runNarrativeAgentTurn)
      .mockResolvedValueOnce({
        kind: 'tool_calls',
        calls: [{
          id: 'memory-ranked-call',
          name: 'memory_lookup',
          arguments: {
            action: 'search',
            query: '旧书店 铜钥匙 钟楼',
            filters: { scopes: ['project', 'session'] },
            limit: 4
          }
        }]
      })
      .mockResolvedValueOnce({ kind: 'final_ready', text: '铜钥匙在掌心留下了温度。', calls: [] })

    await gameStore.generateAIResponse()

    const finalEvidence = vi.mocked(runNarrativeAgentTurn).mock.calls.at(-1)[0].messages
      .filter((message) => message.role === 'tool')
      .map((message) => message.content)
      .join('\n')
    expect(finalEvidence).toContain('旧书店在西街尽头')
    expect(finalEvidence).toContain('钟楼顶层拿到了铜钥匙')
    expect(finalEvidence).not.toContain('另一部作品')
    expect(finalEvidence).not.toContain('未确认')
    expect(gameStore.lastNarrativeAgentTrace.calls[0].itemIds).toEqual(expect.arrayContaining([
      'mem-project-bookstore',
      'mem-session-key'
    ]))
    expect(JSON.stringify(gameStore.lastContextLedger)).not.toContain('另一部作品')
    expect(JSON.stringify(gameStore.lastContextLedger)).not.toContain('未确认')
    expect(gameStore.lastContextLedger.parts.every((part) => part.preview.length <= 120)).toBe(true)
  })

  it('does not inject Mem0 or a memory prompt when the model does not request memory', async () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = { id: 'project-1', name: 'Alpha', entries: [] }

    const gameStore = useGameStore()
    gameStore.createSession({ title: '空记忆会话', worldbookId: 'project-1' })
    gameStore.chatHistory = [
      { role: 'system', content: '你是叙述者。' },
      { role: 'assistant', content: '你抵达一座陌生的小城。' },
      { role: 'user', content: '我去找一间旧书店。' }
    ]

    // Q3：respond 先提交 BeatPlan 再写正文 —— mock 第一轮返回计划调用。
    vi.mocked(runNarrativeAgentTurn).mockResolvedValueOnce({
      kind: 'tool_calls',
      calls: [{
        id: 'beat-plan-call',
        name: 'submit_narrative_beat_plan',
        arguments: { responseObligation: '回应玩家', causalSteps: ['承接', '发展'], revealOrChange: '变化', endCondition: '完成' }
      }]
    })
    await gameStore.generateAIResponse()

    const directRequest = vi.mocked(runNarrativeAgentTurn).mock.calls.at(-1)[0]
    expect(directRequest.messages).toHaveLength(7)
    expect(directRequest.messages.map((message) => message.role)).toEqual([
      'system', 'system', 'assistant', 'user', 'assistant', 'tool', 'user'
    ])
    expect(directRequest.messages.every((message) => !message.content.includes('【已确认记忆】'))).toBe(true)
    const recall = gameStore.lastMemoryRecall
    expect(recall).not.toBeNull()
    expect(recall.includedCount).toBe(0)
    expect(recall.totalItems).toBe(0)
    expect(recall.source).toBe('narrative-tools')
    expect(gameStore.lastMemoryContext).toBe('')
    expect(vi.mocked(runNarrativeAgentTurn)).toHaveBeenCalledTimes(2)
  })

  it('extends the last assistant message in place without creating a new message (C4)', async () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = { id: 'project-1', name: 'Alpha', entries: [] }
    const gameStore = useGameStore()
    gameStore.createSession({ title: '续接测试', worldbookId: 'project-1' })
    gameStore.messages = [
      { id: 'assist-1', role: 'assistant', content: '雨水沿着舷窗滑落。', timestamp: 1 }
    ]
    gameStore.chatHistory = [
      { role: 'system', content: '你是叙述者。' },
      { role: 'assistant', content: '雨水沿着舷窗滑落。' }
    ]
    vi.mocked(runNarrativeAgentTurn).mockResolvedValue({
      kind: 'final_ready',
      text: '打湿了甲板上的缆绳。',
      calls: []
    })
    await gameStore.generateAIResponse({ intent: 'extend' })
    expect(gameStore.messages).toHaveLength(1)
    expect(gameStore.messages[0].id).toBe('assist-1')
    expect(Array.isArray(gameStore.messages[0].segments)).toBe(true)
    expect(gameStore.messages[0].segments).toHaveLength(2)
    expect(gameStore.messages[0].content).toContain('雨水沿着舷窗滑落。')
    expect(gameStore.messages[0].content).toContain('打湿了甲板上的缆绳。')

    // P0-2：第二次续写以第一次 extension turn 为父，形成 base → ext1 → ext2 祖先链。
    const firstExtensionTurnId = gameStore.lastCommittedTurnId
    vi.mocked(runNarrativeAgentTurn).mockResolvedValue({
      kind: 'final_ready',
      text: '缆绳尽头系着半枚铜扣。',
      calls: []
    })
    await gameStore.generateAIResponse({ intent: 'extend' })
    expect(gameStore.messages).toHaveLength(1)
    expect(gameStore.messages[0].segments).toHaveLength(3)
    const secondTurn = gameStore.turnRecords[gameStore.lastCommittedTurnId]
    expect(secondTurn.parentTurnId).toBe(firstExtensionTurnId)

    // Q2：SceneThread 软状态随生成构建，且随 pre/post 快照保存（第二次续写的 pre 快照应含首轮线程）。
    expect(gameStore.sceneThread).not.toBeNull()
    expect(gameStore.sceneThread.id).toMatch(/^scene_/)
    expect(secondTurn.preRuntimeSnapshot.sceneThread).not.toBeNull()
  })

  it('opens seed worlds by looking up the overview and related entries on narrative init', async () => {
    const preset = seedWorldbookPresets[0]
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = {
      id: 'seed-border',
      ...preset,
      worldDescription: `${preset.worldDescription}\n\n开场困境：${preset.openingHook}`,
      entries: preset.entries.map((entry, index) => ({
        id: `${preset.id}-${index}`,
        ...entry
      }))
    }

    const gameStore = useGameStore()
    gameStore.createSession({ title: '暮湾开局', worldbookId: 'seed-border' })
    gameStore.chatHistory = [
      { role: 'system', content: '你是叙述者。' },
      { role: 'user', content: '开始故事' }
    ]

    vi.mocked(runNarrativeAgentTurn).mockImplementation(async (_, context) => {
      if (context.decisionIndex === 0) {
        return {
          kind: 'tool_calls',
          calls: [{
            id: 'seed-overview',
            name: 'world_lookup',
            arguments: {
              action: 'search',
              query: worldStore.activeWorldbook.name,
              limit: 3
            }
          }]
        }
      }
      if (context.decisionIndex === 1) {
        return {
          kind: 'tool_calls',
          calls: [{
            id: 'seed-related',
            name: 'world_lookup',
            arguments: {
              action: 'related',
              ids: [`worldbook:${worldStore.activeWorldbook.id}:overview`],
              limit: 6
            }
          }]
        }
      }
      return { kind: 'final_ready', text: '暮湾的第一班蒸汽车准时进站。', calls: [] }
    })

    await gameStore.generateAIResponse()

    const initRequest = vi.mocked(runNarrativeAgentTurn).mock.calls.at(-1)[0]
    expect(initRequest.messages.length).toBeGreaterThan(3)
    expect(initRequest.messages.slice(0, 3).map((message) => message.role)).toEqual(['system', 'system', 'user'])
    const initToolEvidence = initRequest.messages.filter((message) => message.role === 'tool').map((message) => message.content).join('\n')
    expect(initToolEvidence).toContain('开场困境')
    expect(initToolEvidence).toContain('暮湾主城')
    expect(initToolEvidence).toContain('银藤学院')
    expect(initToolEvidence).toContain('北境灰墙')
    expect(initRequest.messages[0].content).not.toContain('【世界书：边境王国 · 雾潮暮湾】')
    expect(gameStore.lastWorldbookContext).toBeNull()
    expect(gameStore.lastNarrativeAgentTrace).toMatchObject({
      toolRounds: 2,
      totalCalls: 2
    })
  })

  it('appends and persists capped runtime events across save and load', () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = { id: 'wb_alpha', name: 'Alpha' }

    const gameStore = useGameStore()
    const session = gameStore.createSession({ title: '钟楼调查' })

    const event = gameStore.appendRuntimeEvent({
      type: 'turn',
      source: 'user',
      payload: { preview: '先去钟楼', hidden: false }
    })

    expect(event).not.toBeNull()
    expect(event.v).toBe(1)
    expect(event.branchId).toBe('main')
    expect(event.type).toBe('turn')
    expect(event.source).toBe('user')
    expect(event.payload.preview).toBe('先去钟楼')
    expect(gameStore.runtimeEvents).toHaveLength(1)

    gameStore.saveCurrentSession()
    gameStore.resetRuntimeState()
    expect(gameStore.runtimeEvents).toEqual([])

    gameStore.loadSession(session.id)
    expect(gameStore.runtimeEvents).toHaveLength(1)
    expect(gameStore.runtimeEvents[0].id).toBe(event.id)
    expect(gameStore.runtimeEvents[0].v).toBe(1)
    expect(gameStore.runtimeEvents[0].branchId).toBe('main')
    expect(gameStore.sessions[0].runtimeState.runtimeEvents).toHaveLength(1)
    expect(gameStore.sessions[0].runtimeState.runtimeEvents[0].payload.preview).toBe('先去钟楼')
  })

  it('caps runtime events at 200 and keeps the latest events in saved snapshots', () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = { id: 'wb_alpha', name: 'Alpha' }

    const gameStore = useGameStore()
    const session = gameStore.createSession({ title: '钟楼调查' })

    for (let index = 0; index < 205; index += 1) {
      gameStore.appendRuntimeEvent({
        type: 'turn',
        source: 'user',
        payload: { preview: `evt-${index}` }
      })
    }

    expect(gameStore.runtimeEvents).toHaveLength(200)
    expect(gameStore.runtimeEvents[0].payload.preview).toBe('evt-5')
    expect(gameStore.runtimeEvents[199].payload.preview).toBe('evt-204')

    gameStore.saveCurrentSession()
    expect(gameStore.sessions[0].runtimeState.runtimeEvents).toHaveLength(200)
    expect(gameStore.sessions[0].runtimeState.runtimeEvents[199].payload.preview).toBe('evt-204')

    gameStore.resetRuntimeState()
    gameStore.loadSession(session.id)
    expect(gameStore.runtimeEvents).toHaveLength(200)
    expect(gameStore.runtimeEvents[0].payload.preview).toBe('evt-5')
    expect(gameStore.runtimeEvents[199].payload.preview).toBe('evt-204')
  })

  it('records user and assistant turn events as a sidecar without changing generation prompts', async () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = { id: 'project-1', name: 'Alpha', entries: [] }

    const gameStore = useGameStore()
    gameStore.createSession({ title: '钟楼调查', worldbookId: 'project-1' })
    gameStore.chatHistory = [
      { role: 'system', content: '你是叙述者。' },
      { role: 'user', content: '继续。' }
    ]
    gameStore.runtimeEvents = []

    vi.mocked(runGenerationStreamTask).mockImplementation(async ({ callbacks, baseMessages }) => {
      callbacks?.onChunk?.({ content: '暮湾钟楼仍然沉默。' })
      callbacks?.onComplete?.({ content: '暮湾钟楼仍然沉默。' })
      return { content: '暮湾钟楼仍然沉默。', baseMessages }
    })

    await gameStore.sendAction('先去钟楼')

    const sentMessages = vi.mocked(runNarrativeAgentTurn).mock.calls.at(-1)[0].messages
    expect(sentMessages).toBeDefined()

    const sources = gameStore.runtimeEvents.map((event) => event.source)
    expect(sources).toContain('user')
    expect(sources).toContain('assistant')

    const userEvent = gameStore.runtimeEvents.find((event) => event.source === 'user')
    const assistantEvent = gameStore.runtimeEvents.find((event) => event.source === 'assistant')
    expect(userEvent.type).toBe('turn')
    expect(userEvent.payload.preview).toBe('先去钟楼')
    expect(userEvent.payload.hidden).toBe(false)
    expect(assistantEvent.type).toBe('turn')
    expect(assistantEvent.payload.preview).toBe('暮湾钟楼仍然沉默。')
    expect(typeof assistantEvent.payload.messageIndex).toBe('number')

    // Generation prompt must remain sidecar-free (no runtime-event leakage).
    expect(sentMessages.every((message) => !message.content?.includes('runtime'))).toBe(true)

    const messageCountBeforeCancel = gameStore.messages.length
    vi.mocked(runNarrativeAgentTurn).mockImplementationOnce(async ({ signal }) => {
      return new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason)
        if (signal.aborted) abort()
        else signal.addEventListener('abort', abort, { once: true })
      })
    })
    const cancelledGeneration = gameStore.generateAIResponse()
    gameStore.cancelNarrativeGeneration('test-cancel')
    await cancelledGeneration
    expect(gameStore.messages).toHaveLength(messageCountBeforeCancel)
    expect(gameStore.messages.some((message) => message?.isStreaming)).toBe(false)
    expect(gameStore.lastError).toBeNull()
    const productionMetrics = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.NARRATIVE_PRODUCTION_METRICS)
    )
    expect(productionMetrics.events.at(-1)).toMatchObject({
      outcome: 'cancelled',
      errorCode: 'NARRATIVE_AGENT_ABORTED',
      cleanup: {
        renderSettled: true,
        requestReleased: true,
        loadingOwnerSettled: true
      }
    })
  })

  it('seeds a fresh session with plotJournal, runtimeEvents, worldMapState and factionRelations when entering from a history node', () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = { id: 'wb_history', name: 'History World' }

    const gameStore = useGameStore()
    const session = gameStore.createSession({ title: '从历史进入', worldbookId: 'wb_history' })

    // Empty baseline before applying the history patch.
    expect(session.runtimeState.plotJournal).toEqual([])
    expect(session.runtimeState.runtimeEvents).toEqual([])
    expect(session.runtimeState.factionRelations).toEqual({})
    expect(session.runtimeState.worldMapState.currentScene).toBe('')

    const historyPatch = {
      historyNode: {
        id: 'hn_archive_w4',
        title: '雾税账册追溯',
        priorFacts: ['钟楼停摆'],
        unresolvedHooks: ['证人代价'],
        participants: ['苔娜'],
        entryIds: ['e_archive_w4'],
        mapBinding: { scene: '灯痕码头' },
        factionRelations: { 潮盐行会: -8 }
      }
    }

    // Mimic the applyPlayableWorldHistoryPatch flow from OpeningPage.vue.
    const patches = consumePlayableWorldHistoryIntent(historyPatch)
    expect(patches).not.toBeNull()
    if (patches.historyNode) {
      gameStore.setHistoryNode(patches.historyNode)
    }
    if (patches.worldMapPatch) {
      gameStore.saveWorldMapState({ ...gameStore.worldMapState, ...patches.worldMapPatch })
    }
    if (patches.plotJournalEntry) {
      gameStore.appendPlotJournal(patches.plotJournalEntry)
    }
    if (patches.factionRelationsPatch) {
      for (const [name, value] of Object.entries(patches.factionRelationsPatch)) {
        gameStore.setFactionRelation(name, value)
      }
    }
    if (patches.runtimeEvent) {
      gameStore.appendRuntimeEvent(patches.runtimeEvent)
    }

    expect(gameStore.worldMapState.currentScene).toBe('灯痕码头')
    expect(gameStore.historyNode.id).toBe('hn_archive_w4')
    expect(gameStore.factionRelations).toEqual({ 潮盐行会: -8 })
    expect(gameStore.plotJournal).toHaveLength(1)
    expect(gameStore.plotJournal[0]).toMatchObject({
      participants: ['苔娜'],
      locations: ['灯痕码头'],
      unresolvedHooks: ['证人代价']
    })
    expect(gameStore.runtimeEvents).toHaveLength(1)
    expect(gameStore.runtimeEvents[0]).toMatchObject({
      type: 'display_event',
      source: 'runtime',
      payload: expect.objectContaining({
        kind: 'history-node-init',
        historyNodeId: 'hn_archive_w4',
        contextual: false
      })
    })
  })

  it('persists the active history node in the session runtime for later context builds', () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = { id: 'wb_history_runtime', name: 'History Runtime' }

    const gameStore = useGameStore()
    const session = gameStore.createSession({ title: '历史运行时', worldbookId: 'wb_history_runtime' })
    const node = {
      id: 'hn_runtime_1',
      title: '河口封锁',
      participants: ['潮汐行会'],
      entryIds: ['entry-harbor'],
      unresolvedHooks: ['谁下达了封港令'],
      placeRef: { placeId: 'place:wb:map:harbor', name: '雾港' },
      mapBinding: { placeId: 'place:wb:map:harbor', scene: '雾港码头' }
    }

    gameStore.setHistoryNode(node)
    expect(gameStore.historyNode).toMatchObject(node)
    expect(gameStore.getRuntimeSnapshot().historyNode).toMatchObject(node)

    gameStore.loadSession(session.id)
    expect(gameStore.historyNode).toMatchObject(node)
  })

  it('does not mutate the new session when the consumed history intent has no usable historyNode', () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = { id: 'wb_plain', name: 'Plain World' }

    const gameStore = useGameStore()
    gameStore.createSession({ title: '普通进入', worldbookId: 'wb_plain' })

    const patches = consumePlayableWorldHistoryIntent({ historyNode: { id: '   ' } })
    expect(patches).toBeNull()

    // No history patch applied — runtime stays empty.
    expect(gameStore.plotJournal).toEqual([])
    expect(gameStore.runtimeEvents).toEqual([])
    expect(gameStore.factionRelations).toEqual({})
    expect(gameStore.worldMapState.currentScene).toBe('')
  })
})
