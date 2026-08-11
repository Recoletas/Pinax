import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../stores/gameStore'
import {
  runGenerationTask,
  runGenerationStreamTask,
  runNarrativeAgentTurn
} from '../services/generationService'
import {
  createNarrativeTurnRecord,
  commitNarrativeTurnRecord
} from '../../shared/narrativeTurnContract.js'
import { createDestructiveRegenerateFixture, createEmptySessionFixture, createRegularSessionFixture, createLongSessionFixture, createToolCallSessionFixture, createStreamingFailureFixture, createOnlineSessionFixture } from './fixtures/narrativeTurnFixtures'

// 回合事务与非破坏性重试回归测试。
// 见 docs/superpowers/plans/2026-08-11-sillytavern-experience-parity.md R1。
// 覆盖：regenerate 回滚 state、保留旧消息、分支切换恢复 post snapshot。

vi.mock('../services/api', () => ({
  default: { post: vi.fn(() => Promise.resolve({ data: {} })) },
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

describe('回合事务与非破坏性重试', () => {
  let gameStore

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.mocked(runNarrativeAgentTurn).mockReset()
    vi.mocked(runNarrativeAgentTurn).mockResolvedValue({
      kind: 'final_ready',
      text: '你回到了城镇入口。',
      calls: [],
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    })
    gameStore = useGameStore()
  })

  afterEach(() => vi.restoreAllMocks())

  // 构造"已提交 turn2 + 残留 post state"的通用场景
  function setupResidualTurn(fixture) {
    const turnRecord = createNarrativeTurnRecord({
      id: 'narrative_turn2',
      parentTurnId: 'narrative_turn1',
      preRuntimeSnapshot: fixture.preTurnTwoSnapshot,
      userMessageIds: ['msg_u2'],
      branchId: 'main',
    })
    commitNarrativeTurnRecord(turnRecord, {
      assistantMessageIds: ['msg_a2'],
      postRuntimeSnapshot: fixture.postTurnTwoState,
    })
    gameStore.messages = fixture.messages.map((m) => ({ ...m }))
    const post = fixture.postTurnTwoState
    gameStore.worldMapState = { ...post.worldMapState }
    gameStore.writingTime = { ...post.writingTime }
    gameStore.runtimeEvents = post.runtimeEvents.map((e) => ({ ...e }))
    gameStore.turnRecords = { narrative_turn2: turnRecord }
    gameStore.useAI = false
    return turnRecord
  }

  it('regenerate 回滚完整 runtime state（地点/时间/事件）且保留旧消息', async () => {
    const fixture = createDestructiveRegenerateFixture()
    const turnRecord = setupResidualTurn(fixture)

    // 当前是 a2 残留的 state
    expect(gameStore.worldMapState.currentScene).toBe('酒馆')
    expect(gameStore.writingTime.day).toBe(3)
    expect(gameStore.runtimeEvents.length).toBe(4)

    await gameStore.regenerateFrom(2)

    // 回滚到 turn2 开始前的快照
    expect(gameStore.worldMapState.currentScene).toBe('城镇入口')
    expect(gameStore.writingTime.day).toBe(1)
    expect(gameStore.runtimeEvents.length).toBe(2)
    // 旧消息保留（不截断），切到新分支
    expect(gameStore.messages.length).toBe(4)
    expect(gameStore.activeBranchId).not.toBe('main')
    expect(turnRecord.oldBranchAssistantId).toBe('msg_a2')
  })

  it('regenerate 后 displayMessages 只显示新分支（前缀可见、旧回复隐藏）', async () => {
    const fixture = createDestructiveRegenerateFixture()
    setupResidualTurn(fixture)

    await gameStore.regenerateFrom(2)
    const newBranchId = gameStore.activeBranchId
    gameStore.messages.push({ id: 'msg_new_a2', role: 'assistant', content: '新回复', branchId: newBranchId })

    const displayable = gameStore.messages.filter(
      (m) => !m.superseded && (!m.branchId || m.branchId === gameStore.activeBranchId)
    )
    expect(displayable.map((m) => m.id)).not.toContain('msg_a2')  // 旧回复被 superseded 隐藏
    expect(displayable.map((m) => m.id)).toContain('msg_new_a2')  // 新回复可见
    expect(displayable.map((m) => m.id)).toContain('msg_u1')      // 共享前缀可见
  })

  it('switchBranch 切回旧分支：post snapshot 恢复 + superseded 重算', async () => {
    const fixture = createDestructiveRegenerateFixture()
    setupResidualTurn(fixture)

    // 模拟已 regenerate 到新分支：state 回滚到 pre（城镇入口/day1），activeBranchId 是新分支
    gameStore.worldMapState = { ...fixture.preTurnTwoSnapshot.worldMapState }
    gameStore.writingTime = { ...fixture.preTurnTwoSnapshot.writingTime }
    gameStore.activeBranchId = 'branch_new'
    expect(gameStore.worldMapState.currentScene).toBe('城镇入口')

    gameStore.switchBranch('main')

    // post snapshot 恢复（a2 版本）
    expect(gameStore.worldMapState.currentScene).toBe('酒馆')
    expect(gameStore.writingTime.day).toBe(3)
    expect(gameStore.activeBranchId).toBe('main')
    // postRuntimeSnapshot 正确保存（并入本测试，不单独开用例）
    const turn = gameStore.turnRecords['narrative_turn2']
    expect(turn.postRuntimeSnapshot).toBeDefined()
  })

  it('R6: executeExperienceAction 统一分发 —— speaker/compress/未知动作', async () => {
    // speaker：手动点名角色
    const speakerResult = await gameStore.executeExperienceAction({ type: 'speaker', payload: { name: '林舟' } })
    expect(speakerResult.ok).toBe(true)
    expect(gameStore.dialogueCharacter.name).toBe('林舟')

    // director-note：设置仅下一轮导演注
    const noteResult = await gameStore.executeExperienceAction({ type: 'director-note', payload: { text: '让气氛更紧张' } })
    expect(noteResult.ok).toBe(true)
    expect(gameStore.pendingDirectorNote).toBe('让气氛更紧张')

    // compress：正常执行（不抛错）
    const compressResult = await gameStore.executeExperienceAction({ type: 'compress' })
    expect(compressResult.ok).toBe(true)

    // 未知动作 → typed error
    const unknownResult = await gameStore.executeExperienceAction({ type: 'fly-to-moon' })
    expect(unknownResult.ok).toBe(false)
    expect(unknownResult.error).toBe('UNKNOWN_ACTION')
  })

  it('P2-7: 六类体验 fixture 结构完整（验收证据）', () => {
    // 1. 空会话
    const empty = createEmptySessionFixture()
    expect(empty.messages).toEqual([])
    expect(empty.activeBranchId).toBe('main')
    // 2. 常规会话
    const regular = createRegularSessionFixture()
    expect(regular.messages.length).toBe(4)
    expect(regular.runtimeEvents.length).toBe(4)
    // 3. 长会话（可指定轮数）
    const long = createLongSessionFixture(40)
    expect(long.messages.length).toBe(80)
    expect(long.runtimeEvents.length).toBe(80)
    // 4. 工具调用会话
    const tool = createToolCallSessionFixture()
    expect(tool.toolCalls.length).toBe(2)
    expect(tool.toolCalls.every((call) => typeof call.ok === 'boolean')).toBe(true)
    // 5. 流式失败会话
    const fail = createStreamingFailureFixture()
    expect(fail.preFailureSnapshot.worldMapState.currentScene).toBe('森林边缘')
    // 6. 联机会话
    const online = createOnlineSessionFixture()
    expect(online.memberRequestCounts['member-host']).toBe(1)
    expect(online.memberRequestCounts['member-a']).toBe(0)
    expect(online.events[online.events.length - 1].type).toBe('narrative.completed')
  })
})
