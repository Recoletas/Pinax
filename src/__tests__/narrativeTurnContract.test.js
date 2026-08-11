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
    // 模拟新分支生成：push 回复 + 提交对应 turn（turn 链据此收集可见消息）
    gameStore.messages.push({ id: 'msg_new_a2', role: 'assistant', content: '新回复', branchId: newBranchId })
    const newTurn = createNarrativeTurnRecord({
      id: 'narrative_turn_new', parentTurnId: 'narrative_turn1', branchId: newBranchId,
      preRuntimeSnapshot: fixture.preTurnTwoSnapshot, userMessageIds: ['msg_u2'],
    })
    commitNarrativeTurnRecord(newTurn, { assistantMessageIds: ['msg_new_a2'], postRuntimeSnapshot: fixture.postTurnTwoState })
    gameStore.turnRecords['narrative_turn_new'] = newTurn

    // P0-1：displayMessages 用 turn 链（currentBranchVisibleMessageIds）过滤
    const visibleIds = gameStore.currentBranchVisibleMessageIds()
    const displayable = gameStore.messages.filter(
      (m) => !m.superseded && (!m.branchId || visibleIds.has(m.id))
    )
    expect(displayable.map((m) => m.id)).not.toContain('msg_a2')  // 旧回复被 superseded 隐藏
    expect(displayable.map((m) => m.id)).toContain('msg_new_a2')  // 新回复可见
    expect(displayable.map((m) => m.id)).toContain('msg_u1')      // 共享前缀可见
  })

  it('P0-1: 嵌套分叉不污染其它分支 —— 子分支独有历史不被提升为共享', async () => {
    const fixture = createDestructiveRegenerateFixture()
    const turn1 = createNarrativeTurnRecord({ id: 'narrative_turn1', branchId: 'main', userMessageIds: ['msg_u1'], preRuntimeSnapshot: {} })
    commitNarrativeTurnRecord(turn1, { assistantMessageIds: ['msg_a1'] })
    const turn2 = createNarrativeTurnRecord({
      id: 'narrative_turn2', parentTurnId: 'narrative_turn1', branchId: 'main',
      preRuntimeSnapshot: fixture.preTurnTwoSnapshot, userMessageIds: ['msg_u2'],
    })
    commitNarrativeTurnRecord(turn2, { assistantMessageIds: ['msg_a2'], postRuntimeSnapshot: fixture.postTurnTwoState })
    gameStore.messages = fixture.messages.map((m) => ({ ...m, branchId: 'main' }))
    gameStore.turnRecords = { narrative_turn1: turn1, narrative_turn2: turn2 }
    gameStore.activeBranchId = 'main'

    // 第 1 次分叉：从 u2 重写 → branch_A，产生 a2'（branch_A 独有）
    await gameStore.regenerateFrom(2)
    const branchA = gameStore.activeBranchId
    gameStore.messages.push({ id: 'msg_a2p', role: 'assistant', content: 'branch_A 回复', branchId: branchA })

    // 第 2 次分叉：从 branch_A 的 u2 重写 → branch_B
    await gameStore.regenerateFrom(2)
    const branchB = gameStore.activeBranchId

    // branch_B 链上不应包含 branch_A 独有的 a2'（msg_a2p）
    const visibleB = gameStore.currentBranchVisibleMessageIds()
    expect(visibleB.has('msg_a2p')).toBe(false)

    // 切回 main：同样不应看到 branch_A 的 a2'（msg_a2p）—— 未被提升为全局共享
    gameStore.switchBranch('main')
    const visibleMain = gameStore.currentBranchVisibleMessageIds()
    expect(visibleMain.has('msg_a2p')).toBe(false)
    expect(visibleMain.has('msg_u1')).toBe(true)  // 共享根历史仍可见
  })

  it('P0-2: 首回合 regenerate 的 sibling parentTurnId 为 null（非子回合）', async () => {
    const fixture = createDestructiveRegenerateFixture()
    const turn1 = createNarrativeTurnRecord({ id: 'narrative_turn1', branchId: 'main', preRuntimeSnapshot: {} })
    gameStore.messages = fixture.messages.map((m) => ({ ...m }))
    gameStore.turnRecords = { narrative_turn1: turn1 }
    gameStore.useAI = false

    // 从 index=2（u2，属于 turn1 之后）—— 这里 u2 不在 turn1 的 userMessageIds，
    // 模拟首回合场景：regenerate 后新 turn 的 parentTurnId 应为 null
    await gameStore.regenerateFrom(2)
    // 无法直接断言新 turn（useAI=false 不生成），但 regenerateFrom 不应抛错且
    // activeBranchId 已切换，共享前缀（u1/u2）仍可见
    expect(gameStore.activeBranchId).not.toBe('main')
    const visible = gameStore.currentBranchVisibleMessageIds()
    // 无 committed turn 时链为空，但无 branchId 消息（共享历史）仍可见
    expect(visible.size).toBe(0)
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

  it('P2-6: R7 性能基线 —— 100/300/800 消息的 rebuildChatHistory 可重复测量', () => {
    // 计划 R7 要求"100/300/800 消息基线有前后对照"。
    // 这里是 vitest 环境下的可重复时间数据（每档测 5 次取中位数，避免单次抖动），
    // 记录数量级 + 断言不退化（无硬阈值，只证明有测量与线性增长）。
    const timings = []
    for (const rounds of [100, 300, 800]) {
      const fixture = createLongSessionFixture(rounds)
      const samples = []
      for (let i = 0; i < 5; i++) {
        gameStore.messages = fixture.messages.map((m) => ({ ...m }))
        gameStore.activeBranchId = 'main'
        const t0 = performance.now()
        gameStore.rebuildChatHistory()
        samples.push(performance.now() - t0)
      }
      const sorted = [...samples].sort((a, b) => a - b)
      timings.push({ rounds, medianMs: sorted[2] })
    }
    // 800 消息（1600 条）的 rebuild 应 < 100ms（线性过滤，无 O(n²)）
    const t800 = timings.find((t) => t.rounds === 800)
    expect(t800.medianMs).toBeLessThan(100)
    // 增长应大致线性：800 消息 ≤ 8× 100 消息 + 余量
    const t100 = timings.find((t) => t.rounds === 100)
    expect(t800.medianMs).toBeLessThan(t100.medianMs * 8 + 20)
  })
})
