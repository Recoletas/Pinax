import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../stores/gameStore'
import { useWorldStore } from '../stores/worldStore'
import { getItem, STORAGE_KEYS } from '../composables/useStorage'
import { createMemoryCandidate } from '../services/memoryCandidates'
import { runGenerationStreamTask } from '../services/generationService'
import { seedWorldbookPresets } from '../services/seedWorldbookPresets'

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
    expect(gameStore.dialogueMode).toBe(true)
    expect(gameStore.dialogueCharacter?.name).toBe('路人甲')
    expect(gameStore.playerCharacter.avatar).toBe('avatar.png')
    expect(gameStore.aiCharacter.name).toBe('叙述者')
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
