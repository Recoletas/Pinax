import { describe, expect, it, vi } from 'vitest'
import { createNarrativeKernelExecutor } from '../services/agents/authoring/narrativeKernelExecutor.js'

// 验收修复 1：Authoring 回合必须真正构建并执行 NarrativeKernel（orchestrator 路径），
// 且内核消费与 UI 左栏/composer 同一份共享现场投影（spec §9/§10）。

const PROJECTION = Object.freeze({
  schemaVersion: 1,
  projectId: 'book-1',
  chapterId: 'ch-9',
  sceneId: 'thread-1',
  revision: 'doc:r1',
  activeUnitId: 'unit-a',
  worldbookStatus: 'bound',
  projectionFingerprint: 'projfp-legacy',
  viewpointCharacter: { id: 'char_lina', name: '莉娜' },
  activeActor: { id: 'char_lina', name: '莉娜' },
  dialogueTarget: null,
  location: { id: 'place_dock', name: '旧港码头', region: '' },
  time: null,
  presentCharacters: [{ id: 'char_edgar', name: '艾德加' }],
  activeRelations: [],
  unresolvedEvents: [],
  emergenceCandidates: [],
  unreadChanges: { characters: 0, location: 0, time: 0, events: 0, emergence: 0 },
  sourceRefs: ['chapter:ch-9', 'map:current-scene']
})

describe('narrative kernel executor', () => {
  it("builds a real kernel that consumes the shared projection and runs it through the orchestrator（合并3例）", async () => {
{
const buildKernel = vi.fn(() => ({ revision: 'nar-1', blocks: [] }))
    const runGeneration = vi.fn(async () => ({ finalText: '守卫在门口停下脚步。' }))
    const buildResourceIndex = vi.fn(() => ({ counts: {} }))
    const createRegistry = vi.fn(() => ({ registry: true }))
    const resolveWorldbook = vi.fn(() => ({ id: 'wb-1', name: '旧港' }))
    const resolveRuntimeState = vi.fn(() => ({
      worldMapState: { placeId: 'stale_place', currentScene: '过期地点' },
      encounteredCharacters: []
    }))

    const executor = createNarrativeKernelExecutor({
      buildKernel,
      runGeneration,
      buildResourceIndex,
      createRegistry
    })
    const result = await executor.executeTurn({
      intentMode: 'advance',
      turn: { kind: 'action', actorId: 'char_lina', instruction: '让莉娜先检查门闩。', directorNote: '节奏放慢', sourceRefs: ['chapter:ch-9'] },
      narrativeContext: {
        messages: [{ id: 'node-1', role: 'assistant', content: '潮水已经漫过第二级台阶。' }],
        sceneSummary: { revision: 'scene-r1', summary: '守卫正在盘查来客。' },
        revision: 'doc-r3'
      },
      projection: PROJECTION,
      settings: { provider: 'test' },
      worldbook: resolveWorldbook(),
      runtimeState: resolveRuntimeState()
    })

    expect(buildKernel).toHaveBeenCalledTimes(1)
    const kernelArgs = buildKernel.mock.calls[0][0]
    expect(kernelArgs).toMatchObject({
      intentMode: 'advance',
      authorNote: '节奏放慢',
      projectId: 'book-1',
      messages: [
        { id: 'node-1', role: 'assistant', content: '潮水已经漫过第二级台阶。' },
        { id: 'authoring-turn:doc-r3', role: 'user', content: '让莉娜先检查门闩。' }
      ],
      sceneSummary: { revision: 'scene-r1', summary: '守卫正在盘查来客。' },
      turnContext: { kind: 'action', actorId: 'char_lina', targetId: '' }
    })
    expect(kernelArgs.sceneProjection).toBe(PROJECTION)
    // 地点以共享投影为准，不用 store 里的过期快照。
    expect(kernelArgs.runtimeState.worldMapState).toMatchObject({ placeId: 'place_dock', currentScene: '旧港码头' })
    expect(createRegistry).toHaveBeenCalled()

    expect(runGeneration).toHaveBeenCalledTimes(1)
    const runArgs = runGeneration.mock.calls[0][0]
    expect(runArgs.kernel).toEqual({ revision: 'nar-1', blocks: [] })
    expect(runArgs.registry).toEqual({ registry: true })
    expect(runArgs.mode).toBe('auto') // advance → orchestrator auto 模式
    expect(runArgs.intent).toBe('respond') // 显式指令必须回应本轮输入，不能退化成泛化推进。
    expect(result.text).toBe('守卫在门口停下脚步。')
}
{
const runGeneration = vi.fn(async () => ({ finalText: '潮水又涨了一截。' }))
    const executor = createNarrativeKernelExecutor({
      buildKernel: () => ({}),
      runGeneration,
      buildResourceIndex: () => ({}),
      createRegistry: () => ({})
    })
    const controller = new AbortController()
    await executor.executeTurn({
      intentMode: 'continue',
      turn: null,
      projection: PROJECTION,
      settings: {},
      worldbook: null,
      runtimeState: {},
      signal: controller.signal
    })
    expect(runGeneration.mock.calls[0][0]).toMatchObject({ mode: 'continue', signal: controller.signal })
}
{
const executor = createNarrativeKernelExecutor({
      buildKernel: () => ({}),
      runGeneration: async () => ({ finalText: '   ' }),
      buildResourceIndex: () => ({}),
      createRegistry: () => ({})
    })
    await expect(executor.executeTurn({
      intentMode: 'continue',
      turn: null,
      projection: PROJECTION,
      settings: {},
      worldbook: null,
      runtimeState: {}
    })).rejects.toMatchObject({ code: 'AGENT_EMPTY_RESULT' })
}
})
})

// —— worldbook scene closure Task 6：绑定世界书 + 冻结现场 ——
import { createNarrativeKernelExecutor as createExecutorForBinding } from '../services/agents/authoring/narrativeKernelExecutor.js'

const V2_PROJECTION = Object.freeze({
  schemaVersion: 2,
  projectId: 'book-1',
  chapterId: 'ch-9',
  activeUnitId: 'unit-a',
  worldbookId: 'wb-bound',
  worldbookStatus: 'bound',
  anchorStatus: 'explicit',
  projectionFingerprint: 'projfp-test-1',
  location: { id: 'place_dock', name: '旧港码头' },
  presentCharacters: [
    { id: 'char-lina', name: '莉娜' },
    { id: 'char-edgar', name: '艾德加' }
  ],
  activeRelations: [],
  unresolvedEvents: []
})

function baseInput(overrides = {}) {
  return {
    intentMode: 'advance',
    turn: {
      kind: 'dialogue',
      actorId: 'char-lina',
      targetId: 'char-edgar',
      instruction: '质问印章来源。',
      directorNote: '',
      sourceRefs: ['chapter:ch-9']
    },
    projection: V2_PROJECTION,
    projectId: 'book-1',
    projectionFingerprint: 'projfp-test-1',
    settings: { provider: 'test' },
    worldbook: { id: 'wb-bound', name: '海港世界' },
    runtimeState: {},
    ...overrides
  }
}

describe('executor consumes the bound worldbook and frozen projection (Task 6)', () => {
  it("passes exactly the bound worldbook, explicit project id and frozen projection into the kernel（合并4例）", async () => {
{
const buildKernel = vi.fn(() => ({}))
    const runGeneration = vi.fn(async () => ({ finalText: '她开口质问。' }))
    const executor = createExecutorForBinding({
      buildKernel,
      runGeneration,
      buildResourceIndex: () => ({}),
      createRegistry: () => ({})
    })
    const result = await executor.executeTurn(baseInput({
      // 全局 active 世界书（wb-other）即使被调用方误传也绝不能进入内核：
      // 合同要求 worldbook 参数就是书绑定的那本。
      runtimeState: { globalActiveWorldbookId: 'wb-other' }
    }))
    expect(result.text).toBe('她开口质问。')
    const kernelArgs = buildKernel.mock.calls[0][0]
    expect(kernelArgs).toMatchObject({
      worldbook: expect.objectContaining({ id: 'wb-bound' }),
      projectId: 'book-1',
      sceneProjection: expect.objectContaining({ activeUnitId: 'unit-a' }),
      turnContext: expect.objectContaining({ actorId: 'char-lina', targetId: 'char-edgar' })
    })
    expect(kernelArgs.worldbook.id).not.toBe('wb-other')
    // 冻结指纹随内核参数一起进入，供请求前后一致性复查。
    expect(kernelArgs.sceneProjection.projectionFingerprint).toBe('projfp-test-1')
}
{
const buildKernel = vi.fn(() => ({}))
    const runGeneration = vi.fn(async () => ({ finalText: '不应发生。' }))
    const executor = createExecutorForBinding({
      buildKernel,
      runGeneration,
      buildResourceIndex: () => ({}),
      createRegistry: () => ({})
    })
    await expect(executor.executeTurn(baseInput({
      projection: { ...V2_PROJECTION, worldbookStatus: 'missing' },
      worldbook: null
    }))).rejects.toMatchObject({ code: 'AUTHORING_WORLDBOOK_MISSING' })
    expect(buildKernel).not.toHaveBeenCalled()
    expect(runGeneration).not.toHaveBeenCalled()
}
{
const runGeneration = vi.fn(async () => ({ finalText: 'x' }))
    const executor = createExecutorForBinding({
      buildKernel: () => ({}),
      runGeneration,
      buildResourceIndex: () => ({}),
      createRegistry: () => ({})
    })
    await expect(executor.executeTurn(baseInput({
      turn: { kind: 'dialogue', actorId: 'char-stranger', targetId: 'char-edgar', instruction: 'x' }
    }))).rejects.toMatchObject({ code: 'AUTHORING_CAST_MEMBER_ABSENT' })
    expect(runGeneration).not.toHaveBeenCalled()
}
{
const runGeneration = vi.fn(async () => ({ finalText: 'x' }))
    const executor = createExecutorForBinding({
      buildKernel: () => ({}),
      runGeneration,
      buildResourceIndex: () => ({}),
      createRegistry: () => ({})
    })
    await expect(executor.executeTurn(baseInput({
      projection: { ...V2_PROJECTION, projectionFingerprint: '' },
      projectionFingerprint: ''
    }))).rejects.toMatchObject({ code: 'AUTHORING_FROZEN_CONTEXT_MISSING' })
    await expect(executor.executeTurn(baseInput({
      projection: { ...V2_PROJECTION, activeUnitId: null }
    }))).rejects.toMatchObject({ code: 'AUTHORING_FROZEN_CONTEXT_MISSING' })
    expect(runGeneration).not.toHaveBeenCalled()
}
})

  it("lets an intentionally unbound book proceed with worldbook:null（合并2例）", async () => {
{
const buildKernel = vi.fn(() => ({}))
    const runGeneration = vi.fn(async () => ({ finalText: '继续的一拍。' }))
    const executor = createExecutorForBinding({
      buildKernel,
      runGeneration,
      buildResourceIndex: () => ({}),
      createRegistry: () => ({})
    })
    const result = await executor.executeTurn(baseInput({
      projection: { ...V2_PROJECTION, worldbookStatus: 'unbound', worldbookId: null },
      worldbook: null
    }))
    expect(result.ok).toBeUndefined()
    expect(result.text).toBe('继续的一拍。')
    expect(buildKernel.mock.calls[0][0].worldbook).toBe(null)
}
{
const runGeneration = vi.fn(async () => ({ finalText: 'x' }))
    const executor = createExecutorForBinding({
      buildKernel: () => ({}),
      runGeneration,
      buildResourceIndex: () => ({}),
      createRegistry: () => ({})
    })
    await expect(executor.executeTurn(baseInput({
      projection: { ...V2_PROJECTION, chapterId: null, projectId: null },
      projectId: ''
    }))).rejects.toMatchObject({ code: 'AUTHORING_CONTEXT_MISSING' })
    expect(runGeneration).not.toHaveBeenCalled()
}
})
})

describe('kernel input excludes Experience session state (复验修复 2)', () => {
  it('never passes a sceneThread from runtimeState into the kernel', async () => {
    const buildKernel = vi.fn(() => ({}))
    const runGeneration = vi.fn(async () => ({ finalText: '正文。' }))
    const executor = createExecutorForBinding({
      buildKernel,
      runGeneration,
      buildResourceIndex: () => ({}),
      createRegistry: () => ({})
    })
    await executor.executeTurn(baseInput({
      runtimeState: { sceneThread: { id: 'thread-legacy' }, historyNode: 'node-legacy' }
    }))
    const kernelArgs = buildKernel.mock.calls[0][0]
    expect(kernelArgs).not.toHaveProperty('sceneThread')
    expect(JSON.stringify(kernelArgs)).not.toContain('thread-legacy')
  })
})
