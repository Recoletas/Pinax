import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../stores/gameStore'
import { useWorldStore } from '../stores/worldStore'
import { getItem, STORAGE_KEYS } from '../composables/useStorage'
import { createMemoryCandidate } from '../services/memoryCandidates'
import { listNarrativeAssets } from '../services/narrativeAssets'
import { runGenerationTask, runGenerationStreamTask } from '../services/generationService'
import { seedWorldbookPresets } from '../services/seedWorldbookPresets'
import { listStoryboardDocuments } from '../services/storyboardStore'

vi.mock('../services/api', () => ({
  default: {
    post: vi.fn(() => Promise.resolve({ data: {} }))
  },
  sendAction: vi.fn(),
  getState: vi.fn(),
  buildContextMessage: vi.fn(() => null),
  recordMemory: vi.fn(),
  getOrCreatePreferenceUserId: vi.fn(() => 'user-test')
}))

vi.mock('../services/generationService', () => ({
  runGenerationTask: vi.fn(),
  runGenerationStreamTask: vi.fn()
}))

describe('gameStore sessions', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.mocked(runGenerationTask).mockReset()
    vi.mocked(runGenerationStreamTask).mockReset()
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
  })

  it('persists runtime edits into the active session and restores them on load', () => {
    const worldStore = useWorldStore()
    worldStore.activeWorldbook = { id: 'wb_alpha', name: 'Alpha' }

    const gameStore = useGameStore()
    const session = gameStore.createSession({ title: '第一章' })

    gameStore.messages = [{ role: 'assistant', content: '开场白', timestamp: 1 }]
    gameStore.chatHistory = [
      { role: 'system', content: '系统提示' },
      { role: 'assistant', content: '开场白' }
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

  it('injects scoped active memories into generation context', async () => {
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

    vi.mocked(runGenerationStreamTask).mockImplementation(async ({ callbacks }) => {
      callbacks?.onComplete?.({ content: '' })
      return { content: '' }
    })

    await gameStore.generateAIResponse()

    const streamTask = vi.mocked(runGenerationStreamTask).mock.calls[0][0]
    const sentMessages = streamTask.baseMessages
    const memoryMessage = sentMessages.find((message) => message.content?.includes('【已确认记忆】'))

    expect(streamTask.taskType).toBe('narrative.continue')
    expect(memoryMessage?.content).toContain('旧书店在西街。')
    expect(memoryMessage?.content).toContain('玩家刚拿到铜钥匙。')
    expect(memoryMessage?.content).not.toContain('其他作品记忆')
    expect(memoryMessage?.content).not.toContain('待确认记忆')
    expect(gameStore.lastMemoryContext).toBe(memoryMessage?.content)
  })

  it('starts playable seed worlds with starter worldbook context on narrative init', async () => {
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

    vi.mocked(runGenerationStreamTask).mockImplementation(async ({ callbacks }) => {
      callbacks?.onChunk?.({ content: '暮湾钟楼仍然沉默。' })
      callbacks?.onComplete?.({ content: '暮湾钟楼仍然沉默。' })
      return { content: '暮湾钟楼仍然沉默。' }
    })

    await gameStore.generateAIResponse()

    const streamTask = vi.mocked(runGenerationStreamTask).mock.calls[0][0]
    const worldbookMessage = streamTask.baseMessages.find((message) => message.content?.includes('【世界书：边境王国 · 雾潮暮湾】'))

    expect(streamTask.taskType).toBe('narrative.init')
    expect(streamTask.generationOptions.max_tokens).toBe(1500)
    expect(worldbookMessage?.content).toContain('开场困境')
    expect(worldbookMessage?.content).toContain('暮湾主城')
    expect(worldbookMessage?.content).toContain('潮盐行会')
    expect(worldbookMessage?.content).toContain('钟楼停摆事件')
    expect(worldbookMessage?.content).toContain('黎明前的钟楼调查')
    expect(gameStore.lastWorldbookContext.matchedEntries.some((entry) => entry.matchReason === 'starter')).toBe(true)
  })
})
