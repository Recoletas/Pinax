import { beforeEach, describe, expect, it, vi } from 'vitest'
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

// Phase 4 compiler and ownership gates are colocated here to preserve the repository's 20-file test budget.
import {
  buildAuthorOverrideCandidate,
  normalizeContextCandidate,
  normalizeContextCandidates
} from '../services/agents/context/contextCandidateContract.js'
import {
  compileWritingContext,
  COMPILER_PROFILES,
  createWritingContextManifestFingerprint,
  evaluateEligibility
} from '../services/agents/context/writingContextCompiler.js'
import {
  buildModelCallReceipt,
  reconcileManifestWithReceipt
} from '../services/agents/context/contextReceipt.js'
import { buildNarrativeKernel } from '../services/agents/narrativeKernel.js'
import { narrativeTranscriptStaticOverheadChars,
  serializeKernelWithinTextPartBudget,
  serializeNarrativeKernelForProvider } from '../services/agents/narrativeAgentOrchestrator.js'
import {
  aggregateWritingFactIndexes,
  buildContinuitySummaryRequest,
  buildUnitFactIndex,
  buildWritingFactTaskView,
  commitContinuityProjection,
  queryWritingFacts
} from '../services/agents/context/writingFactIndex.js'
import {
  CONTEXT_RUN_BUDGETS,
  classifyContextRunOutcome,
  createContextRunBudget
} from '../services/agents/context/contextRunBudget.js'
import { collectWritingContextDependencyRevisions, discoverCrossChapterContext } from '../services/agents/context/crossChapterContext.js'
import { buildWritingContextCandidates } from '../services/agents/context/writingContextReaders.js'
import { isContextManifestStale, reconcileManifestDependencies } from '../services/agents/context/contextManifestLifecycle.js'
import {
  claimWritingGhostCandidate,
  createWritingGhostCandidate,
  selectWritingGhostText,
  validateWritingGhostCandidate
} from '../services/agents/authoring/writingGhostCandidate.js'
import {
  canRedoWritingAdoptionDeltas,
  canUndoWritingAdoptionDeltas,
  prepareWritingAdoptionDeltas
} from '../services/agents/authoring/writingAdoptionTransaction.js'
import { createAdoptionImpactProjection } from '../services/agents/authoring/authoringAdoptionImpactProjection.js'
import {
  buildCanvasAuthoringReference,
  createExperienceSceneIntent,
  createExperienceSuggestionExploration,
  migrateWritingNotesToExplorations
} from '../services/writing/authoringPeripheralBridge.js'
import { buildChineseQuoteInsertion } from '../services/writing/writingChineseInput.js'
import { createAuthoringRunSession } from '../services/agents/authoring/authoringRunSession.js'
import { createAuthoringRunSessionAdapter } from '../services/agents/authoring/authoringRunSessionAdapter.js'
import {
  addAuthoringRunReferenceSelection,
  buildAuthoringRunReferenceCatalog,
  reconcileAuthoringRunReferenceSelections,
  toAuthoringRunReferences
} from '../services/agents/authoring/authoringRunReferenceSelection.js'
import {
  collectAuthoringSceneRunIntentEffects,
  createAuthoringSceneRunIntent
} from '../services/agents/authoring/authoringSceneRunIntents.js'
import { authoringRunReferenceRevision } from '../services/agents/context/authoringRunContextReaders.js'
import { collectAuthoringRunDependencyRevisions } from '../services/agents/context/authoringRunContextDependencies.js'
import { createManifestAuthorizedNarrativeIndex } from '../services/agents/context/manifestToolAuthorization.js'
import { createNarrativeAsset } from '../services/narrativeAssets.js'
import { createMemoryCandidate } from '../services/memoryCandidates.js'

// 文本工作台 v3 Phase 4：Context ownership closure 合同。
// 0/6 实验六项失败的单元级回归：资格先于评分、时间隔离、冲突集、
// 表示/预算、receipt 从实际序列化产生并可对账。

function makeCandidate(overrides = {}) {
  return normalizeContextCandidate({
    id: 'cand-1',
    kind: 'manuscript-unit',
    projectId: 'book-1',
    sourceAuthority: 'canonical-manuscript',
    narrativeStatus: 'fact',
    temporalRelation: 'before-target',
    scope: 'chapter',
    position: { chapterId: 'ch-1', chapterOrder: 0 },
    reason: '前文',
    representations: { full: '第一单元正文。' },
    revision: 'rev-1',
    ...overrides
  })
}

describe('context candidate contract', () => {
  it('normalizes candidates with conservative axis fallbacks and drops empty ones', () => {
    const candidate = makeCandidate({ temporalRelation: 'bogus', narrativeStatus: 'bogus' })
    expect(candidate.temporalRelation).toBe('unknown')
    expect(candidate.narrativeStatus).toBe('hypothesis')
    expect(candidate.estimatedChars).toBe(7)
    // 无任何表示 → 候选无效。
    expect(normalizeContextCandidate({ kind: 'worldbook-entry', representations: {} })).toBe(null)
    expect(normalizeContextCandidate({ representations: { full: 'x' } })).toBe(null)
    expect(normalizeContextCandidate({ kind: 'author-note', representations: { full: '无稳定身份' } })).toBe(null)
    expect(normalizeContextCandidates([null, makeCandidate()])).toHaveLength(1)
  })
})

describe('writing context compiler — eligibility before scoring', () => {
  const target = { chapterId: 'ch-5', unitId: 'u-5' }

  it('excludes rejected / after-target / temporal-unknown before any budget math', () => {
    const rejected = evaluateEligibility(makeCandidate({ narrativeStatus: 'rejected', estimatedChars: 1 }), { taskKind: 'manuscript', targetChapterId: 'ch-5' })
    expect(rejected).toMatchObject({ eligible: false, reason: 'rejected-never-enters' })

    const afterTarget = evaluateEligibility(makeCandidate({
      id: 'ch10', temporalRelation: 'after-target', position: { chapterId: 'ch-10' }, estimatedChars: 1
    }), { taskKind: 'manuscript', targetChapterId: 'ch-5' })
    expect(afterTarget).toMatchObject({ eligible: false, reason: 'after-target-excluded' })

    const unknown = evaluateEligibility(makeCandidate({
      temporalRelation: 'unknown', estimatedChars: 1
    }), { taskKind: 'manuscript', targetChapterId: 'ch-5' })
    expect(unknown).toMatchObject({ eligible: false, reason: 'temporal-unknown-fail-closed' })
  })

  it('lets a pinned after-target source enter as intended reference, visibly', () => {
    const verdict = evaluateEligibility(makeCandidate({
      id: 'ch10-pinned', temporalRelation: 'after-target', pinned: true
    }), { taskKind: 'manuscript', targetChapterId: 'ch-5' })
    expect(verdict).toMatchObject({
      eligible: true,
      reason: 'pinned-intended-reference',
      candidatePatch: { narrativeStatus: 'intent', intendedReference: true }
    })
  })

  it('compiles a manifest where after-target and rejected never appear, alternatives only for exploration', () => {
    const candidates = [
      makeCandidate({ id: 'before-1', representations: { full: '第一章伏笔：石柱的裂缝。' } }),
      makeCandidate({ id: 'after-1', temporalRelation: 'after-target', position: { chapterId: 'ch-10' }, representations: { full: '第十章揭晓：海中之物。' } }),
      makeCandidate({ id: 'rejected-1', narrativeStatus: 'rejected', representations: { full: '被否决的走向。' } }),
      makeCandidate({
        id: 'alt-1', kind: 'exploration-doc', narrativeStatus: 'alternative',
        sourceAuthority: 'author-adopted', representations: { full: '艾德加视角草稿。' }
      })
    ]
    const manifest = compileWritingContext({ candidates, target, profile: 'inline-fast', taskKind: 'manuscript' })
    const ids = manifest.blocks.map((block) => block.candidateId)
    expect(ids).toContain('before-1')
    expect(ids).not.toContain('after-1')
    expect(ids).not.toContain('rejected-1')
    expect(ids).not.toContain('alt-1')
    expect(manifest.excluded.map((item) => item.candidateId)).toContain('after-1')
    // 指纹随目标/预算/块变化。
    const other = compileWritingContext({ candidates, target: { chapterId: 'ch-6' }, profile: 'inline-fast', taskKind: 'manuscript' })
    expect(other.fingerprint).not.toBe(manifest.fingerprint)
  })

  it('keeps total chars within the profile budget and honors maxItems', () => {
    const candidates = Array.from({ length: 12 }, (_, index) => (
      makeCandidate({ id: `unit-${index}`, representations: { full: 'x'.repeat(400) }, estimatedChars: 400 })
    ))
    const manifest = compileWritingContext({ candidates, target, profile: 'inline-fast', taskKind: 'manuscript' })
    expect(manifest.totalChars).toBeLessThanOrEqual(COMPILER_PROFILES['inline-fast'].totalChars)
    expect(manifest.blocks.length).toBeLessThanOrEqual(COMPILER_PROFILES['inline-fast'].maxItems)
    expect(manifest.excluded.length).toBeGreaterThan(0)
  })

  it('falls back to an excerpt that fits instead of dropping an oversized full representation', () => {
    const manifest = compileWritingContext({
      candidates: [makeCandidate({
        id: 'large-with-excerpt',
        representations: { full: 'x'.repeat(4000), excerpt: '可用摘录。' },
        estimatedChars: 4000
      })],
      target,
      profile: 'inline-fast',
      taskKind: 'manuscript'
    })
    expect(manifest.blocks[0]).toMatchObject({ candidateId: 'large-with-excerpt', representation: 'excerpt', text: '可用摘录。' })
  })

  it('deduplicates stable candidate identities before budget packing', () => {
    const duplicate = makeCandidate({ id: 'same-source' })
    const manifest = compileWritingContext({ candidates: [duplicate, duplicate], target, profile: 'inline-fast' })
    expect(manifest.candidateReport.discovered).toBe(1)
    expect(manifest.blocks).toHaveLength(1)
  })

  it('reads all inline rich-text children and preserves opaque source revisions', () => {
    const candidates = buildWritingContextCandidates({
      projectId: 'book-1',
      chapterId: 'ch-1',
      targetUnitId: 'unit-1',
      document: {
        revision: 7,
        content: [{
          attrs: { unitId: 'unit-1', unitRevision: 2 },
          content: [{ content: [{ text: '前' }, { text: '半', marks: [{ type: 'bold' }] }, { text: '句' }] }]
        }]
      },
      sceneProjection: {
        projectionFingerprint: 'scene-fp-7',
        viewpointCharacter: { name: '莉娜' },
        presentCharacters: [{ name: '艾德加' }]
      },
      matchedEntries: [{
        id: 'entry-1',
        content: '设定。',
        updatedAt: '2026-08-26T09:00:00.000Z',
        matchReason: 'current-scene'
      }]
    })
    expect(candidates.find((item) => item.kind === 'manuscript-unit')).toMatchObject({
      id: 'unit:ch-1:unit-1',
      representations: { full: '前半句' }
    })
    expect(candidates.find((item) => item.kind === 'worldbook-entry').revision)
      .toBe('entry-r2026-08-26T09:00:00.000Z')
    expect(candidates.find((item) => item.kind === 'worldbook-entry')).toMatchObject({
      reason: '当前场精确引用',
      attentionPriority: 99
    })
    expect(candidates.find((item) => item.kind === 'scene-projection')).toMatchObject({
      revision: 'scene-fp-7',
      dependencyRevisions: { 'scene-projection': 'scene-fp-7' }
    })
    expect(candidates.find((item) => item.kind === 'scene-projection').representations.full)
      .toContain('视角：莉娜')
  })

  it('resolves conflict sets by authority and reports unresolved low-authority winners', () => {
    const candidates = [
      makeCandidate({
        id: 'manuscript-fact', claimKey: 'lina:swim',
        representations: { full: '莉娜五岁就会游泳。（正文）' }
      }),
      makeCandidate({
        id: 'worldbook-says', kind: 'worldbook-entry', sourceAuthority: 'imported-reference',
        claimKey: 'lina:swim', representations: { full: '莉娜怕水，不会游泳。（世界书）' }
      }),
      makeCandidate({
        id: 'memory-says', kind: 'memory', sourceAuthority: 'accepted-derived',
        claimKey: 'lina:swim', representations: { full: '记忆：莉娜游泳比赛获奖。' }
      })
    ]
    const manifest = compileWritingContext({ candidates, target, profile: 'narrative-long', taskKind: 'manuscript' })
    // canonical fact(7) 胜出整组；低权威败者进排除清单，胜者权威 ≥5 → 无 unresolved。
    const winner = manifest.blocks.find((block) => block.candidateId === 'manuscript-fact')
    expect(winner).toBeTruthy()
    expect(manifest.excluded.map((item) => item.candidateId)).toContain('worldbook-says')
    expect(manifest.unresolvedConflicts).toHaveLength(0)

    // 无高权威成员的冲突集：世界书(3) vs 记忆(4) → 记忆胜出但 unresolved 报告。
    const weakSet = [
      makeCandidate({
        id: 'worldbook-says', kind: 'worldbook-entry', sourceAuthority: 'imported-reference',
        claimKey: 'edgar:fear', representations: { full: '艾德加怕水。（世界书）' }
      }),
      makeCandidate({
        id: 'memory-says', kind: 'memory', sourceAuthority: 'accepted-derived',
        claimKey: 'edgar:fear', representations: { full: '记忆：艾德加不怕水。' }
      })
    ]
    const weakManifest = compileWritingContext({ candidates: weakSet, target, profile: 'narrative-long', taskKind: 'manuscript' })
    expect(weakManifest.unresolvedConflicts).toHaveLength(1)
    expect(weakManifest.unresolvedConflicts[0].claimKey).toBe('edgar:fear')
  })
})

describe('model call receipt — produced from actual serialization', () => {
  const target = { chapterId: 'ch-5', unitId: 'u-5' }
  it('records inclusion/cut per declared block and reconciles against the manifest', () => {
    const candidates = [
      makeCandidate({ id: 'keep', representations: { full: '完整序列化的块。' } }),
      makeCandidate({ id: 'cut', representations: { full: 'x'.repeat(100) }, estimatedChars: 100 })
    ]
    const manifest = compileWritingContext({ candidates, target, profile: 'manual-short', taskKind: 'manuscript' })
    // runtime 只序列化了其中一块，且另一块被截断。
    const receipt = buildModelCallReceipt({
      manifest,
      serializedBlocks: { keep: '完整序列化的块。', cut: 'xx' },
      usage: { inputTokens: 30, outputTokens: 10, totalTokens: 40 },
      provider: 'test', model: 'test-model'
    })
    expect(receipt.entries).toHaveLength(2)
    const cutEntry = receipt.entries.find((entry) => entry.candidateId === 'cut')
    expect(cutEntry.cut).toBe(true)
    expect(receipt.tokens).toMatchObject({ total: 40, source: 'provider' })

    const issues = reconcileManifestWithReceipt(manifest, receipt)
    expect(issues.some((issue) => issue.issue === 'serialized-truncated')).toBe(true)
    expect(issues.some((issue) => issue.issue === 'fingerprint-mismatch')).toBe(false)

    const longText = '长'.repeat(5000)
    const longManifest = {
      fingerprint: 'manifest-long',
      blocks: [{
        candidateId: 'long', kind: 'manuscript-unit', representation: 'full',
        sourceRefs: ['writing-unit:long'], sourceAuthority: 'canonical-prose',
        chars: longText.length, text: longText
      }],
      excluded: [{ candidateId: 'compiler-cut', reason: 'budget-excluded' }]
    }
    const kernelSerialization = serializeNarrativeKernelForProvider({
      revision: 'nar-long',
      blocks: [{
        kind: 'compiled-context',
        content: {
          manifestFingerprint: longManifest.fingerprint,
          entries: [{ candidateId: 'long', kind: 'manuscript-unit', representation: 'full', text: longText }]
        },
        sourceRefs: ['writing-unit:long']
      }]
    })
    const providerBlock = JSON.parse(kernelSerialization.payload).blocks[0]
    expect(providerBlock.content.truncated).toBe(true)
    expect(kernelSerialization.serializedBlocks.long.length).toBeGreaterThan(0)
    expect(kernelSerialization.serializedBlocks.long.length).toBeLessThan(longText.length)
    expect(providerBlock.content.entries[0].text).toBe(kernelSerialization.serializedBlocks.long)
    const longReceipt = buildModelCallReceipt({
      manifest: longManifest,
      serializedBlocks: kernelSerialization.serializedBlocks
    })
    expect(longReceipt.entries[0]).toMatchObject({ included: true, cut: true })
    expect(longReceipt.omissions).toContainEqual({
      candidateId: 'compiler-cut', reason: 'budget-excluded', stage: 'compiler'
    })

    // U1 安全收口：最终 payload 加静态前缀受 transcript text part 上限约束；
    // omitted 与 serializedBlocks 必须和实际发送一致；极端超限抛 typed 错误。
    const overhead = narrativeTranscriptStaticOverheadChars({ phase: 'prose', formatInstructions: '以莉娜视角。' })
    const bounded = serializeKernelWithinTextPartBudget({
      revision: 'nar-u1',
      blocks: [
        {
          kind: 'compiled-context',
          content: {
            manifestFingerprint: longManifest.fingerprint,
            entries: Array.from({ length: 6 }, (_, index) => ({
              candidateId: `u1-${index}`,
              kind: 'manuscript-unit',
              representation: 'full',
              text: `第${index}段。${'雾港的潮声一遍遍洗过石阶，'.repeat(90)}`
            }))
          },
          sourceRefs: ['writing-unit:u1']
        },
        { kind: 'turn', content: { instruction: '守卫追向灯塔。' }, sourceRefs: ['author'] },
        { kind: 'summary', content: { text: '前情提要。' }, sourceRefs: ['chapter:5'] }
      ]
    }, overhead)
    expect(bounded.payload.length + overhead).toBeLessThanOrEqual(8000)
    const boundedParsed = JSON.parse(bounded.payload)
    const includedIds = new Set(
      (boundedParsed.blocks.find((b) => b.kind === 'compiled-context')?.content?.entries || []).map((e) => e.candidateId)
    )
    for (const omitted of bounded.omittedCandidateIds) {
      expect(includedIds.has(omitted)).toBe(false)
    }
    const passthrough = serializeKernelWithinTextPartBudget({
      revision: 'nar-u1-small',
      blocks: [{ kind: 'turn', content: { instruction: '短指令。' }, sourceRefs: ['author'] }]
    }, overhead, { initial: serializeNarrativeKernelForProvider({
      revision: 'nar-u1-small',
      blocks: [{ kind: 'turn', content: { instruction: '短指令。' }, sourceRefs: ['author'] }]
    }) })
    expect(passthrough.payload.length + overhead).toBeLessThanOrEqual(8000)
    // 静态指令耗尽预算时，短 payload 和复用 initial 也必须拒绝。
    for (const staticChars of [7999, 8000, 9000]) {
      expect(() => serializeKernelWithinTextPartBudget({
        revision: 'short', blocks: []
      }, staticChars, { initial: passthrough })).toThrow('本回合参考内容超出单次请求上限')
    }
    expect(() => serializeKernelWithinTextPartBudget({
      revision: 'nar-u1-huge',
      blocks: [{ kind: 'turn', content: { instruction: '放不下的指令'.repeat(2000) }, sourceRefs: ['author'] }]
    }, 7900)).toThrow('本回合参考内容超出单次请求上限')
  })

  it('flags declared-but-not-serialized and missing pieces (fail-closed accounting)', () => {
    const manifest = compileWritingContext({
      candidates: [makeCandidate({ id: 'only', representations: { full: '内容。' } })],
      target, profile: 'inline-fast', taskKind: 'manuscript'
    })
    // runtime 什么都没序列化。
    const receipt = buildModelCallReceipt({ manifest, serializedBlocks: {} })
    const issues = reconcileManifestWithReceipt(manifest, receipt)
    expect(issues.some((issue) => issue.issue === 'declared-but-not-serialized')).toBe(true)
    expect(receipt.tokens.source).toBe('estimated')
    // 缺失侧对账。
    expect(reconcileManifestWithReceipt(manifest, null)).toEqual([{ issue: 'missing-receipt' }])

    const evidenceReceipt = buildModelCallReceipt({
      manifest,
      serializedBlocks: { only: '内容。' },
      toolEvidence: [
        { callId: 'plan', tool: 'submit_narrative_beat_plan', sourceRefs: ['worldbook-entry:rogue'] },
        { callId: 'world-1', tool: 'world_lookup', action: 'get', itemIds: ['entry-ok'], sourceRefs: ['worldbook-entry:entry-ok'], chars: 120, modelCallIndex: 0, consumedByCallIndex: 1 },
        { callId: 'world-rogue', tool: 'world_lookup', action: 'get', itemIds: ['entry-rogue'], sourceRefs: ['worldbook-entry:rogue'], chars: 120 }
      ],
      authorization: { worldbookRefs: ['worldbook-entry:entry-ok'], memoryRefs: [] }
    })
    expect(evidenceReceipt.toolEvidence.map((entry) => entry.callId)).toEqual(['world-1', 'world-rogue'])
    expect(evidenceReceipt.toolEvidence[0]).toMatchObject({ modelCallIndex: 0, consumedByCallIndex: 1 })
    expect(evidenceReceipt.evidenceAuthorization).toMatchObject({ valid: false })
    expect(reconcileManifestWithReceipt(manifest, evidenceReceipt)).toContainEqual(expect.objectContaining({
      issue: 'tool-evidence-not-authorized',
      sourceRef: 'worldbook-entry:rogue'
    }))
  })
})

describe('Phase 4 ownership gate', () => {
  it('keeps candidate discovery shared, worldbook refs canonical, and Kernel sources manifest-authorized', () => {
    const candidates = [
      makeCandidate({ id: 'unit-before', representations: { full: '目标前正文。' } }),
      makeCandidate({
        id: 'wb-entry:rule-star',
        kind: 'worldbook-entry',
        sourceAuthority: 'imported-reference',
        temporalRelation: 'atemporal',
        sourceRefs: ['worldbook-entry:rule-star'],
        representations: { full: '石柱每次只能校准一颗星。' }
      }),
      makeCandidate({
        id: 'memory-fact',
        kind: 'memory',
        sourceAuthority: 'accepted-derived',
        sourceRefs: ['memory:memory-fact'],
        representations: { full: '莉娜已经确认铜钟裂纹来自盐蚀。' }
      })
    ]
    const target = { chapterId: 'ch-5', unitId: 'u-5' }
    const inline = compileWritingContext({ candidates, target, profile: 'inline-fast', taskKind: 'manuscript' })
    const narrative = compileWritingContext({ candidates, target, profile: 'narrative-long', taskKind: 'manuscript' })
    expect(new Set(inline.blocks.map((block) => block.candidateId))).toEqual(new Set(narrative.blocks.map((block) => block.candidateId)))
    expect(narrative.blocks.flatMap((block) => block.sourceRefs).filter((ref) => ref.includes('rule-star')))
      .toEqual(['worldbook-entry:rule-star'])

    const kernel = buildNarrativeKernel({
      worldbook: {
        id: 'wb-1', name: 'ROGUE_WORLDBOOK_NAME', writingStyle: 'ROGUE_STYLE_SENTINEL', forbidden: 'ROGUE_FORBIDDEN_SENTINEL',
        entries: [{ id: 'rogue', type: 'rule', content: 'ROGUE_RULE_SENTINEL', keys: ['越权'] }]
      },
      projectId: 'book-1',
      messages: [
        { id: 'old-assistant', role: 'assistant', content: 'ROGUE_NARRATIVE_CONTEXT_SENTINEL' },
        { id: 'm1', role: 'user', content: '继续。' }
      ],
      runtimeState: {
        worldMapState: { placeId: 'rogue-place', currentScene: 'ROGUE_RUNTIME_SCENE_SENTINEL' },
        canonicalFacts: { rogue: 'ROGUE_RUNTIME_FACT_SENTINEL' }
      },
      sceneSummary: { summary: 'ROGUE_SCENE_SUMMARY_SENTINEL' },
      sceneProjection: { chapterId: 'ch-rogue', location: { name: 'ROGUE_PROJECTION_SENTINEL' } },
      contextManifest: narrative
    })
    const kernelRefs = kernel.blocks.flatMap((block) => block.sourceRefs)
    expect(kernelRefs).toContain('worldbook-entry:rule-star')
    expect(kernelRefs.some((ref) => ref.includes('rogue') || ref.endsWith(':style') || ref.endsWith(':forbidden'))).toBe(false)
    expect(kernel.blocks.find((block) => block.kind === 'compiled-context')?.content.manifestFingerprint)
      .toBe(narrative.fingerprint)
    expect(kernel.blocks.map((block) => block.kind)).not.toEqual(expect.arrayContaining([
      'scene', 'projection', 'cast', 'summary', 'recent', 'continuity', 'style'
    ]))
    expect(kernel.recentMessages).toEqual([])
    expect(kernel.toolCatalog.map((tool) => tool.name)).toEqual([
      'world_lookup', 'memory_lookup', 'submit_narrative_beat_plan'
    ])
    const providerSerialization = serializeNarrativeKernelForProvider(kernel)
    expect(providerSerialization.payload).not.toMatch(/ROGUE_(?:WORLDBOOK|STYLE|FORBIDDEN|RULE|NARRATIVE|RUNTIME|SCENE|PROJECTION)/)
    expect(providerSerialization.serializedBlocks).toMatchObject({
      'unit-before': '目标前正文。',
      'wb-entry:rule-star': '石柱每次只能校准一颗星。',
      'memory-fact': '莉娜已经确认铜钟裂纹来自盐蚀。'
    })
    expect(kernel.blocks.find((block) => block.kind === 'lore')?.content.entries[0])
      .toMatchObject({ candidateId: 'wb-entry:rule-star', content: '石柱每次只能校准一颗星。' })
    expect(kernel.blocks.find((block) => block.kind === 'compiled-context')?.content.entries
      .some((entry) => entry.kind === 'worldbook-entry')).toBe(false)
  })
})

describe('C1-1A authoring run session gate', () => {
  const now = Date.parse('2026-08-30T08:00:00.000Z')
  const targetPrefix = '莉娜在旧港税务所听到第七响后检查钟绳。'

  function writingNode(nodeId, content, nodeRevision = 2) {
    return {
      type: 'paragraph',
      attrs: {
        nodeId,
        nodeRevision,
        kind: 'prose',
        rawMarkdown: null,
        leadingMarkdown: '',
        originalText: null
      },
      content: [{ type: 'text', text: content }]
    }
  }

  function writingUnit(unitId, content, unitRevision = 2, nodeRevision = 2) {
    return {
      type: 'writingUnit',
      attrs: { unitId, unitRevision, kind: 'passage', sceneId: null, originRefs: [] },
      content: [writingNode(`node-${unitId}`, content, nodeRevision)]
    }
  }

  function authoringFixture() {
    const exploration = {
      id: 'exp-bell',
      role: 'exploration',
      title: '第七响速记',
      content: '让艾德加在下一段从侧门出现。',
      outlineNodeIds: [],
      status: 'active',
      annotations: [],
      sourceRefs: ['chapter:ch-2'],
      revision: 2,
      createdAt: '2026-08-30T07:00:00.000Z',
      updatedAt: '2026-08-30T07:30:00.000Z'
    }
    const asset = createNarrativeAsset({
      id: 'asset-salt',
      projectId: 'book-1',
      source: { type: 'chapter', id: 'ch-2', chapterId: 'ch-2' },
      sourceRefs: [{ refType: 'chapter', refId: 'ch-2', projectId: 'book-1' }],
      kind: 'inspiration',
      title: '盐霜意象',
      content: '盐霜像一笔迟迟没有结清的旧账。',
      status: 'accepted',
      createdAt: now - 2_000,
      updatedAt: now - 1_000
    })
    const validMemory = createMemoryCandidate({
      id: 'memory-valid',
      scope: 'project',
      scopeId: 'book-1',
      kind: 'project-fact',
      content: `${targetPrefix}她必须先核对铜钟上的裂纹。`,
      confidence: 0.92,
      sourceRefs: ['exploration:exp-bell'],
      sourceRevision: 'exploration-state-opaque-7',
      authority: 'derived',
      derivedBy: 'prose-commit',
      importance: 0.9,
      status: 'active',
      createdAt: now - 4_000,
      updatedAt: now - 3_000,
      skipCompaction: true
    })
    const staleMemory = createMemoryCandidate({
      id: 'memory-stale',
      scope: 'project',
      scopeId: 'book-1',
      kind: 'project-fact',
      content: `${targetPrefix}STALE_MEMORY_SENTINEL`,
      confidence: 0.99,
      sourceRefs: ['chapter:ch-2'],
      sourceRevision: '6',
      authority: 'imported',
      derivedBy: 'migration',
      importance: 1,
      status: 'active',
      createdAt: now - 6_000,
      updatedAt: now - 5_000,
      skipCompaction: true
    })
    const characterEntry = {
      id: 'char-lina',
      name: '莉娜',
      type: 'character',
      content: '旧港调查员，习惯先观察出口再开口。',
      keys: ['莉娜'],
      enabled: true,
      metadata: { updatedAt: now - 8_000 }
    }
    const edgarEntry = {
      id: 'char-edgar',
      name: '艾德加',
      type: 'character',
      content: '旧港账房，知道侧门的暗号，但当前尚未入场。',
      keys: ['艾德加'],
      enabled: true,
      metadata: { updatedAt: now - 7_500 }
    }
    const locationEntry = {
      id: 'place-tax-office',
      name: '旧港税务所',
      type: 'location',
      content: '废弃税务大厅，铜钟下方藏有一条侧门。',
      keys: ['旧港税务所', '税务所'],
      enabled: true,
      metadata: { updatedAt: now - 7_000 }
    }
    const worldbook = {
      id: 'wb-1',
      name: '旧港世界',
      entries: [characterEntry, edgarEntry, locationEntry]
    }
    const documentSnapshot = {
      schemaVersion: 3,
      revision: 7,
      content: [
        writingUnit('u-far', 'OVERFAR_SENTINEL'),
        writingUnit('u-prev-3', '最近第三个写作单元。'),
        writingUnit('u-prev-2', '最近第二个写作单元。'),
        writingUnit('u-prev-1', '最近第一个写作单元。'),
        writingUnit('u-target', `${targetPrefix}AFTER_CARET_SENTINEL`, 5, 4),
        writingUnit('u-future', 'FUTURE_UNIT_SENTINEL')
      ],
      meta: {}
    }
    const sceneProjection = {
      schemaVersion: 2,
      projectId: 'book-1',
      chapterId: 'ch-2',
      sceneId: 'scene-bell',
      revision: '7',
      activeUnitId: 'u-target',
      worldbookId: 'wb-1',
      worldbookStatus: 'bound',
      anchorStatus: 'explicit',
      anchorId: 'anchor-bell',
      projectionFingerprint: 'scene-fp-7',
      viewpointCharacter: { id: 'char-lina', name: '莉娜', sourceRefs: ['worldbook-entry:char-lina'] },
      activeActor: null,
      dialogueTarget: null,
      location: { id: 'place-tax-office', name: '旧港税务所', sourceRefs: ['worldbook-entry:place-tax-office'] },
      time: { id: 'time-seventh-bell', label: '第七响之后', period: '深夜', sourceRefs: ['scene-anchor:anchor-bell'] },
      presentCharacters: [{ id: 'char-lina', name: '莉娜', sourceRefs: ['worldbook-entry:char-lina'] }],
      activeRelations: [],
      unresolvedEvents: [],
      missingRefs: [],
      sourceRefs: ['chapter:ch-2', 'worldbook:wb-1']
    }
    const target = {
      projectId: 'book-1',
      role: 'manuscript',
      documentId: 'ch-2',
      chapterId: 'ch-2',
      unitId: 'u-target',
      nodeId: 'node-u-target',
      caretOffset: targetPrefix.length,
      documentRevision: 'document-state-opaque-7',
      documentSchemaRevision: '7',
      unitRevision: '5',
      nodeRevision: '4'
    }
    const sceneIntent = createAuthoringSceneRunIntent({
      mode: 'next-passage',
      entityKind: 'character',
      entry: edgarEntry,
      target,
      worldbookId: 'wb-1',
      presentCharacterIds: sceneProjection.presentCharacters.map((character) => character.id)
    })
    const references = [
      {
        id: 'run-ref-bell',
        sourceKind: 'exploration-doc',
        sourceId: exploration.id,
        projectId: 'book-1',
        label: exploration.title,
        excerpt: exploration.content,
        sourceRefs: exploration.sourceRefs,
        revision: authoringRunReferenceRevision('exploration-doc', exploration),
        usageRole: 'intent',
        scope: 'run-only'
      },
      {
        id: 'run-ref-salt',
        sourceKind: 'narrative-asset',
        sourceId: asset.id,
        projectId: 'book-1',
        label: asset.title,
        excerpt: asset.content,
        sourceRefs: asset.sourceRefs,
        revision: authoringRunReferenceRevision('narrative-asset', asset),
        scope: 'run-only'
      }
    ]
    const input = {
      runId: 'authoring-run-c1-1a',
      taskId: 'authoring.continue',
      taskKind: 'manuscript',
      profile: 'narrative-long',
      target,
      documentSnapshot,
      sceneProjection,
      sceneIntents: [sceneIntent],
      references,
      matchedWorldbookEntries: [
        { entryId: characterEntry.id, matchReason: 'current-scene' },
        { entryId: edgarEntry.id, matchReason: 'scene-intent' },
        { entryId: locationEntry.id, matchReason: 'current-scene' }
      ],
      worldbookRepository: {
        getBoundWorldbook: vi.fn(async (projectId, worldbookId) => (
          projectId === 'book-1' && worldbookId === worldbook.id
            ? { projectId, worldbookId, worldbook }
            : null
        ))
      },
      referenceRepositories: {
        getExplorationDocument: vi.fn(async (projectId, sourceId) => (
          projectId === 'book-1' && sourceId === exploration.id ? exploration : null
        )),
        getNarrativeAsset: vi.fn(async (sourceId, projectId) => (
          projectId === 'book-1' && sourceId === asset.id ? asset : null
        ))
      },
      memoryRepository: { list: vi.fn(async () => [validMemory, staleMemory]) },
      currentRevisions: {
        'document:ch-2': 'document-state-opaque-7',
        'unit:ch-2:u-target': 'unit-r5',
        'node:ch-2:node-u-target': 'node-r4',
        'scene-projection': 'scene-fp-7',
        'chapter:ch-2': '7',
        'exploration:exp-bell': 'doc-r2',
        'memory-source:exploration:exp-bell': 'exploration-state-opaque-7'
      },
      authorId: 'author-1',
      sessionId: 'session-1',
      instruction: `${targetPrefix}继续调查。`,
      additionalCandidates: [],
      excludedCandidateIds: [],
      pinnedCandidateIds: [],
      now
    }
    return { input, sources: { exploration, asset, validMemory, staleMemory, characterEntry, edgarEntry, locationEntry, sceneIntent, worldbook } }
  }

  function expectDeepFrozen(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    expect(Object.isFrozen(value)).toBe(true)
    for (const child of Object.values(value)) expectDeepFrozen(child, seen)
  }

  it('freezes one caret-bounded manifest with explicit roles and canonical sources', async () => {
    const { input, sources } = authoringFixture()
    const rebuiltSceneIntent = createAuthoringSceneRunIntent({
      mode: 'next-passage',
      entityKind: 'character',
      entry: sources.edgarEntry,
      target: input.target,
      worldbookId: 'wb-1',
      presentCharacterIds: input.sceneProjection.presentCharacters.map((character) => character.id)
    })
    expect(rebuiltSceneIntent).toMatchObject({
      id: sources.sceneIntent.id,
      revision: sources.sceneIntent.revision,
      entryRevision: expect.any(String),
      sourceRefs: ['worldbook-entry:char-edgar'],
      payload: { adoption: 'add-present-character', entryId: 'char-edgar' }
    })
    expect(createAuthoringSceneRunIntent({
      mode: 'next-passage',
      entityKind: 'character',
      entry: { ...sources.edgarEntry, content: '设定已修订。' },
      target: input.target,
      worldbookId: 'wb-1',
      presentCharacterIds: input.sceneProjection.presentCharacters.map((character) => character.id)
    }).revision).not.toBe(sources.sceneIntent.revision)
    expect(createAuthoringSceneRunIntent({
      mode: 'next-passage',
      entityKind: 'location',
      entry: sources.edgarEntry,
      target: input.target,
      worldbookId: 'wb-1'
    })).toBeNull()
    expect(createAuthoringSceneRunIntent({
      mode: 'next-passage',
      entityKind: 'character',
      entry: sources.edgarEntry,
      target: input.target,
      worldbookId: '',
      presentCharacterIds: input.sceneProjection.presentCharacters.map((character) => character.id)
    })).toBeNull()
    expect(createAuthoringSceneRunIntent({
      mode: 'next-passage',
      entityKind: 'character',
      entry: sources.edgarEntry,
      target: input.target,
      worldbookId: 'wb-1',
      presentCharacterIds: Array.from({ length: 8 }, (_, index) => `character-${index}`)
    })).toBeNull()
    const result = await createAuthoringRunSession(input)
    expect(result.ok).toBe(true)
    const { session } = result
    const serialized = JSON.stringify(session)

    expect(session).not.toHaveProperty('documentSnapshot')
    expect(session.target).toMatchObject({
      documentRevision: 'document-state-opaque-7',
      documentSchemaRevision: '7'
    })
    expect(serialized).not.toContain('AFTER_CARET_SENTINEL')
    expect(serialized).not.toContain('FUTURE_UNIT_SENTINEL')
    expect(serialized).not.toContain('OVERFAR_SENTINEL')
    expect(session.candidates.find((candidate) => candidate.sourceId === 'u-target')?.representations.full)
      .toBe(targetPrefix)
    expect(session.candidates.filter((candidate) => candidate.kind === 'manuscript-unit').map((candidate) => candidate.sourceId))
      .toEqual(['u-prev-3', 'u-prev-2', 'u-prev-1', 'u-target'])

    const rewriteResult = await createAuthoringRunSession({
      ...input,
      target: { ...input.target, contextMode: 'rewrite-unit' }
    })
    expect(rewriteResult.ok).toBe(true)
    const rewriteSerialized = JSON.stringify(rewriteResult.session)
    expect(rewriteResult.session.target.contextMode).toBe('rewrite-unit')
    expect(rewriteResult.session.candidates.find((candidate) => candidate.sourceId === 'u-target'))
      .toMatchObject({ label: '待重写文本块', reason: '作者明确要求重写整个当前文本块' })
    expect(rewriteSerialized).toContain('AFTER_CARET_SENTINEL')
    expect(rewriteSerialized).not.toContain('FUTURE_UNIT_SENTINEL')

    expect(session.references).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'exp-bell', usageRole: 'intent', scope: 'run-only' }),
      expect.objectContaining({ sourceId: 'asset-salt', usageRole: 'inspiration', scope: 'run-only' })
    ]))
    expect(session.manifest.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'exp-bell', usageRole: 'intent' }),
      expect.objectContaining({ sourceId: 'asset-salt', usageRole: 'inspiration' }),
      expect.objectContaining({ candidateId: 'memory:memory-valid', usageRole: 'fact' })
    ]))
    expect(session.discoveryExclusions).toContainEqual(expect.objectContaining({
      candidateId: 'memory:memory-stale',
      reason: 'source-stale'
    }))
    expect(serialized).not.toContain('STALE_MEMORY_SENTINEL')

    const worldbookRefs = session.manifest.blocks
      .filter((block) => block.kind === 'worldbook-entry')
      .map((block) => block.primarySourceRef)
    expect(worldbookRefs.sort()).toEqual([
      'worldbook-entry:char-edgar',
      'worldbook-entry:char-lina',
      'worldbook-entry:place-tax-office'
    ])
    expect(new Set(worldbookRefs).size).toBe(worldbookRefs.length)
    expect(session.manifest.blocks.filter((block) => block.kind === 'worldbook-entry'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ primarySourceRef: 'worldbook-entry:char-lina' }),
        expect.objectContaining({ primarySourceRef: 'worldbook-entry:char-edgar' }),
        expect.objectContaining({ primarySourceRef: 'worldbook-entry:place-tax-office' })
      ]))
    expect(session.toolAuthorization).toMatchObject({
      worldbookRefs: [
        'worldbook-entry:char-edgar',
        'worldbook-entry:char-lina',
        'worldbook-entry:place-tax-office'
      ],
      memoryRefs: ['memory:memory-valid']
    })
    expect(session.sceneIntents).toContainEqual(expect.objectContaining({
      id: sources.sceneIntent.id,
      mode: 'next-passage',
      revision: sources.sceneIntent.revision,
      entityKind: 'character',
      entityId: 'char-edgar',
      payload: expect.objectContaining({ entryId: 'char-edgar', adoption: 'add-present-character' })
    }))
    const excludedIntent = await createAuthoringRunSession({
      ...input,
      excludedCandidateIds: [`scene-intent:${sources.sceneIntent.id}`]
    })
    expect(excludedIntent.ok).toBe(true)
    expect(excludedIntent.session.manifest.excluded).toContainEqual(expect.objectContaining({
      candidateId: `scene-intent:${sources.sceneIntent.id}`,
      reason: 'author-removed-for-run'
    }))
    expect(excludedIntent.session.sceneIntents).toEqual([])
    expect(collectAuthoringSceneRunIntentEffects(excludedIntent.session)).toMatchObject({
      characterIds: [], locationId: '', intentIds: []
    })

    const collectLive = (overrides = {}) => collectAuthoringRunDependencyRevisions({
      document: input.documentSnapshot,
      documentId: input.target.documentId,
      documentRevision: input.target.documentRevision,
      sceneProjection: input.sceneProjection,
      worldbook: {
        id: 'wb-1',
        entries: [sources.characterEntry, sources.edgarEntry, sources.locationEntry]
      },
      explorationDocuments: [sources.exploration],
      referenceAssets: [sources.asset],
      memories: [sources.validMemory, sources.staleMemory],
      sceneIntents: [sources.sceneIntent],
      sourceRevisions: input.currentRevisions,
      memorySourceRevisions: {
        'exploration:exp-bell': 'exploration-state-opaque-7'
      },
      ...overrides
    })
    expect(reconcileManifestDependencies(session.manifest, collectLive())).toEqual([])

    const changedNodeDocument = {
      ...input.documentSnapshot,
      content: input.documentSnapshot.content.map((unit) => (
        unit.attrs.unitId !== 'u-target'
          ? unit
          : {
              ...unit,
              content: unit.content.map((node) => ({
                ...node,
                attrs: { ...node.attrs, nodeRevision: 99 }
              }))
            }
      ))
    }
    const staleCases = [
      {
        dependency: 'node:ch-2:node-u-target',
        live: collectLive({ document: changedNodeDocument })
      },
      {
        dependency: 'worldbook-entry:char-lina',
        live: collectLive({
          worldbook: {
            id: 'wb-1',
            entries: [{ ...sources.characterEntry, content: '设定内容已经修改。' }, sources.edgarEntry, sources.locationEntry]
          }
        })
      },
      {
        dependency: 'narrative-asset:asset-salt',
        live: collectLive({ referenceAssets: [{ ...sources.asset, updatedAt: now + 1_000 }] })
      },
      {
        dependency: 'narrative-asset:asset-salt',
        reason: 'revision-missing',
        live: collectLive({ referenceAssets: [] })
      },
      {
        dependency: 'memory:memory-valid',
        live: collectLive({ memories: [{ ...sources.validMemory, updatedAt: now + 1_000 }, sources.staleMemory] })
      },
      {
        dependency: 'memory-source:exploration:exp-bell',
        live: collectLive({
          memorySourceRevisions: { 'exploration:exp-bell': 'exploration-state-opaque-8' }
        })
      },
      {
        dependency: `scene-intent:${sources.sceneIntent.id}`,
        live: collectLive({ sceneIntents: [{ ...sources.sceneIntent, revision: 'scene-intent-r2' }] })
      }
    ]
    for (const staleCase of staleCases) {
      expect(reconcileManifestDependencies(session.manifest, staleCase.live)).toContainEqual(expect.objectContaining({
        dependency: staleCase.dependency,
        reason: staleCase.reason || 'revision-changed'
      }))
    }
    expectDeepFrozen(compileWritingContext({
      candidates: session.candidates,
      target: session.target,
      profile: session.profile,
      taskKind: session.taskKind,
      discoveryExclusions: session.discoveryExclusions
    }))
    expectDeepFrozen(session)
  })

  it('fails closed on projection, target revision, reference cap, and source revision conflicts', async () => {
    const selectionFixture = authoringFixture()
    const catalog = buildAuthoringRunReferenceCatalog({
      projectId: 'book-1',
      explorations: [selectionFixture.sources.exploration],
      assets: [selectionFixture.sources.asset]
    })
    expect(catalog.map((item) => item.group)).toEqual(['exploration', 'material'])
    let selected = []
    selected = addAuthoringRunReferenceSelection(selected, catalog[0]).selections
    selected = addAuthoringRunReferenceSelection(selected, catalog[1]).selections
    expect(addAuthoringRunReferenceSelection(selected, catalog[0])).toMatchObject({ ok: false, reason: 'duplicate' })
    selected = addAuthoringRunReferenceSelection(selected, {
      ...catalog[0], id: 'exploration-doc:exp-third', sourceId: 'exp-third'
    }).selections
    expect(addAuthoringRunReferenceSelection(selected, {
      ...catalog[0], id: 'exploration-doc:exp-fourth', sourceId: 'exp-fourth'
    })).toMatchObject({ ok: false, reason: 'limit', limit: 3 })
    expect(toAuthoringRunReferences(selected)).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceKind: 'exploration-doc', usageRole: 'inspiration', scope: 'run-only' }),
      expect.objectContaining({ sourceKind: 'narrative-asset', usageRole: 'inspiration', scope: 'run-only' })
    ]))
    const revisedCatalog = buildAuthoringRunReferenceCatalog({
      projectId: 'book-1',
      explorations: [{ ...selectionFixture.sources.exploration, revision: selectionFixture.sources.exploration.revision + 1 }],
      assets: [selectionFixture.sources.asset]
    })
    expect(reconcileAuthoringRunReferenceSelections(selected, revisedCatalog, 'book-1')[0].selectionStatus)
      .toBe('modified')

    const projectionFixture = authoringFixture()
    const projectionMismatch = await createAuthoringRunSession({
      ...projectionFixture.input,
      sceneProjection: { ...projectionFixture.input.sceneProjection, projectId: 'book-2' }
    })
    expect(projectionMismatch).toMatchObject({
      ok: false,
      reason: 'target-projection-mismatch',
      issues: [expect.objectContaining({ field: 'projectId', reason: 'projection-target-mismatch' })]
    })

    const revisionFixture = authoringFixture()
    const revisionMismatch = await createAuthoringRunSession({
      ...revisionFixture.input,
      currentRevisions: {
        ...revisionFixture.input.currentRevisions,
        'node:ch-2:node-u-target': 'node-r999'
      }
    })
    expect(revisionMismatch).toMatchObject({
      ok: false,
      reason: 'target-revision-mismatch',
      issues: [expect.objectContaining({ dependency: 'node:ch-2:node-u-target', reason: 'revision-changed' })]
    })

    const missingRevisionFixture = authoringFixture()
    const missingCurrentRevision = await createAuthoringRunSession({
      ...missingRevisionFixture.input,
      currentRevisions: Object.fromEntries(Object.entries(missingRevisionFixture.input.currentRevisions)
        .filter(([key]) => key !== 'node:ch-2:node-u-target'))
    })
    expect(missingCurrentRevision).toMatchObject({
      ok: false,
      reason: 'target-revision-mismatch',
      issues: [expect.objectContaining({
        dependency: 'node:ch-2:node-u-target',
        reason: 'revision-missing'
      })]
    })

    const limitFixture = authoringFixture()
    const tooManyReferences = await createAuthoringRunSession({
      ...limitFixture.input,
      references: Array.from({ length: 4 }, (_, index) => ({
        id: `run-ref-limit-${index}`,
        sourceKind: 'exploration-doc',
        sourceId: `exp-limit-${index}`,
        projectId: 'book-1',
        revision: 'doc-r1',
        usageRole: 'inspiration',
        scope: 'run-only'
      }))
    })
    expect(tooManyReferences).toMatchObject({
      ok: false,
      reason: 'run-reference-limit-exceeded',
      reader: 'references',
      limit: 3,
      selected: 4
    })

    const productionFixture = authoringFixture()
    const { input: productionInput, sources: productionSources } = productionFixture
    let liveProjection = productionInput.sceneProjection
    const instructionOnlyEntry = {
      id: 'place-lonely-tower',
      name: '孤塔',
      type: 'location',
      content: '孤塔只在退潮后的半个时辰开放。',
      keys: ['孤塔'],
      enabled: true,
      metadata: { updatedAt: now - 500 }
    }
    const productionWorldbook = {
      ...productionSources.worldbook,
      entries: [...productionSources.worldbook.entries, instructionOnlyEntry]
    }
    const invocationTarget = {
      ...productionInput.target,
      documentRole: 'manuscript',
      caret: productionInput.target.caretOffset,
      cursorLocalOffset: productionInput.target.caretOffset
    }
    const liveTargetReader = vi.fn(async () => ({
      ...productionInput.target,
      documentRole: 'manuscript',
      role: 'manuscript',
      document: productionInput.documentSnapshot,
      sceneProjection: liveProjection
    }))
    const repositoryAdapters = {
      liveTargetReader,
      worldbookRepository: {
        getBoundWorldbook: vi.fn(async (projectId, worldbookId) => (
          projectId === 'book-1' && worldbookId === productionWorldbook.id
            ? { projectId, worldbookId, worldbook: productionWorldbook }
            : null
        ))
      },
      referenceRepositories: {
        getExplorationDocument: vi.fn(async (projectId, sourceId) => (
          projectId === 'book-1' && sourceId === productionSources.exploration.id
            ? productionSources.exploration
            : null
        )),
        getNarrativeAsset: vi.fn(async (sourceId, projectId) => (
          projectId === 'book-1' && sourceId === productionSources.asset.id
            ? productionSources.asset
            : null
        )),
        getManuscriptSourceRevision: vi.fn(async () => '')
      },
      memoryRepository: { list: vi.fn(async () => [productionSources.validMemory]) }
    }
    const runRequest = {
      intent: {
        invocationTarget,
        turn: { instruction: '下一段先远望孤塔。', directorNote: '' }
      }
    }
    const productionAdapter = createAuthoringRunSessionAdapter({
      repositoryAdapters,
      readSceneIntents: () => productionInput.sceneIntents,
      readReferenceSelections: () => productionInput.references,
      readSourceRevisions: () => productionInput.currentRevisions
    })
    expect(await productionAdapter.prepareSession({
      taskId: 'authoring.continue',
      request: { intent: { ...runRequest.intent, invocationTarget: { ...invocationTarget, projectId: '' } } }
    })).toMatchObject({ ok: false, reason: 'authoring-run-target-invalid' })

    const productionPrepared = await productionAdapter.prepareSession({
      taskId: 'authoring.continue',
      request: runRequest
    })
    expect(productionPrepared.ok).toBe(true)
    expect(productionPrepared.session.manifest.blocks).toContainEqual(expect.objectContaining({
      sourceId: 'place-lonely-tower',
      primarySourceRef: 'worldbook-entry:place-lonely-tower'
    }))
    expect(productionPrepared.session.manifest.blocks).toContainEqual(expect.objectContaining({
      sourceId: 'char-edgar',
      primarySourceRef: 'worldbook-entry:char-edgar'
    }))
    expect(productionPrepared.session.toolAuthorization.worldbookRefs)
      .toContain('worldbook-entry:char-edgar')
    const staleSelectedReferenceAdapter = createAuthoringRunSessionAdapter({
      repositoryAdapters,
      readSceneIntents: () => productionInput.sceneIntents,
      readReferenceSelections: () => productionInput.references.map((reference) => (
        reference.sourceKind === 'narrative-asset' ? { ...reference, revision: 'asset-r-stale' } : reference
      )),
      readSourceRevisions: () => productionInput.currentRevisions
    })
    const staleSelectedPrepared = await staleSelectedReferenceAdapter.prepareSession({
      taskId: 'authoring.continue',
      request: runRequest
    })
    expect(staleSelectedPrepared.ok).toBe(true)
    expect(staleSelectedPrepared.session.manifest.blocks.some((block) => block.sourceId === productionSources.asset.id)).toBe(false)
    expect(staleSelectedPrepared.session.discoveryExclusions).toContainEqual(expect.objectContaining({
      candidateId: 'run-ref-salt',
      reason: 'source-revision-changed'
    }))
    const staleSceneIntentAdapter = createAuthoringRunSessionAdapter({
      repositoryAdapters,
      readSceneIntents: () => [{ ...productionInput.sceneIntents[0], entryRevision: 'entry-stale' }],
      readReferenceSelections: () => productionInput.references,
      readSourceRevisions: () => productionInput.currentRevisions
    })
    expect(await staleSceneIntentAdapter.prepareSession({
      taskId: 'authoring.continue',
      request: runRequest
    })).toMatchObject({ ok: false, reason: 'authoring-run-scene-intent-stale' })
    const frozenSceneRevision = productionPrepared.session.manifest.dependencies['scene-projection']
    liveProjection = {
      ...liveProjection,
      time: { ...liveProjection.time, label: '第八响之后' }
    }
    const changedLiveDependencies = await productionAdapter.collectLiveDependencies(productionPrepared.session)
    expect(changedLiveDependencies['scene-projection']).not.toBe(frozenSceneRevision)
    expect(reconcileManifestDependencies(productionPrepared.session.manifest, changedLiveDependencies))
      .toContainEqual(expect.objectContaining({ dependency: 'scene-projection', reason: 'revision-changed' }))

    const unavailableWorldbookAdapter = createAuthoringRunSessionAdapter({
      repositoryAdapters: {
        ...repositoryAdapters,
        worldbookRepository: { getBoundWorldbook: vi.fn(async () => null) }
      }
    })
    expect(await unavailableWorldbookAdapter.prepareSession({
      taskId: 'authoring.continue',
      request: runRequest
    })).toMatchObject({ ok: false, reason: 'authoring-run-worldbook-unavailable', worldbookId: 'wb-1' })
    const crossProjectWorldbookAdapter = createAuthoringRunSessionAdapter({
      repositoryAdapters: {
        ...repositoryAdapters,
        worldbookRepository: {
          getBoundWorldbook: vi.fn(async () => ({
            projectId: 'book-2',
            worldbookId: productionWorldbook.id,
            worldbook: productionWorldbook
          }))
        }
      }
    })
    expect(await crossProjectWorldbookAdapter.prepareSession({
      taskId: 'authoring.continue',
      request: runRequest
    })).toMatchObject({ ok: false, reason: 'authoring-run-worldbook-unavailable' })

    const overLimitAdapter = createAuthoringRunSessionAdapter({
      repositoryAdapters,
      readReferenceSelections: () => Array.from({ length: 4 }, (_, index) => ({
        id: `selected-reference-${index}`,
        sourceKind: 'exploration-doc',
        sourceId: `exploration-${index}`,
        projectId: 'book-1',
        usageRole: 'inspiration'
      }))
    })
    expect(await overLimitAdapter.prepareSession({
      taskId: 'authoring.continue',
      request: runRequest
    })).toMatchObject({
      ok: false,
      reason: 'run-reference-limit-exceeded',
      reader: 'references',
      limit: 3,
      selected: 4
    })

    const invalidKindAdapter = createAuthoringRunSessionAdapter({
      repositoryAdapters,
      readReferenceSelections: () => [{
        id: 'invalid-kind-reference',
        sourceKind: 'legacy-note',
        sourceId: productionSources.asset.id,
        projectId: 'book-1'
      }]
    })
    const invalidKindPrepared = await invalidKindAdapter.prepareSession({
      taskId: 'authoring.continue',
      request: runRequest
    })
    expect(invalidKindPrepared.ok).toBe(true)
    expect(invalidKindPrepared.session.manifest.blocks.some((block) => block.sourceId === productionSources.asset.id)).toBe(false)
    expect(invalidKindPrepared.session.discoveryExclusions).toContainEqual(expect.objectContaining({
      candidateId: 'run-reference:1',
      reason: 'invalid-run-reference'
    }))

    const conflictFixture = authoringFixture()
    const outlineCandidate = {
      kind: 'outline-node',
      projectId: 'book-1',
      sourceKind: 'outline-node',
      sourceId: 'outline-bell',
      usageRole: 'intent',
      primarySourceRef: 'outline-node:outline-bell',
      sourceAuthority: 'author-adopted',
      narrativeStatus: 'intent',
      temporalRelation: 'at-target',
      scope: 'project',
      position: { chapterId: 'ch-2' },
      reason: '已采纳大纲意图',
      sourceRefs: ['outline-node:outline-bell'],
      attentionPriority: 90,
      representations: { full: '莉娜必须先核对铜钟。' }
    }
    const missingOutlineDependency = await createAuthoringRunSession({
      ...conflictFixture.input,
      additionalCandidates: [{
        ...outlineCandidate,
        id: 'outline-missing-dependency',
        revision: 'outline-r0'
      }]
    })
    expect(missingOutlineDependency).toMatchObject({
      ok: false,
      reason: 'additional-candidate-dependency-invalid',
      issues: [expect.objectContaining({
        candidateId: 'outline-missing-dependency',
        reason: 'outline-primary-dependency-invalid'
      })]
    })
    const sourceConflict = await createAuthoringRunSession({
      ...conflictFixture.input,
      additionalCandidates: [
        {
          ...outlineCandidate,
          id: 'outline-bell-v1',
          revision: 'outline-r1',
          dependencyRevisions: { 'outline-node:outline-bell': 'outline-r1' }
        },
        {
          ...outlineCandidate,
          id: 'outline-bell-v2',
          revision: 'outline-r2',
          dependencyRevisions: { 'outline-node:outline-bell': 'outline-r2' }
        }
      ]
    })
    expect(sourceConflict).toMatchObject({
      ok: false,
      reason: 'candidate-source-conflict',
      issues: [expect.objectContaining({
        reason: 'primary-source-revision-conflict',
        sourceRef: 'outline-node:outline-bell',
        revisions: expect.arrayContaining(['outline-r1', 'outline-r2'])
      })]
    })

    const representationConflictFixture = authoringFixture()
    const representationConflict = await createAuthoringRunSession({
      ...representationConflictFixture.input,
      additionalCandidates: [
        {
          ...outlineCandidate,
          id: 'outline-summary-v1',
          revision: 'outline-r4',
          dependencyRevisions: { 'outline-node:outline-bell': 'outline-r4' },
          representations: { summary: '第一种摘要。' }
        },
        {
          ...outlineCandidate,
          id: 'outline-summary-v2',
          revision: 'outline-r4',
          dependencyRevisions: { 'outline-node:outline-bell': 'outline-r4' },
          representations: { summary: '第二种摘要。' }
        }
      ]
    })
    expect(representationConflict).toMatchObject({
      ok: false,
      reason: 'candidate-source-conflict',
      issues: [expect.objectContaining({ reason: 'primary-source-content-conflict' })]
    })

    const unboundWorldbookFixture = authoringFixture()
    const unboundWorldbook = await createAuthoringRunSession({
      ...unboundWorldbookFixture.input,
      matchedWorldbookEntries: [{
        id: 'rogue-world',
        name: '外项目伪装条目',
        content: 'ROGUE_WORLDBOOK_CONTENT'
      }]
    })
    expect(unboundWorldbook.ok).toBe(true)
    expect(unboundWorldbook.session.manifest.blocks.some((block) => block.kind === 'worldbook-entry')).toBe(false)
    expect(unboundWorldbook.session.discoveryExclusions).toContainEqual(expect.objectContaining({
      candidateId: 'worldbook-entry:rogue-world',
      reason: 'worldbook-entry-missing'
    }))
    expect(JSON.stringify(unboundWorldbook.session)).not.toContain('ROGUE_WORLDBOOK_CONTENT')

    const changedReferenceFixture = authoringFixture()
    const changedAsset = {
      ...changedReferenceFixture.sources.asset,
      updatedAt: now + 1_000
    }
    const changedReference = await createAuthoringRunSession({
      ...changedReferenceFixture.input,
      referenceRepositories: {
        ...changedReferenceFixture.input.referenceRepositories,
        getNarrativeAsset: vi.fn(async () => changedAsset)
      }
    })
    expect(changedReference.ok).toBe(true)
    expect(changedReference.session.manifest.blocks.some((block) => block.sourceId === 'asset-salt')).toBe(false)
    expect(changedReference.session.discoveryExclusions).toContainEqual(expect.objectContaining({
      candidateId: 'run-ref-salt',
      sourceId: 'asset-salt',
      reason: 'source-revision-changed'
    }))

    const dependencyFixture = authoringFixture()
    const dependencyConflict = await createAuthoringRunSession({
      ...dependencyFixture.input,
      additionalCandidates: [{
        ...outlineCandidate,
        id: 'outline-dependency-conflict',
        revision: 'outline-r3',
        dependencyRevisions: {
          'outline-node:outline-bell': 'outline-r3',
          'document:ch-2': 'rogue-doc-r'
        }
      }]
    })
    expect(dependencyConflict).toMatchObject({
      ok: false,
      reason: 'context-dependency-revision-conflict',
      issues: [expect.objectContaining({
        dependency: 'document:ch-2',
        reason: 'dependency-revision-conflict',
        expected: 'document-state-opaque-7',
        actual: 'rogue-doc-r'
      })]
    })
  })

  it('builds a manifest-only tool index and rejects source/project tampering', async () => {
    const { input, sources } = authoringFixture()
    const prepared = await createAuthoringRunSession(input)
    expect(prepared.ok).toBe(true)
    const rogueMemory = createMemoryCandidate({
      id: 'rogue-memory',
      scope: 'project',
      scopeId: 'book-1',
      kind: 'project-fact',
      content: 'ROGUE_MEMORY_SENTINEL',
      confidence: 1,
      authority: 'accepted',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      skipCompaction: true
    })
    const indexed = createManifestAuthorizedNarrativeIndex({
      manifest: prepared.session.manifest,
      projectId: 'book-1',
      worldbook: {
        id: 'rogue-worldbook',
        entries: [{ id: 'rogue-world', name: '越权设定', content: 'ROGUE_WORLD_SENTINEL' }]
      },
      memories: [rogueMemory]
    })
    expect(indexed.ok).toBe(true)
    expect(indexed.index.counts).toEqual({ world: 3, geo: 0, history: 0, memory: 1, politics: 0 })
    expect(indexed.index.resources.map((resource) => resource.id).sort())
      .toEqual(['char-edgar', 'char-lina', 'memory-valid', 'place-tax-office'])
    expect(indexed.index.resources.flatMap((resource) => resource.sourceRefs).sort()).toEqual([
      'memory:memory-valid',
      'worldbook-entry:char-edgar',
      'worldbook-entry:char-lina',
      'worldbook-entry:place-tax-office'
    ])
    expect(indexed.index.byId.has('rogue-world')).toBe(false)
    expect(indexed.index.byId.has('rogue-memory')).toBe(false)
    expect(JSON.stringify(indexed.index.resources)).not.toContain('ROGUE_')
    expect(Object.isFrozen(indexed.index)).toBe(true)
    expect(Object.isFrozen(indexed.index.resources)).toBe(true)
    expect(() => indexed.index.byId.set('rogue-world', { id: 'rogue-world' })).toThrow()
    expect(() => indexed.index.resources.push({ id: 'rogue-world' })).toThrow()

    expect(createManifestAuthorizedNarrativeIndex({
      manifest: prepared.session.manifest,
      projectId: 'book-2'
    })).toMatchObject({ ok: false, reason: 'project-id-mismatch' })

    const worldbookBlockIndex = prepared.session.manifest.blocks.findIndex((block) => block.kind === 'worldbook-entry')
    const tamperedManifest = {
      ...prepared.session.manifest,
      blocks: prepared.session.manifest.blocks.map((block, index) => (
        index === worldbookBlockIndex ? { ...block, sourceId: 'rogue-world' } : block
      ))
    }
    tamperedManifest.fingerprint = createWritingContextManifestFingerprint(tamperedManifest)
    expect(createManifestAuthorizedNarrativeIndex({
      manifest: tamperedManifest,
      projectId: 'book-1'
    })).toMatchObject({ ok: false, reason: 'authorized-block-source-id-mismatch' })

    const originalBlock = prepared.session.manifest.blocks[worldbookBlockIndex]
    const coherentRogueBlock = {
      ...originalBlock,
      candidateId: 'worldbook-entry:rogue-world',
      sourceKind: 'worldbook-entry',
      sourceId: 'rogue-world',
      primarySourceRef: 'worldbook-entry:rogue-world',
      sourceRefs: ['worldbook-entry:rogue-world'],
      text: 'ROGUE_WORLD_SENTINEL',
      revision: 'entry-r999'
    }
    const fingerprintTamperedManifest = {
      ...prepared.session.manifest,
      blocks: prepared.session.manifest.blocks.map((block, index) => (
        index === worldbookBlockIndex ? coherentRogueBlock : block
      ))
    }
    expect(createManifestAuthorizedNarrativeIndex({
      manifest: fingerprintTamperedManifest,
      projectId: 'book-1'
    })).toMatchObject({ ok: false, reason: 'manifest-fingerprint-mismatch' })

    const fullIndexBuilder = vi.fn(() => ({ resources: [{ id: 'rogue-full-index' }] }))
    const memoryResolver = vi.fn(() => [rogueMemory])
    const liveResolver = vi.fn(async () => ({ ...prepared.session.manifest.dependencies }))
    const authorizedRef = prepared.session.toolAuthorization.worldbookRefs[0]
    const runGeneration = vi.fn(async () => ({
      finalText: '莉娜沿着钟绳上的盐霜继续查找。',
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      trace: {
        calls: [{
          callId: 'world-authorized',
          name: 'world_lookup',
          action: 'get',
          itemIds: [authorizedRef.slice('worldbook-entry:'.length)],
          sourceRefs: [authorizedRef],
          chars: 120,
          cached: false,
          errorCode: '',
          modelCallIndex: 0,
          consumedByCallIndex: 1
        }],
        tokenBudget: {
          limits: { maxInputTokens: 48000, maxOutputTokens: 10000, maxTotalTokens: 58000 },
          usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, source: 'provider' },
          calls: [
            { index: 0, inputTokens: 60, outputTokens: 10, totalTokens: 70, source: 'provider' },
            { index: 1, inputTokens: 40, outputTokens: 10, totalTokens: 50, source: 'provider' }
          ]
        }
      }
    }))
    const executor = createNarrativeKernelExecutor({
      runGeneration,
      buildResourceIndex: fullIndexBuilder,
      resolveMemories: memoryResolver
    })
    const executionInput = {
      intentMode: 'advance',
      turn: {
        kind: 'action', actorId: 'char-lina', instruction: '继核对钟绳。', directorNote: '',
        selectedDirection: {
          kind: 'authoring-scene-direction-selection', version: 1,
          id: 'inspect-rope', title: '沿盐霜追查', action: '莉娜沿钟绳上的盐霜追查。',
          immediateGain: '确认来向', cost: '留下行踪',
          evidenceRefs: [authorizedRef], entityRefs: ['worldbook-entry:char-lina'],
          sessionFingerprint: prepared.session.manifest.fingerprint,
          directionSetFingerprint: 'direction-set-1', fingerprint: 'direction-selected-1'
        }
      },
      narrativeContext: {
        revision: 'legacy-r1',
        messages: [{ id: 'legacy-after-caret', role: 'assistant', content: 'ROGUE_NARRATIVE_CONTEXT_SENTINEL' }],
        sceneSummary: { summary: 'ROGUE_SCENE_SUMMARY_SENTINEL' }
      },
      projection: input.sceneProjection,
      projectId: 'book-1',
      projectionFingerprint: input.sceneProjection.projectionFingerprint,
      settings: { provider: 'test', model: 'test-model' },
      worldbook: {
        ...sources.worldbook,
        worldDescription: 'ROGUE_WORLD_OVERVIEW_SENTINEL',
        entries: [...sources.worldbook.entries, { id: 'rogue-world', name: '越权', content: 'ROGUE_WORLD_SENTINEL' }]
      },
      runtimeState: {
        canonicalFacts: { rogue: 'ROGUE_RUNTIME_SENTINEL' },
        geoHistory: [{ id: 'rogue-history', summary: 'ROGUE_HISTORY_SENTINEL' }]
      },
      contextManifest: prepared.session.manifest,
      resolveLiveContextDependencies: liveResolver
    }
    const execution = await executor.executeTurn(executionInput)
    expect(fullIndexBuilder).not.toHaveBeenCalled()
    expect(memoryResolver).not.toHaveBeenCalled()
    expect(liveResolver).toHaveBeenCalledTimes(1)
    const runArgs = runGeneration.mock.calls[0][0]
    expect(runArgs.registry.names).toEqual([
      'world_lookup', 'memory_lookup', 'submit_narrative_beat_plan'
    ])
    expect(runArgs.kernel.toolCatalog.map((tool) => tool.name)).toEqual(runArgs.registry.names)
    expect(runArgs.kernel.blocks.map((block) => block.kind)).not.toEqual(expect.arrayContaining([
      'scene', 'projection', 'cast', 'summary', 'recent', 'continuity', 'style'
    ]))
    expect(runArgs.kernelSerialization.payload).not.toMatch(/ROGUE_(?:NARRATIVE|SCENE|WORLD|RUNTIME|HISTORY)/)
    expect(runArgs.kernelSerialization.payload).toContain('沿盐霜追查')
    expect(runArgs.kernelSerialization.payload).not.toContain('放弃钟绳转查码头')
    for (const kind of ['manuscript-unit', 'worldbook-entry', 'memory']) {
      const actualIds = prepared.session.manifest.blocks
        .filter((block) => block.kind === kind)
        .map((block) => block.candidateId)
        .filter((candidateId) => runArgs.kernelSerialization.serializedBlocks[candidateId])
      expect(actualIds, `${kind} should have provider-serialized actual evidence`).not.toHaveLength(0)
    }
    expect(execution).toMatchObject({
      text: '莉娜沿着钟绳上的盐霜继续查找。',
      adoptable: true,
      receipt: { evidenceAuthorization: { valid: true } },
      selectedDirectionReceipt: {
        fingerprint: 'direction-selected-1',
        evidenceRefs: [authorizedRef]
      },
      dependencyIssues: []
    })
    expect(execution.contextReceipt.toolEvidence).toContainEqual(expect.objectContaining({
      callId: 'world-authorized', sourceRefs: [authorizedRef], modelCallIndex: 0, consumedByCallIndex: 1
    }))
    expect(execution.contextReceipt.authorIntent).toMatchObject({
      kind: 'authoring-selected-direction-receipt',
      fingerprint: 'direction-selected-1',
      evidenceRefs: [authorizedRef]
    })
    expect(execution.contextCallReceipts).toHaveLength(2)
    expect(execution.contextCallReceipts[0]).toMatchObject({
      callIndex: 0,
      toolEvidence: [],
      evidenceAuthorization: { valid: true }
    })
    expect(execution.contextCallReceipts[1]).toMatchObject({
      callIndex: 1,
      evidenceAuthorization: { valid: true },
      toolEvidence: [expect.objectContaining({ callId: 'world-authorized', consumedByCallIndex: 1 })]
    })
    expect(execution.contextReceipt.omissions).toEqual(expect.arrayContaining(
      prepared.session.manifest.excluded.map((item) => expect.objectContaining({
        candidateId: item.candidateId,
        reason: item.reason,
        stage: 'compiler'
      }))
    ))

    await expect(executor.executeTurn({
      ...executionInput,
      contextManifest: fingerprintTamperedManifest
    })).rejects.toMatchObject({
      code: 'AUTHORING_MANIFEST_AUTHORIZATION_FAILED',
      reason: 'manifest-fingerprint-mismatch'
    })
    expect(runGeneration).toHaveBeenCalledTimes(1)

    const explorationManifest = {
      ...prepared.session.manifest,
      target: {
        ...prepared.session.manifest.target,
        role: 'exploration',
        documentRole: 'exploration',
        chapterId: ''
      }
    }
    explorationManifest.fingerprint = createWritingContextManifestFingerprint(explorationManifest)
    const explorationExecution = await executor.executeTurn({
      ...executionInput,
      projection: { ...input.sceneProjection, chapterId: '' },
      contextManifest: explorationManifest
    })
    expect(explorationExecution.text).toBe('莉娜沿着钟绳上的盐霜继续查找。')
    expect(runGeneration).toHaveBeenCalledTimes(2)

    const unauthorizedExecutor = createNarrativeKernelExecutor({
      runGeneration: async () => ({
        finalText: '这段正文带着越权证据，不能采纳。',
        trace: { calls: [{ callId: 'rogue', name: 'world_lookup', action: 'get', sourceRefs: ['worldbook-entry:rogue'] }] }
      }),
      buildResourceIndex: fullIndexBuilder,
      resolveMemories: memoryResolver
    })
    const unauthorized = await unauthorizedExecutor.executeTurn(executionInput)
    expect(unauthorized).toMatchObject({
      adoptable: false,
      contextOutcome: { status: 'invalid-result', code: 'AUTHORING_TOOL_EVIDENCE_UNAUTHORIZED' },
      contextReceipt: { evidenceAuthorization: { valid: false } }
    })
  })
})

describe('Phase 5 eligibility and conflict gate', () => {
  const target = { projectId: 'book-1', chapterId: 'ch-5', unitId: 'u-5' }

  it('fails closed on project/revision and exposes a pinned future only as intended', () => {
    const candidates = [
      makeCandidate({ id: 'other-project', projectId: 'book-2' }),
      makeCandidate({ id: 'missing-revision', revision: '' }),
      makeCandidate({
        id: 'future', temporalRelation: 'after-target', pinned: true,
        narrativeStatus: 'fact', representations: { full: '第十章才会发生。' }
      })
    ]
    const manifest = compileWritingContext({ candidates, target, profile: 'narrative-long', taskKind: 'manuscript' })
    expect(manifest.excluded).toEqual(expect.arrayContaining([
      { candidateId: 'other-project', reason: 'project-mismatch' },
      { candidateId: 'missing-revision', reason: 'revision-missing-fail-closed' }
    ]))
    expect(manifest.blocks).toEqual([
      expect.objectContaining({ candidateId: 'future', narrativeStatus: 'intent', intendedReference: true })
    ])
  })

  it('gives manuscript one effective view, conflict-check both views, and author override precedence without source mutation', () => {
    const worldbook = makeCandidate({
      id: 'worldbook-water', kind: 'worldbook-entry', sourceAuthority: 'imported-reference',
      temporalRelation: 'atemporal', claimKey: 'lina:swim', claimType: 'state',
      representations: { full: '莉娜不会游泳。' }
    })
    const detected = makeCandidate({
      id: 'detected-water', kind: 'scene-projection', sourceAuthority: 'machine-detected',
      temporalRelation: 'at-target', claimKey: 'lina:swim', claimType: 'state',
      representations: { full: '机器检测：莉娜似乎会游泳。' }
    })
    const override = buildAuthorOverrideCandidate({
      id: 'author-water', projectId: 'book-1', claimKey: 'lina:swim', claimType: 'state',
      content: '作者纠正：莉娜会游泳，但怕深水。', revision: 'override-r1',
      sourceRefs: ['author-override:water'], overrideOf: 'worldbook-water'
    })
    const sourceSnapshot = JSON.stringify(worldbook)
    const manuscript = compileWritingContext({ candidates: [worldbook, detected, override], target, profile: 'narrative-long', taskKind: 'manuscript' })
    expect(manuscript.blocks).toHaveLength(1)
    expect(manuscript.blocks[0]).toMatchObject({ candidateId: 'author-water', overrideOf: 'worldbook-water', conflictRole: 'winner' })
    expect(manuscript.excluded.map((item) => item.candidateId)).toEqual(expect.arrayContaining(['worldbook-water', 'detected-water']))

    const audit = compileWritingContext({ candidates: [worldbook, detected, override], target, profile: 'analysis-background', taskKind: 'conflict-check' })
    expect(audit.blocks.map((block) => block.candidateId)).toEqual(expect.arrayContaining(['author-water', 'worldbook-water', 'detected-water']))
    expect(audit.blocks.filter((block) => block.conflictRole === 'challenger')).toHaveLength(2)
    expect(JSON.stringify(worldbook)).toBe(sourceSnapshot)
  })
})

describe('Phase 6 fact index and continuity gate', () => {
  function unitIndex(unitId, unitRevision, facts, previousIndex = null) {
    return buildUnitFactIndex({
      projectId: 'book-1', chapterId: 'ch-5', unitId, unitRevision, facts, previousIndex
    })
  }

  it('recalls all exact facts with evidence while making prose omissions explicit and excluding rejected facts', () => {
    const preciseFacts = [
      ['vault:password', '7319', 'secret'],
      ['edgar:left-hand', '缺少小指', 'identity'],
      ['star:mechanism', '每次只能校准一颗星', 'mechanism'],
      ['lina:deadline', '日落前返回码头', 'time'],
      ['key:location', '北墙第三块砖后', 'location']
    ].map(([claimKey, value, facet], index) => ({
      claimKey, value, facet, status: 'fact', evidenceRefs: [`chapter:ch-5:unit:u-${index + 1}`]
    }))
    const indexes = preciseFacts.map((fact, index) => unitIndex(`u-${index + 1}`, `r${index + 1}`, [
      fact,
      ...(index === 0 ? [{ claimKey: 'rejected:route', value: '废弃路线', status: 'rejected', evidenceRefs: ['exploration:rejected'] }] : [])
    ]))
    const aggregate = aggregateWritingFactIndexes({ projectId: 'book-1', chapterId: 'ch-5', indexes })
    expect(queryWritingFacts(aggregate, { claimKeys: preciseFacts.map((fact) => fact.claimKey) })).toHaveLength(5)
    expect(aggregate.facts.some((fact) => fact.claimKey === 'rejected:route')).toBe(false)
    expect(aggregate.coverage.evidenceRefs).toHaveLength(5)

    const request = buildContinuitySummaryRequest({ aggregateIndex: aggregate, changedUnitIds: ['u-1', 'u-2', 'u-3', 'u-4', 'u-5'] })
    const projection = commitContinuityProjection({
      aggregateIndex: aggregate,
      request,
      result: {
        summary: '莉娜必须在日落前返回码头。',
        summarizedClaimKeys: ['lina:deadline'],
        facets: ['time'],
        method: 'fixture-model'
      }
    })
    expect(projection.summary.coverage.unitIds).toHaveLength(5)
    expect(projection.summary.facets).toEqual(['time'])
    expect(projection.summary.knownOmissions).toHaveLength(4)
    expect(projection.summary.knownOmissions.every((item) => item.evidenceRefs.length)).toBe(true)
    expect(queryWritingFacts(projection, { facets: ['secret', 'identity', 'mechanism', 'time', 'location'] })).toHaveLength(5)
  })

  it('invalidates only a changed unit, preserves the previous projection on failure/stale, and keeps task views run-only', () => {
    const first = unitIndex('u-1', 'r1', [{ claimKey: 'door:state', value: '关闭', facet: 'state', status: 'fact', evidenceRefs: ['unit:u-1'] }])
    const second = unitIndex('u-2', 'r1', [
      { claimKey: 'route:a', value: '走北门', facet: 'event', status: 'alternative', evidenceRefs: ['unit:u-2'] },
      { claimKey: 'route:b', value: '走南门', facet: 'event', status: 'hypothesis', evidenceRefs: ['unit:u-2'] }
    ])
    expect(unitIndex('u-1', 'r1', [], first)).toBe(first)
    const aggregate = aggregateWritingFactIndexes({ projectId: 'book-1', chapterId: 'ch-5', indexes: [first, second] })
    const request = buildContinuitySummaryRequest({ aggregateIndex: aggregate, changedUnitIds: ['u-1', 'u-2'] })
    const projection = commitContinuityProjection({
      aggregateIndex: aggregate, request,
      result: { summary: '门仍然关闭。', summarizedClaimKeys: ['door:state'], facets: ['state'] }
    })

    const changedFirst = unitIndex('u-1', 'r2', [{ claimKey: 'door:state', value: '打开', facet: 'state', status: 'fact', evidenceRefs: ['unit:u-1:r2'] }], first)
    expect(changedFirst).not.toBe(first)
    expect(second.unitRevision).toBe('r1')
    const changedAggregate = aggregateWritingFactIndexes({ projectId: 'book-1', chapterId: 'ch-5', indexes: [changedFirst, second] })
    expect(commitContinuityProjection({ aggregateIndex: changedAggregate, previousProjection: projection, request, result: { summary: '过期摘要' } })).toBe(projection)
    expect(commitContinuityProjection({ aggregateIndex: aggregate, previousProjection: projection, request, result: { ok: false } })).toBe(projection)

    const manuscript = buildWritingFactTaskView(aggregate, { taskKind: 'manuscript' })
    const exploration = buildWritingFactTaskView(aggregate, { taskKind: 'exploration' })
    expect(manuscript.facts.map((fact) => fact.claimKey)).toEqual(['door:state'])
    expect(exploration.facts.map((fact) => fact.claimKey)).toEqual(expect.arrayContaining(['route:a', 'route:b']))
    expect(aggregate.facts).toHaveLength(3)
  })
})

describe('Phase 7 cumulative budget and typed outcome gate', () => {
  it('caps cumulative calls even without provider usage and records a receipt for every call', () => {
    const inline = createContextRunBudget('inline-fast')
    expect(inline.limits).toMatchObject({ tools: false, summaries: false })
    const first = inline.canStartCall({ inputChars: 1000, maxOutputTokens: 100 })
    expect(first.allowed).toBe(true)
    const receipt = inline.recordCall({ inputChars: 1000, outputChars: 100, phase: 'write' })
    expect(receipt).toMatchObject({ index: 0, phase: 'write', source: 'estimated' })
    expect(inline.usage.totalTokens).toBeGreaterThan(0)
    expect(inline.usage.source).toBe('estimated')
    inline.recordCall({ usage: { inputTokens: 2, outputTokens: 1 }, phase: 'completion' })
    expect(inline.usage.source).toBe('mixed')
    expect(buildModelCallReceipt({ usage: inline.usage }).tokens.source).toBe('mixed')

    const narrative = createContextRunBudget('narrative-long')
    narrative.recordCall({ usage: { inputTokens: CONTEXT_RUN_BUDGETS['narrative-long'].maxInputTokens - 10, outputTokens: 1 }, phase: 'plan' })
    expect(narrative.usage.source).toBe('provider')
    expect(narrative.canStartCall({ inputChars: 100, maxOutputTokens: 1 }).allowed).toBe(false)
    expect(narrative.calls).toHaveLength(1)
  })

  it('classifies all stable outcomes and allows degraded prose only for budget-capped runs', () => {
    expect(classifyContextRunOutcome({ text: '正文。' }).status).toBe('completed')
    expect(classifyContextRunOutcome({ text: '正文。', receipt: { anyCut: true } }).status).toBe('context-truncated')
    expect(classifyContextRunOutcome({ text: '仍可采用的正文。', budget: { capped: true } })).toMatchObject({ status: 'budget-capped', degraded: true })
    expect(classifyContextRunOutcome({ error: { code: 'AGENT_RESULT_STALE' } }).status).toBe('stale')
    expect(classifyContextRunOutcome({ error: { code: 'NARRATIVE_AGENT_ABORTED' } }).status).toBe('aborted')
    expect(classifyContextRunOutcome({ error: { code: 'NARRATIVE_AGENT_TIMEOUT' } }).status).toBe('timeout')
    expect(classifyContextRunOutcome({ error: { code: 'NARRATIVE_GROUNDING_REQUIRED' } }).status).toBe('grounding-insufficient')
    expect(classifyContextRunOutcome({ error: { code: 'NARRATIVE_TOOL_ROUND_LIMIT' } }).status).toBe('loop-capped')
    expect(classifyContextRunOutcome({ error: { code: 'AGENT_EMPTY_RESULT' } }).status).toBe('invalid-result')
  })
})

describe('Phase 8 cross-chapter production gate', () => {
  const chapter = (id, revision, content, continuityProjection = null) => ({
    id, revision, content, continuityProjection,
    editorDocument: { revision, content: [{ attrs: { unitId: `${id}-unit` } }] }
  })
  const projection = (id, value) => ({
    revision: `continuity-${id}`,
    summary: { text: `${id} 连续性摘要` },
    facts: [{ claimKey: `${id}:hook`, value, status: 'constraint', facet: 'secret', evidenceRefs: [`chapter:${id}:hook`] }]
  })

  it('finds multi-chapter payoff predecessors without reading later chapters or duplicating full chapters', () => {
    const book = { id: 'book-1', chapters: [
      chapter('ch-1', 1, `开端${'很长正文'.repeat(400)}伏笔尾段`, projection('ch-1', '铜钥匙尚未兑现')),
      chapter('ch-3', 3, '第三章正文', projection('ch-3', '中间线索')),
      chapter('ch-5', 5, '第五章正文'),
      chapter('ch-10', 10, '第十章揭晓未来真相', projection('ch-10', '未来真相'))
    ] }
    const outlineNodes = [
      { id: 'n1', chapterRefs: ['ch-1'] },
      { id: 'n3', chapterRefs: ['ch-3'] },
      { id: 'n5', chapterRefs: ['ch-5'] }
    ]
    const outlineEdges = [
      { kind: 'foreshadows', fromNodeId: 'n1', toNodeId: 'n3' },
      { kind: 'causes', fromNodeId: 'n3', toNodeId: 'n5' }
    ]
    const discovered = discoverCrossChapterContext({ book, targetChapterId: 'ch-5', outlineNodes, outlineEdges })
    const manifest = compileWritingContext({
      candidates: discovered.candidates,
      target: { projectId: 'book-1', chapterId: 'ch-5' },
      profile: 'narrative-long'
    })
    expect(manifest.blocks.map((block) => block.candidateId)).toEqual(expect.arrayContaining(['chapter-context:ch-1', 'chapter-context:ch-3']))
    expect(manifest.blocks.map((block) => block.candidateId)).not.toContain('chapter-context:ch-10')
    expect(manifest.blocks.find((block) => block.candidateId === 'chapter-context:ch-1').text.length).toBeLessThan(1000)
    expect(discovered.report.discovered.find((item) => item.chapterId === 'ch-1').reason).toContain('2 跳')
  })

  it('derives stable revisions for legacy chapters and invalidates context when outline edges change', () => {
    const legacyBook = { id: 'legacy-book', chapters: [
      { id: 'ch-old', content: '没有显式 revision 的旧章节。' },
      { id: 'ch-now', content: '当前章节。' }
    ] }
    const discovered = discoverCrossChapterContext({ book: legacyBook, targetChapterId: 'ch-now' })
    expect(discovered.candidates[0].revision).toMatch(/^chapter-content-/)

    const nodes = [{ id: 'n-old', chapterRefs: ['ch-old'] }, { id: 'n-now', chapterRefs: ['ch-now'] }]
    const before = collectWritingContextDependencyRevisions({
      book: legacyBook,
      outlineNodes: nodes,
      outlineEdges: [],
      sceneProjection: { revision: 'doc-r1', projectionFingerprint: 'scene-fp-1' }
    })
    const after = collectWritingContextDependencyRevisions({
      book: legacyBook,
      outlineNodes: nodes,
      outlineEdges: [{ id: 'edge-1', kind: 'foreshadows', fromNodeId: 'n-old', toNodeId: 'n-now' }]
    })
    expect(before['chapter:ch-old']).toBe(discovered.candidates[0].revision)
    expect(before['scene-projection']).toBe('scene-fp-1')
    expect(after.outline).not.toBe(before.outline)
  })

  it('invalidates a writing context manifest when a selected reference asset changes', () => {
    const before = collectWritingContextDependencyRevisions({
      referenceAssets: [{ id: 'asset-1', updatedAt: '2026-08-28T08:00:00.000Z' }]
    })
    const after = collectWritingContextDependencyRevisions({
      referenceAssets: [{ id: 'asset-1', updatedAt: '2026-08-28T09:00:00.000Z' }]
    })
    expect(before['narrative-asset:asset-1']).toBe('asset-r2026-08-28T08:00:00.000Z')
    expect(after['narrative-asset:asset-1']).not.toBe(before['narrative-asset:asset-1'])
  })

  it('supports run-only remove/pin, marks future pins intended, and fail-closes missing revisions', () => {
    const candidates = [
      makeCandidate({ id: 'remove-me' }),
      makeCandidate({ id: 'future-pin', temporalRelation: 'after-target' }),
      makeCandidate({ id: 'missing-revision', revision: '' })
    ]
    const manifest = compileWritingContext({
      candidates,
      target: { projectId: 'book-1', chapterId: 'ch-1' },
      profile: 'narrative-long',
      excludedCandidateIds: ['remove-me'],
      pinnedCandidateIds: ['future-pin']
    })
    expect(manifest.excluded).toEqual(expect.arrayContaining([
      { candidateId: 'remove-me', reason: 'author-removed-for-run' },
      { candidateId: 'missing-revision', reason: 'revision-missing-fail-closed' }
    ]))
    expect(manifest.blocks.find((block) => block.candidateId === 'future-pin')).toMatchObject({ narrativeStatus: 'intent', intendedReference: true, pinned: true })
  })

  it('stales only when an actual order/source dependency changes or disappears, including after a model call', async () => {
    const manifest = compileWritingContext({
      candidates: [makeCandidate({ dependencyRevisions: { 'chapter:ch-1': 'r1' } })],
      target: { projectId: 'book-1', chapterId: 'ch-2' },
      dependencyRevisions: { 'chapter-order': 'order-1' }
    })
    expect(isContextManifestStale(manifest, { 'chapter:ch-1': 'r1', 'chapter-order': 'order-1', unrelated: 'changed' })).toBe(false)
    expect(reconcileManifestDependencies(manifest, { 'chapter:ch-1': 'r2', 'chapter-order': 'order-1' })).toEqual([
      { dependency: 'chapter:ch-1', reason: 'revision-changed', expected: 'r1', actual: 'r2' }
    ])
    expect(isContextManifestStale(manifest, { 'chapter:ch-1': 'r1' })).toBe(true)

    const liveResolver = vi.fn(async () => ({ 'chapter:ch-1': 'r2', 'chapter-order': 'order-1' }))
    const executor = createNarrativeKernelExecutor({
      buildKernel: () => ({ blocks: [] }),
      runGeneration: async () => ({ finalText: '不应采用的迟到正文。' }),
      buildResourceIndex: () => ({}),
      createRegistry: () => ({})
    })
    const staleResult = await executor.executeTurn(baseInput({
      contextManifest: manifest,
      resolveLiveContextDependencies: liveResolver
    }))
    expect(liveResolver).toHaveBeenCalledTimes(1)
    expect(staleResult).toMatchObject({
      text: '不应采用的迟到正文。',
      adoptable: false,
      receipt: {
        kind: 'model-call-receipt',
        dependencyIssues: [{
          dependency: 'chapter:ch-1', reason: 'revision-changed', expected: 'r1', actual: 'r2'
        }],
        invalidatedSources: [{
          dependency: 'chapter:ch-1', reason: 'revision-changed', expected: 'r1', actual: 'r2'
        }]
      },
      dependencyIssues: [{
        dependency: 'chapter:ch-1', reason: 'revision-changed', expected: 'r1', actual: 'r2'
      }],
      contextOutcome: { status: 'stale' }
    })
  })
})

describe('Phase 9 unified Ghost candidate gate', () => {
  const target = {
    projectId: 'book-1', documentId: 'doc-1', role: 'exploration', chapterId: '',
    unitId: 'unit-1', unitRevision: '2', nodeId: 'node-1', nodeRevision: '3',
    caret: 20, documentRevision: 'doc-r5'
  }

  it('uses the same target/manifest/outcome contract for exploration and manuscript Ghosts', () => {
    const manifest = { fingerprint: 'manifest-1', dependencies: { outline: 'outline-r1' } }
    const contextCallReceipts = [{ callIndex: 0, toolEvidence: [{ callId: 'world-1' }] }]
    const exploration = createWritingGhostCandidate({
      kind: 'inline',
      text: '探索句。后续句。',
      target,
      manifest,
      runOutcome: { status: 'completed' },
      contextCallReceipts
    })
    const manuscript = createWritingGhostCandidate({ kind: 'narrative', text: '正文段落。', target: { ...target, role: 'manuscript', documentId: 'ch-1', chapterId: 'ch-1' }, manifest })
    expect(exploration).toMatchObject({ kind: 'writing-ghost-candidate', mode: 'inline', target: { role: 'exploration' }, manifestFingerprint: 'manifest-1', runOutcome: { status: 'completed' } })
    expect(exploration.contextCallReceipts).toEqual(contextCallReceipts)
    expect(Object.isFrozen(exploration.contextCallReceipts)).toBe(true)
    expect(Object.isFrozen(exploration.contextCallReceipts[0])).toBe(true)
    expect(Object.isFrozen(exploration.contextCallReceipts[0].toolEvidence)).toBe(true)
    expect(manuscript).toMatchObject({ mode: 'narrative', target: { role: 'manuscript', chapterId: 'ch-1' } })
    expect(selectWritingGhostText(exploration, 'unit')).toBe('探索句。')
    const remainder = createWritingGhostCandidate({
      kind: 'inline', text: exploration.text.slice(selectWritingGhostText(exploration, 'unit').length),
      target: exploration.target,
      manifest: { fingerprint: exploration.manifestFingerprint, dependencies: exploration.dependencyRevisions }
    })
    expect(remainder).toMatchObject({ text: '后续句。', target: exploration.target, dependencyRevisions: { outline: 'outline-r1' } })
  })

  it('keeps one pending owner and forces whole adoption when scene/outline deltas exist', () => {
    const first = createWritingGhostCandidate({ text: '第一候选。', target })
    const second = createWritingGhostCandidate({ text: '第二候选。还有一句。', target, sceneDelta: { locationId: 'dock' } })
    const claimed = claimWritingGhostCandidate(first, second)
    expect(claimed).toMatchObject({ pending: { id: second.id, requiresWholeAdoption: true }, replacedId: first.id })
    expect(selectWritingGhostText(second, 'unit')).toBe(second.text)
  })

  it('allows unrelated edits but fail-closes target or actual dependency changes', () => {
    const candidate = createWritingGhostCandidate({ text: '候选。', target, manifest: { dependencies: { outline: 'outline-r1' } } })
    expect(validateWritingGhostCandidate(candidate, { target, liveDependencyRevisions: { outline: 'outline-r1', unrelated: 'r9' } })).toEqual({ ok: true })
    expect(validateWritingGhostCandidate(candidate, { target: { ...target, documentRevision: 'doc-r6' }, liveDependencyRevisions: { outline: 'outline-r1' } }).reason).toBe('documentRevision-changed')
    expect(validateWritingGhostCandidate(candidate, { target, liveDependencyRevisions: { outline: 'outline-r2' } })).toMatchObject({ ok: false, reason: 'dependency-stale' })
    expect(validateWritingGhostCandidate(candidate, { target: { ...target, nodeId: 'node-2' }, liveDependencyRevisions: { outline: 'outline-r1' } }).reason).toBe('node-changed')
    expect(validateWritingGhostCandidate(candidate, { target: { ...target, caret: 21 }, liveDependencyRevisions: { outline: 'outline-r1' } }).reason).toBe('caret-changed')
  })
})

describe('Phase 10 atomic Ghost adoption gate', () => {
  const target = {
    projectId: 'book-1', documentId: 'chapter-5', role: 'manuscript', chapterId: 'chapter-5',
    unitId: 'unit-before', unitRevision: '1', documentRevision: 'doc-r1'
  }
  const outlineNodes = [{
    id: 'outline-entry', title: '艾德加入场', status: 'planned', revision: 2,
    chapterRefs: ['chapter-5'], unitRefs: [], entityRefs: ['edgar']
  }]

  it('rejects deltas that cannot be bound to an inserted writing unit', () => {
    const candidate = createWritingGhostCandidate({ text: '候选。', target, sceneDelta: { locationId: 'hall' } })
    expect(prepareWritingAdoptionDeltas({ candidate, insertedUnitId: '', outlineNodes })).toEqual({
      ok: false,
      reason: 'inserted-unit-missing'
    })
  })

  it('prepares prose-linked scene and outline deltas without mutating their inputs', () => {
    const runSession = {
      kind: 'authoring-run-session',
      sceneProjection: {
        presentCharacters: [{ id: 'lina', name: '莉娜' }],
        location: { id: 'dock', name: '旧港码头' },
        viewpointCharacter: { id: 'lina', name: '莉娜' },
        time: { label: '深夜', period: '夜间' }
      },
      sceneIntents: [
        {
          id: 'character-edgar-next-passage', mode: 'next-passage', entityKind: 'character', entityId: 'edgar',
          payload: { entityKind: 'character', entryId: 'edgar', adoption: 'add-present-character' },
          sourceRefs: ['worldbook-entry:edgar']
        },
        {
          id: 'location-tower-next-passage', mode: 'next-passage', entityKind: 'location', entityId: 'tower',
          payload: { entityKind: 'location', entryId: 'tower', adoption: 'set-location' },
          sourceRefs: ['worldbook-entry:tower']
        }
      ]
    }
    const candidate = createWritingGhostCandidate({
      text: '艾德加推门而入。', target,
      sceneDelta: { locationId: 'hall' },
      outlineDelta: { nodeId: 'outline-entry', status: 'fulfilled' },
      runSession
    })
    expect(candidate.requiresWholeAdoption).toBe(true)
    const sceneAnchors = [{
      unitId: 'unit-before',
      worldbookId: 'wb-1',
      presentCharacterIds: ['lina'],
      plannedCharacterIds: ['legacy-other']
    }]
    const sceneIntentEffects = collectAuthoringSceneRunIntentEffects(candidate.runSession)
    const prepared = prepareWritingAdoptionDeltas({
      candidate,
      insertedUnitIds: ['unit-new-a', 'unit-new-b'],
      worldbookId: 'wb-1',
      sceneAnchors,
      outlineNodes,
      commitPlannedEntrances: false,
      sceneIntentEffects
    })
    expect(prepared).toMatchObject({
      ok: true,
      sceneAnchors: [
        {
          unitId: 'unit-before',
          worldbookId: 'wb-1',
          presentCharacterIds: ['lina'],
          plannedCharacterIds: ['legacy-other']
        },
        {
          unitId: 'unit-new-a', worldbookId: 'wb-1', presentCharacterIds: ['lina', 'edgar'],
          locationId: 'tower', viewpointCharacterId: 'lina', time: { label: '深夜', period: '夜间' }
        }
      ],
      outlineNodes: [{ id: 'outline-entry', status: 'fulfilled', revision: 3, unitRefs: [
        { chapterId: 'chapter-5', unitId: 'unit-new-a' },
        { chapterId: 'chapter-5', unitId: 'unit-new-b' }
      ] }],
      receipt: {
        sceneChanged: true,
        outlineChanged: true,
        insertedUnitId: 'unit-new-a',
        insertedUnitIds: ['unit-new-a', 'unit-new-b'],
        insertedUnitCount: 2,
        sceneIntentEffects: {
          characterIds: ['edgar'],
          locationId: 'tower',
          intentIds: ['character-edgar-next-passage', 'location-tower-next-passage']
        }
      }
    })
    expect(sceneAnchors[0]).toEqual(expect.objectContaining({
      presentCharacterIds: ['lina'],
      plannedCharacterIds: ['legacy-other']
    }))
    expect(outlineNodes[0]).toMatchObject({ status: 'planned', revision: 2, unitRefs: [] })
    expect(canUndoWritingAdoptionDeltas(prepared.receipt, prepared)).toBe(true)
    expect(canRedoWritingAdoptionDeltas(prepared.receipt, {
      sceneAnchors: prepared.receipt.previousAnchors,
      outlineNodes: prepared.receipt.previousOutlineNodes
    })).toBe(true)
    expect(prepared.receipt.appliedAnchors).toEqual(prepared.sceneAnchors)
    expect(prepared.receipt.appliedOutlineNodes).toEqual(prepared.outlineNodes)
    expect(createAdoptionImpactProjection({
      editorResult: { unitIds: ['unit-new-a', 'unit-new-b'] },
      receipt: prepared.receipt
    })).toMatchObject({
      insertedUnitCount: 2,
      headline: '已纳入正文 · 新增 2 个写作单元',
      sceneChanges: ['当前场加入 1 人', '当前地点已更新'],
      outlineChanges: ['大纲已更新'],
      worldChanges: []
    })
    expect(createAdoptionImpactProjection({
      editorResult: { unitIds: ['unit-quiet'] },
      receipt: { insertedUnitIds: ['unit-quiet'], sceneChanged: false, outlineChanged: false },
      prose: '城门被毁，所有人离开。'
    })).toMatchObject({ sceneChanges: [], outlineChanges: [], worldChanges: [] })
    expect(collectAuthoringSceneRunIntentEffects([{
      id: 'character-edgar-run-only', mode: 'run-only', entityKind: 'character', entityId: 'edgar',
      payload: { entityKind: 'character', entryId: 'edgar', adoption: 'none' }
    }])).toMatchObject({ characterIds: [], locationId: '', intentIds: [] })
    expect(collectAuthoringSceneRunIntentEffects(candidate.runSession, {
      receipts: [{
        entries: [{
          candidateId: 'scene-intent:character-edgar-next-passage',
          included: true,
          cut: true
        }]
      }]
    })).toMatchObject({ characterIds: [], locationId: '', intentIds: [] })
    const fullCast = Array.from({ length: 8 }, (_, index) => ({ id: `character-${index}` }))
    const overCapacitySession = {
      kind: 'authoring-run-session',
      sceneProjection: { presentCharacters: fullCast },
      sceneIntents: [{
        id: 'character-ninth-next-passage', mode: 'next-passage', entityKind: 'character', entityId: 'character-ninth',
        payload: { entityKind: 'character', entryId: 'character-ninth', adoption: 'add-present-character' },
        sourceRefs: ['worldbook-entry:character-ninth']
      }]
    }
    const overCapacityCandidate = createWritingGhostCandidate({
      text: '第九个人推门进来。', target, runSession: overCapacitySession
    })
    expect(prepareWritingAdoptionDeltas({
      candidate: overCapacityCandidate,
      insertedUnitId: 'unit-over-capacity',
      worldbookId: 'wb-1',
      sceneIntentEffects: collectAuthoringSceneRunIntentEffects(overCapacityCandidate.runSession)
    })).toMatchObject({ ok: false, reason: 'scene-character-limit-exceeded' })
  })

  it('rejects missing outline fulfillment before persistence and invalidates undo after related edits', () => {
    const missing = createWritingGhostCandidate({ text: '候选。', target, outlineDelta: { nodeId: 'missing', status: 'fulfilled' } })
    expect(prepareWritingAdoptionDeltas({ candidate: missing, insertedUnitId: 'unit-new', outlineNodes })).toEqual({ ok: false, reason: 'outline-node-missing' })
    const plain = createWritingGhostCandidate({ text: '候选。', target })
    const prepared = prepareWritingAdoptionDeltas({ candidate: plain, insertedUnitId: 'unit-new', outlineNodes })
    expect(canUndoWritingAdoptionDeltas(prepared.receipt, { ...prepared, outlineNodes: [{ ...prepared.outlineNodes[0], revision: 9 }] })).toBe(false)
  })
})

describe('Phase 11 peripheral bridge gate', () => {
  beforeEach(() => {
    localStorage.setItem('writing_books', JSON.stringify([{
      id: 'book-peripheral', title: '外围关闭测试', chapters: [], explorationDocuments: [], outlineNodes: [], outlineEdges: []
    }]))
  })

  it('migrates legacy notes to unfiled explorations idempotently', () => {
    const notes = [{ id: 'note-1', title: '地下阶梯', content: '莉娜从地下阶梯进入。' }]
    const first = migrateWritingNotesToExplorations('book-peripheral', notes)
    const second = migrateWritingNotesToExplorations('book-peripheral', notes)
    expect(first).toMatchObject({ ok: true, created: [{ role: 'exploration', sourceRefs: ['writing-note:note-1'] }], skipped: [] })
    expect(second).toMatchObject({ ok: true, created: [], skipped: ['note-1'] })
  })

  it('turns Experience output into exploration or scene intent without copying a chat shell', () => {
    const exploration = createExperienceSuggestionExploration('book-peripheral', {
      sessionId: 'session-1', messageId: 'message-2', title: '莉娜视角', content: '她先确认出口。'
    })
    const intent = createExperienceSceneIntent('book-peripheral', {
      id: 'intent-edgar', sessionId: 'session-1', title: '艾德加入场', intent: '下一段让艾德加从侧门出现', entityRefs: ['edgar']
    })
    expect(exploration).toMatchObject({ ok: true, document: { content: '她先确认出口。', sourceRefs: ['experience-session:session-1', 'experience-message:message-2'] } })
    expect(intent).toMatchObject({ ok: true, node: { id: 'intent-edgar', status: 'planned', entityRefs: ['edgar'], sourceRefs: ['experience-session:session-1'] } })
  })

  it('allows canvas to keep typed refs only and keeps the authoring core independent', () => {
    expect(buildCanvasAuthoringReference({ kind: 'exploration', id: 'exp-1', projectId: 'book-peripheral', revision: 3 }))
      .toEqual({ kind: 'exploration', id: 'exp-1', projectId: 'book-peripheral', revision: '3' })
    expect(buildCanvasAuthoringReference({ kind: 'chat', id: 'raw', projectId: 'book-peripheral' })).toBeNull()
  })
})

describe('Phase 12 Chinese input and visual ownership gate', () => {
  it('inserts paired Chinese quotes around a selection in one editor transaction', () => {
    expect(buildChineseQuoteInsertion({ data: '"', selectedText: '别动', from: 12, inputType: 'insertText' }))
      .toEqual({ text: '“别动”', caret: 16 })
    expect(buildChineseQuoteInsertion({ data: '"', selectedText: '', from: 5, inputType: 'insertText' }))
      .toEqual({ text: '“”', caret: 6 })
    expect(buildChineseQuoteInsertion({ data: '“', selectedText: '', from: 5, inputType: 'insertText' }))
      .toEqual({ text: '“”', caret: 6 })
    expect(buildChineseQuoteInsertion({ data: '”', selectedText: '', nextText: '”后文', from: 6, inputType: 'insertText' }))
      .toEqual({ text: '', caret: 7 })
    expect(buildChineseQuoteInsertion({ data: '“', selectedText: '', previousText: '“', from: 6, inputType: 'insertText' }))
      .toEqual({ text: '', caret: 6 })
    expect(buildChineseQuoteInsertion({ data: '"', selectedText: '“我们没有多少时间了。”', from: 2, inputType: 'insertText' }))
      .toEqual({ text: '“我们没有多少时间了。”', caret: 14 })
  })

  it('never intercepts IME composition or unrelated input', () => {
    expect(buildChineseQuoteInsertion({ data: '"', composing: true, inputType: 'insertCompositionText' })).toBeNull()
    expect(buildChineseQuoteInsertion({ data: 'a', inputType: 'insertText' })).toBeNull()
  })
})
