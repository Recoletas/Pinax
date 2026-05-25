import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../stores/gameStore'
import { useWorldStore } from '../stores/worldStore'
import { getItem, STORAGE_KEYS } from '../composables/useStorage'

vi.mock('../services/api', () => ({
  sendAction: vi.fn(),
  getState: vi.fn(),
  buildContextMessage: vi.fn(() => null),
  sendChatStream: vi.fn(),
  recordMemory: vi.fn()
}))

describe('gameStore sessions', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
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
})
