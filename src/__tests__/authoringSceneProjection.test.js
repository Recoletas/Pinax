import { describe, expect, it } from 'vitest'
import {
  AUTHORING_SCENE_PROJECTION_SCHEMA_VERSION,
  buildAuthoringSceneProjection
} from '../services/agents/authoring/authoringSceneProjection.js'
import { normalizeSceneAnchors } from '../services/agents/authoring/authoringSceneAnchors.js'

const CHAPTER = { id: 'chapter-9', title: '旧港税务所', projectId: 'book-1' }

function baseRuntimeState(overrides = {}) {
  return {
    encounteredCharacters: [
      { id: 'char_lina', name: '莉娜', goal: '查清印章来源' },
      { id: 'char_edgar', name: '艾德加' }
    ],
    factionRelations: { 税务司: -20 },
    goals: [],
    keyChoices: [],
    plotJournal: [],
    activities: [],
    memories: [],
    worldMapState: { currentCountry: '北海联邦', currentCity: '旧港', currentScene: '税务所', placeId: 'place-tax-office' },
    writingTime: { eraName: '危机纪元', year: '227', month: '9', day: '15' },
    sceneThread: {
      id: 'thread-1',
      place: { placeId: 'place-tax-office', scene: '税务所' },
      time: { eraName: '危机纪元', year: '227', month: '9', day: '15' },
      cast: [
        { characterId: 'char_lina', name: '莉娜', lastMeaningfulMove: '推开了档案室的门' }
      ]
    },
    emergenceCandidates: [],
    ...overrides
  }
}

describe('authoring scene projection (spec §10)', () => {
  it("exposes the full shared projection schema（合并4例）", async () => {
{
const projection = buildAuthoringSceneProjection({
      chapter: CHAPTER,
      documentRevision: 'rev-12',
      projectId: 'book-1',
      runtimeState: baseRuntimeState(),
      observerState: null,
      outlineItems: []
    })
    for (const key of [
      'schemaVersion',
      'projectId',
      'chapterId',
      'revision',
      'viewpointCharacter',
      'activeActor',
      'dialogueTarget',
      'location',
      'time',
      'presentCharacters',
      'activeRelations',
      'unresolvedEvents',
      'emergenceCandidates',
      'unreadChanges',
      'sourceRefs'
    ]) {
      expect(projection).toHaveProperty(key)
    }
    expect(projection.schemaVersion).toBe(AUTHORING_SCENE_PROJECTION_SCHEMA_VERSION)
    expect(projection.projectId).toBe('book-1')
    expect(projection.chapterId).toBe('chapter-9')
    expect(projection.revision).toBe('rev-12')
}
{
// encounteredCharacters 记录的是“曾遇到”，没有本场在场依据，不得进入 presentCharacters。
    const withoutThread = buildAuthoringSceneProjection({
      chapter: CHAPTER,
      documentRevision: 'rev-1',
      projectId: 'book-1',
      runtimeState: baseRuntimeState({ sceneThread: null }),
      observerState: null,
      outlineItems: []
    })
    expect(withoutThread.presentCharacters).toEqual([])

    const withThread = buildAuthoringSceneProjection({
      chapter: CHAPTER,
      documentRevision: 'rev-1',
      projectId: 'book-1',
      runtimeState: baseRuntimeState(),
      observerState: null,
      outlineItems: []
    })
    expect(withThread.presentCharacters).toHaveLength(1)
    expect(withThread.presentCharacters[0].id).toBe('char_lina')
    expect(withThread.presentCharacters[0].name).toBe('莉娜')
    expect(withThread.presentCharacters[0].evidenceSourceRefs.length).toBeGreaterThan(0)
    // 艾德加没有场景线程证据，即使被遇到过也不得标记在场。
    expect(withThread.presentCharacters.map((item) => item.id)).not.toContain('char_edgar')
}
{
const projection = buildAuthoringSceneProjection({
      chapter: CHAPTER,
      documentRevision: 'rev-2',
      projectId: 'book-1',
      runtimeState: baseRuntimeState({ worldMapState: {}, writingTime: {}, sceneThread: null }),
      observerState: null,
      outlineItems: []
    })
    expect(projection.viewpointCharacter).toBeNull()
    expect(projection.activeActor).toBeNull()
    expect(projection.dialogueTarget).toBeNull()
    expect(projection.location).toBeNull()
    expect(projection.time).toBeNull()
}
{
const runtimeState = baseRuntimeState({
      emergenceCandidates: [
        { id: 'cand-1', title: '伪造的印章', summary: '印章来源存疑', type: 'history-hook' }
      ]
    })
    const first = buildAuthoringSceneProjection({
      chapter: CHAPTER,
      documentRevision: 'rev-3',
      projectId: 'book-1',
      runtimeState,
      observerState: { derivedState: [] },
      outlineItems: []
    })
    const second = buildAuthoringSceneProjection({
      chapter: CHAPTER,
      documentRevision: 'rev-3',
      projectId: 'book-1',
      runtimeState,
      observerState: { derivedState: [] },
      outlineItems: []
    })
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    for (const person of [...first.presentCharacters]) {
      expect(person.id).toBeTruthy()
    }
    expect(first.emergenceCandidates[0].id).toBe('cand-1')
}
})

  it("is a pure function and never mutates its inputs（合并4例）", async () => {
{
const runtimeState = baseRuntimeState()
    const snapshot = JSON.stringify(runtimeState)
    buildAuthoringSceneProjection({
      chapter: CHAPTER,
      documentRevision: 'rev-4',
      projectId: 'book-1',
      runtimeState,
      observerState: null,
      outlineItems: []
    })
    expect(JSON.stringify(runtimeState)).toBe(snapshot)
}
{
const off = buildAuthoringSceneProjection({
      chapter: CHAPTER,
      documentRevision: 'rev-5',
      projectId: 'book-1',
      runtimeState: baseRuntimeState({ dialogueMode: false, dialogueCharacter: { id: 'char_edgar', name: '艾德加' } }),
      observerState: null,
      outlineItems: []
    })
    expect(off.dialogueTarget).toBeNull()

    const on = buildAuthoringSceneProjection({
      chapter: CHAPTER,
      documentRevision: 'rev-5',
      projectId: 'book-1',
      runtimeState: baseRuntimeState({ dialogueMode: true, dialogueCharacter: { id: 'char_edgar', name: '艾德加' } }),
      observerState: null,
      outlineItems: []
    })
    expect(on.dialogueTarget?.id).toBe('char_edgar')
}
{
const projection = buildAuthoringSceneProjection({
      chapter: CHAPTER,
      documentRevision: 'rev-6',
      projectId: 'book-1',
      runtimeState: baseRuntimeState(),
      observerState: {
        derivedState: [
          { id: 'obs-rel-1', kind: 'relation', text: '莉娜怀疑收债人', subject: '莉娜', relation: '怀疑', object: '收债人', sourceRefs: ['document-delta'] },
          { id: 'obs-event-1', kind: 'event', text: '伪造印章出现在证物袋', sourceRefs: ['document-delta'] },
          { id: 'obs-mem-1', kind: 'memory', text: '不应计入事件', sourceRefs: ['document-delta'] }
        ]
      },
      outlineItems: []
    })
    expect(projection.activeRelations).toHaveLength(1)
    expect(projection.activeRelations[0]).toMatchObject({ subject: '莉娜', relation: '怀疑', object: '收债人' })
    expect(projection.unresolvedEvents.map((event) => event.label)).toContain('伪造印章出现在证物袋')
}
{
const projection = buildAuthoringSceneProjection({
      chapter: CHAPTER,
      documentRevision: 'rev-7',
      projectId: 'book-1',
      runtimeState: baseRuntimeState({
        plotJournal: [
          { id: 'j-1', chapterId: 'chapter-other', unresolvedHooks: ['别章线索'] },
          { id: 'j-2', chapterId: 'chapter-9', unresolvedHooks: ['印章的真正来源'] }
        ],
        sceneThread: null
      }),
      observerState: null,
      outlineItems: []
    })
    expect(projection.unresolvedEvents[0].label).toBe('印章的真正来源')
    expect(projection.unresolvedEvents.map((item) => item.label)).not.toContain('别章线索')
}
})

  it("maps emergence candidates and unread change counts deterministically（合并4例）", async () => {
{
const projection = buildAuthoringSceneProjection({
      chapter: CHAPTER,
      documentRevision: 'rev-8',
      projectId: 'book-1',
      runtimeState: baseRuntimeState({
        emergenceCandidates: [
          { id: 'cand-a', title: '候选一', summary: '第一条涌现', type: 'goal-pressure' },
          { id: 'cand-b', title: '候选二', summary: '第二条涌现', type: 'faction-pressure' }
        ]
      }),
      observerState: null,
      outlineItems: []
    })
    expect(projection.emergenceCandidates).toHaveLength(2)
    expect(projection.emergenceCandidates[0]).toMatchObject({ id: 'cand-a', type: 'goal-pressure' })
    expect(projection.unreadChanges).toMatchObject({ characters: 0, location: 0, time: 0, events: 0, emergence: 2 })
}
{
const projection = buildAuthoringSceneProjection({})
    expect(projection.viewpointCharacter).toBeNull()
    expect(projection.activeActor).toBeNull()
    expect(projection.dialogueTarget).toBeNull()
    expect(projection.location).toBeNull()
    expect(projection.time).toBeNull()
    expect(projection.presentCharacters).toEqual([])
    expect(projection.activeRelations).toEqual([])
    expect(projection.unresolvedEvents).toEqual([])
    expect(projection.emergenceCandidates).toEqual([])
    expect(projection.unreadChanges).toMatchObject({ characters: 0, location: 0, time: 0, events: 0, emergence: 0 })
}
{
const projection = buildAuthoringSceneProjection({
      chapter: CHAPTER,
      documentRevision: 'rev-9',
      projectId: 'book-1',
      runtimeState: baseRuntimeState({
        viewpointCharacter: { id: 'char_lina', name: '莉娜' },
        activeActor: { id: 'char_edgar', name: '艾德加' }
      }),
      observerState: null,
      outlineItems: []
    })
    expect(projection.viewpointCharacter?.id).toBe('char_lina')
    expect(projection.activeActor?.id).toBe('char_edgar')
}
{
// 左栏现场条的用户选择是显式证据，不是猜测；与体验页聊天对话模式相互独立。
    const projection = buildAuthoringSceneProjection({
      chapter: CHAPTER,
      documentRevision: 'rev-10',
      projectId: 'book-1',
      runtimeState: baseRuntimeState({ dialogueTarget: { id: 'char_edgar', name: '艾德加' } }),
      observerState: null,
      outlineItems: []
    })
    expect(projection.dialogueTarget?.id).toBe('char_edgar')
}
})
})

// —— worldbook scene closure Task 5：投影 v2（锚点 + 绑定世界书 + 真实观察器）——

const WORLDBOOK = {
  id: 'wb-1',
  name: '海港世界',
  entries: Array.from({ length: 20 }, (_, index) => ({
    id: `char-npc-${index}`,
    type: 'character',
    name: `路人${index}`,
    content: '与本案无关的居民'
  })).concat([
    { id: 'char-lina', type: 'character', name: '莉娜', goal: '查清印章来源', mood: '警觉', voice: '短句、少形容词', relations: { characters: ['char-mother'] } },
    { id: 'char-mother', type: 'character', name: '母亲', relations: { characters: ['char-lina'] } },
    { id: 'char-edgar', type: 'character', name: '艾德加', relations: { characters: ['char-lina'] } },
    { id: 'place-tax-office', type: 'location', name: '税务所', content: '旧港的税务所' }
  ])
}

const ANCHOR_UNIT_B = {
  id: 'anchor-b',
  unitId: 'unit-b',
  worldbookId: 'wb-1',
  castMode: 'manual',
  presentCharacterIds: ['char-lina'],
  locationId: 'place-tax-office',
  viewpointCharacterId: 'char-lina'
}

function v2Input(overrides = {}) {
  return {
    chapter: CHAPTER,
    documentRevision: 'rev-v2',
    projectId: 'book-1',
    document: { revision: 'rev-v2', unitOrder: ['unit-a', 'unit-b', 'unit-c'] },
    activeUnitId: 'unit-b',
    worldbook: WORLDBOOK,
    sceneAnchors: normalizeSceneAnchors([ANCHOR_UNIT_B]),
    acceptedObservations: [
      {
        id: 'obs-rel-1', kind: 'relation', text: '莉娜怀疑收债人',
        subjectId: 'char-lina', objectId: 'char-edgar', relation: '怀疑',
        unitId: 'unit-b', unitRevision: 0, status: 'applied',
        sourceRefs: ['document-delta']
      },
      {
        id: 'obs-rel-stale', kind: 'relation', text: '过期观察不得进入',
        subjectId: 'char-lina', objectId: 'char-edgar', relation: '旧怨',
        unitId: 'unit-a', unitRevision: 9, status: 'applied',
        sourceRefs: []
      }
    ],
    projectMemories: [],
    outlineItems: [],
    previousChapterProjection: null,
    uiSelection: null,
    ...overrides
  }
}

describe('authoring scene projection v2 (worldbook scene closure Task 5)', () => {
  it("builds a schema-v2 projection bound to the active unit and worldbook（合并4例）", async () => {
{
const projection = buildAuthoringSceneProjection(v2Input())
    expect(projection).toMatchObject({
      schemaVersion: 2,
      activeUnitId: 'unit-b',
      worldbookId: 'wb-1',
      worldbookStatus: 'bound',
      anchorStatus: 'explicit'
    })
    expect(projection.presentCharacters.map((item) => item.id)).toEqual(['char-lina'])
    expect(projection.activeRelations[0]).toMatchObject({
      subjectId: 'char-lina',
      objectId: 'char-edgar'
    })
}
{
const projection = buildAuthoringSceneProjection(v2Input())
    // 世界书里有 23 个角色，但只有锚点证据中的莉娜在场。
    expect(projection.presentCharacters).toHaveLength(1)
    expect(projection.presentCharacters[0].name).toBe('莉娜')
    expect(projection.presentCharacters[0].sourceRefs).toContain('worldbook-entry:char-lina')
}
{
const projection = buildAuthoringSceneProjection(v2Input({
      sceneAnchors: normalizeSceneAnchors([{ ...ANCHOR_UNIT_B, presentCharacterIds: [] }])
    }))
    expect(projection.presentCharacters).toEqual([])
    expect(projection.activeRelations).toEqual([])
}
{
const projection = buildAuthoringSceneProjection(v2Input({
      acceptedObservations: [
        { id: 'x1', kind: 'relation', text: '未采纳', subjectId: 'char-lina', objectId: 'char-mother', relation: '疏远', unitId: 'unit-b', status: 'pending', sourceRefs: [] },
        { id: 'x2', kind: 'event', text: '过期事件', unitId: 'unit-old', status: 'applied', sourceRefs: [] },
        { id: 'x3', kind: 'event', text: '当前单元事件', unitId: 'unit-b', unitRevision: 0, status: 'applied', sourceRefs: ['document-delta'] }
      ]
    }))
    // 未采纳/过期观察绝不变成关系或事件（世界书本身的“有关联”边不受影响）。
    expect(projection.activeRelations.map((r) => r.label)).not.toContain('疏远')
    expect(projection.unresolvedEvents.map((e) => e.label)).toContain('当前单元事件')
    expect(projection.unresolvedEvents.map((e) => e.label)).not.toContain('过期事件')
}
})

  it("surfaces previous chapter state only as an inherited suggestion（合并4例）", async () => {
{
const projection = buildAuthoringSceneProjection(v2Input({
      sceneAnchors: [],
      previousChapterProjection: {
        chapterId: 'chapter-8',
        location: { id: 'place-tax-office', name: '税务所' },
        presentCharacters: [{ id: 'char-lina', name: '莉娜' }]
      }
    }))
    // 没有锚点：现场不直接沿用上一章，只给 inherited 建议。
    expect(projection.anchorStatus).toBe('no-anchor')
    expect(projection.inheritedSuggestion).toMatchObject({ fromChapterId: 'chapter-8' })
    expect(projection.presentCharacters).toEqual([])
}
{
const projection = buildAuthoringSceneProjection(v2Input({
      worldbook: { id: 'wb-1', entries: WORLDBOOK.entries.filter((e) => e.id !== 'place-tax-office') }
    }))
    expect(projection.worldbookStatus).toBe('bound')
    expect(projection.missingRefs).toContain('place-tax-office')
}
{
const projection = buildAuthoringSceneProjection(v2Input({
      worldbook: null,
      sceneAnchors: normalizeSceneAnchors([{ ...ANCHOR_UNIT_B, worldbookId: '' }])
    }))
    expect(projection.worldbookStatus).toBe('unbound')
}
{
const first = buildAuthoringSceneProjection(v2Input())
    const same = buildAuthoringSceneProjection(v2Input())
    const changedAnchor = buildAuthoringSceneProjection(v2Input({
      sceneAnchors: normalizeSceneAnchors([{ ...ANCHOR_UNIT_B, locationId: 'place-other' }])
    }))
    const changedRevision = buildAuthoringSceneProjection(v2Input({ documentRevision: 'rev-v3' }))
    expect(first.projectionFingerprint).toBeTruthy()
    expect(first.projectionFingerprint).toBe(same.projectionFingerprint)
    expect(first.projectionFingerprint).not.toBe(changedAnchor.projectionFingerprint)
    expect(first.projectionFingerprint).not.toBe(changedRevision.projectionFingerprint)
}
})
})

describe('scene curation candidates from the full worldbook directory (Task 10)', () => {
  it('searches the complete directory beyond the default bounded recommendations', async () => {
    const { buildSceneCurationCandidates } = await import('../services/agents/authoring/authoringWorldbookSceneAdapter.js')
    // 默认推荐有界（≤8）；查询可命中默认前八之外的条目。
    const noQuery = buildSceneCurationCandidates({ axis: 'character', worldbook: WORLDBOOK })
    expect(noQuery.length).toBeLessThanOrEqual(8)
    const queried = buildSceneCurationCandidates({ axis: 'character', worldbook: WORLDBOOK, query: '路人19' })
    expect(queried.some((item) => item.id === 'char-npc-19')).toBe(true)
    const selected = buildSceneCurationCandidates({
      axis: 'location', worldbook: WORLDBOOK, query: '', selectedIds: ['place-tax-office']
    })
    expect(selected[0]).toMatchObject({ id: 'place-tax-office', selected: true })
  })
})

describe('v2 projection never leaks Experience session state (复验修复 2)', () => {
  it('ignores runtimeState.sceneThread for sceneId and sourceRefs in the anchor path', () => {
    const projection = buildAuthoringSceneProjection(v2Input({
      runtimeState: {
        sceneThread: { id: 'thread-legacy', place: { placeId: 'x' }, cast: [{ characterId: 'ghost', name: '幽灵' }] }
      },
      // v2 现场人物只来自锚点，不吸收旧会话 cast。
      sceneAnchors: normalizeSceneAnchors([{ ...ANCHOR_UNIT_B, presentCharacterIds: ['char-lina'] }])
    }))
    expect(projection.sceneId).toBeNull()
    expect(projection.sourceRefs.some((ref) => String(ref).startsWith('scene-thread:'))).toBe(false)
    expect(projection.presentCharacters.map((p) => p.id)).toEqual(['char-lina'])
  })
})
