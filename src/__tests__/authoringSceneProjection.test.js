import { describe, expect, it, vi } from 'vitest'
import {
  AUTHORING_SCENE_PROJECTION_SCHEMA_VERSION,
  buildAuthoringSceneProjection
} from '../services/agents/authoring/authoringSceneProjection.js'
import { normalizeSceneAnchors, removeSceneAnchor, upsertSceneAnchor } from '../services/agents/authoring/authoringSceneAnchors.js'
import { buildAuthoringScenePressureProjection } from '../services/agents/authoring/authoringScenePressureProjection.js'
import { parseAuthoringSceneDirectionSet } from '../services/agents/authoring/authoringSceneDirectionSet.js'
import {
  buildAuthoringSceneLaboratorySelection,
  createAuthoringSceneLaboratoryRun,
  selectAuthoringSceneLaboratoryDirection,
  validateAuthoringSceneLaboratoryRun
} from '../services/agents/authoring/authoringSceneLaboratoryRun.js'
import {
  buildUnitSemanticProjection,
  createSceneBeatDraft,
  setSceneBeatBoundary
} from '../services/agents/authoring/unitSemanticProjection.js'

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
  viewpointCharacterId: 'char-lina',
  time: { label: '入夜后', period: '夜晚' }
}

function v2Input(overrides = {}) {
  return {
    chapter: CHAPTER,
    documentRevision: 'rev-v2',
    projectId: 'book-1',
    document: {
      revision: 'rev-v2',
      unitOrder: ['unit-a', 'unit-b', 'unit-c'],
      content: ['unit-a', 'unit-b', 'unit-c'].map((unitId) => ({ attrs: { unitId, unitRevision: 0 } }))
    },
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
    expect(projection.time).toMatchObject({ label: '入夜后', period: '夜晚' })
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
        { id: 'x2b', kind: 'event', text: '同单元旧修订', unitId: 'unit-b', unitRevision: 9, status: 'applied', sourceRefs: [] },
        { id: 'x3', kind: 'event', text: '当前单元事件', unitId: 'unit-b', unitRevision: 0, status: 'applied', sourceRefs: ['document-delta'] }
      ]
    }))
    // 未采纳/过期观察绝不变成关系或事件（世界书本身的“有关联”边不受影响）。
    expect(projection.activeRelations.map((r) => r.label)).not.toContain('疏远')
    expect(projection.unresolvedEvents.map((e) => e.label)).toContain('当前单元事件')
    expect(projection.unresolvedEvents.map((e) => e.label)).not.toContain('过期事件')
    expect(projection.unresolvedEvents.map((e) => e.label)).not.toContain('同单元旧修订')
}
{
const projection = buildAuthoringSceneProjection(v2Input({
      runtimeState: { activeActor: { id: 'char-lina', name: '莉娜' } }
    }))
    expect(projection.activeActor).toMatchObject({ id: 'char-lina', name: '莉娜' })
    // 行动者是 run-only UI 选择，不改变锚点本身。
    expect(projection.anchorId).toBeTruthy()
}
{
    // F1-2 fixed reading fixtures: all planning evidence comes from one frozen
    // C1 session; no planner receives tool authorization and insufficient data
    // never gets padded into template directions.
    const deepFreeze = (value) => {
      if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
      for (const child of Object.values(value)) deepFreeze(child)
      return Object.freeze(value)
    }
    const makeSession = ({ scene = {}, references = [], sceneIntents = [], blocks = [] } = {}) => deepFreeze({
      kind: 'authoring-run-session',
      status: 'prepared',
      target: {
        projectId: 'book-1', chapterId: 'chapter-9', documentId: 'chapter-9',
        unitId: 'unit-b', nodeId: 'node-b', documentRevision: 'doc-r1',
        unitRevision: '1', nodeRevision: '1'
      },
      sceneProjection: {
        projectId: 'book-1', chapterId: 'chapter-9', activeUnitId: 'unit-b',
        projectionFingerprint: 'scene-fp-fixed', worldbookStatus: 'bound', anchorStatus: 'explicit',
        viewpointCharacter: { id: 'char-lina', name: '莉娜', sourceRefs: ['worldbook-entry:char-lina'] },
        presentCharacters: [{ id: 'char-lina', name: '莉娜', sourceRefs: ['worldbook-entry:char-lina'] }],
        activeRelations: [], unresolvedEvents: [], ...scene
      },
      references,
      sceneIntents,
      candidates: blocks.map((block) => ({
        id: block.candidateId,
        kind: block.kind,
        label: block.label,
        primarySourceRef: block.sourceRefs[0],
        revision: block.revision,
        representations: { full: block.text, summary: block.text }
      })),
      manifest: {
        kind: 'compiled-context-manifest',
        fingerprint: `manifest-${blocks.map((block) => block.candidateId).join('-') || 'empty'}`,
        target: { projectId: 'book-1', chapterId: 'chapter-9', unitId: 'unit-b' },
        dependencies: { 'document:chapter-9': 'doc-r1' },
        blocks,
        excluded: []
      },
      toolAuthorization: { tools: ['world_lookup'] }
    })
    const block = (id, kind, label, text, ref) => ({
      candidateId: id, kind, label, text, sourceRefs: [ref], revision: `${id}-r1`
    })
    const fixtures = [
      makeSession({
        scene: {
          presentCharacters: [
            { id: 'char-lina', name: '莉娜', sourceRefs: ['worldbook-entry:char-lina'] },
            { id: 'char-edgar', name: '艾德加', sourceRefs: ['worldbook-entry:char-edgar'] }
          ],
          activeRelations: [{ subjectId: 'char-lina', objectId: 'char-edgar', label: '莉娜怀疑艾德加隐瞒总册下落', sourceRefs: ['worldbook-entry:char-edgar'] }]
        },
        blocks: [block('dual-goal', 'worldbook-entry', '艾德加', '艾德加试图掩盖总册失窃。', 'worldbook-entry:char-edgar')]
      }),
      makeSession({
        sceneIntents: [{ entityId: 'char-edgar', label: '安排下一段 · 艾德加', content: '安排艾德加在下一段进入当前场。', sourceRefs: ['worldbook-entry:char-edgar'] }],
        blocks: [block('arrival', 'scene-intent', '艾德加入场', '安排艾德加在下一段进入当前场。', 'worldbook-entry:char-edgar')]
      }),
      makeSession({
        scene: { location: { id: 'place-tax-office', name: '旧港税务所', sourceRefs: ['worldbook-entry:place-tax-office'], mapStatus: 'confirmed' } },
        blocks: [block('place-rule', 'worldbook-entry', '旧港税务所', '第三排第七格只能由黄铜钥匙开启。', 'worldbook-entry:place-tax-office')]
      }),
      makeSession({
        scene: { unresolvedEvents: [{ id: 'event-bell', label: '钟声提前响起', sourceRefs: ['observation:event-bell'] }] },
        blocks: [block('event', 'scene-projection', '未决事件', '钟声提前响起。', 'observation:event-bell')]
      }),
      makeSession({
        references: [{ id: 'note-1', label: '速记', excerpt: '让莉娜用假编号试探知情者。', usageRole: 'intent', sourceRefs: ['exploration-doc:note-1'] }],
        blocks: [block('reference', 'exploration-doc', '速记', '让莉娜用假编号试探知情者。', 'exploration-doc:note-1')]
      })
    ]
    const fixtureDirectionActions = [
      ['先收起总册，不让艾德加看见缺页。', '把缺页摊开，要求艾德加解释失窃时间。', '故意说错失窃年份，观察艾德加是否纠正。'],
      ['在门外截住艾德加，先问清来意。', '让艾德加直接进入档案室共同核对。', '藏起钥匙，只让艾德加辨认门锁痕迹。'],
      ['用黄铜钥匙开启第三排第七格。', '封住暗格，先检查周围是否有人来过。', '用错误钥匙试探机关的响应规律。'],
      ['立即循声前往钟楼确认敲钟者。', '锁住档案室，等待第二次钟声定位。', '让同伴去钟楼，自己守住总册。'],
      ['照速记故意报错暗格编号。', '先验证速记来源，再决定是否试探。', '放弃假编号，直接询问对方是否知情。']
    ]
    const beforeStorage = JSON.stringify({ ...localStorage })
    for (const [fixtureIndex, session] of fixtures.entries()) {
      const planner = vi.fn(async (request) => {
        expect(request.toolPolicy).toEqual({ allowTools: false, toolChoice: 'none' })
        expect(request).not.toHaveProperty('toolAuthorization')
        expect(request.contextManifest).toBe(session.manifest)
        const evidenceRef = request.pressureProjection.evidence[0].ref
        const entityRef = request.pressureProjection.participants[0]?.ref
          || request.pressureProjection.location?.ref
        return {
          pressure: { statement: request.pressureProjection.pressureSeeds[0].summary, evidenceRefs: [evidenceRef] },
          directions: [
            { id: 'hold', title: '保留主动', action: fixtureDirectionActions[fixtureIndex][0], immediateGain: '保住调查主动权', cost: '可能错过立即求证', evidenceRefs: [evidenceRef], entityRefs: entityRef ? [entityRef] : [] },
            { id: 'share', title: '正面核对', action: fixtureDirectionActions[fixtureIndex][1], immediateGain: '更快确认关键事实', cost: '交出部分控制权', evidenceRefs: [evidenceRef], entityRefs: entityRef ? [entityRef] : [] },
            { id: 'probe', title: '改变处置', action: fixtureDirectionActions[fixtureIndex][2], immediateGain: '获得另一条判断依据', cost: '误判会暴露自己的意图', evidenceRefs: [evidenceRef], entityRefs: entityRef ? [entityRef] : [] }
          ]
        }
      })
      const laboratory = createAuthoringSceneLaboratoryRun({ prepareSession: async () => ({ ok: true, session }), planDirections: planner })
      const prepared = await laboratory.prepare({ request: { intent: { instruction: '推演本场' } } })
      expect(prepared.ok).toBe(true)
      expect(prepared.run.phase).toBe('ready')
      expect(prepared.run.runSession).toBe(session)
      expect(new Set(prepared.run.directionSet.directions.map((direction) => direction.action)).size).toBeGreaterThanOrEqual(2)
      expect(planner).toHaveBeenCalledTimes(1)
      const selected = selectAuthoringSceneLaboratoryDirection(prepared.run, 'share')
      expect(selected.run).toMatchObject({ phase: 'direction-selected', selectedDirectionId: 'share' })
      expect(Object.isFrozen(selected.run)).toBe(true)
      const selection = buildAuthoringSceneLaboratorySelection(selected.run)
      expect(selection).toMatchObject({
        ok: true,
        selection: {
          kind: 'authoring-scene-direction-selection',
          id: 'share',
          title: '正面核对',
          sessionFingerprint: session.manifest.fingerprint,
          evidenceRefs: expect.any(Array),
          fingerprint: expect.stringMatching(/^scene-direction-selection-/)
        }
      })
      expect(JSON.stringify(selection)).not.toContain(fixtureDirectionActions[fixtureIndex][0])
      expect(JSON.stringify(selection)).not.toContain(fixtureDirectionActions[fixtureIndex][2])
      const live = await validateAuthoringSceneLaboratoryRun(selected.run, async () => ({ 'document:chapter-9': 'doc-r1' }))
      expect(live).toMatchObject({ ok: true, runSession: session, selection: { id: 'share' } })
      if (fixtureIndex === 0) {
        const stale = await validateAuthoringSceneLaboratoryRun(selected.run, async () => ({ 'document:chapter-9': 'doc-r2' }))
        expect(stale).toMatchObject({ ok: false, reason: 'scene-session-stale', dependencyIssues: [expect.objectContaining({ reason: 'revision-changed' })] })
      }
    }

    const insufficientSession = makeSession({ blocks: [block('prose', 'manuscript-unit', '当前正文', '雨落在窗外。', 'unit:chapter-9:unit-b')] })
    const insufficientPlanner = vi.fn()
    const insufficient = await createAuthoringSceneLaboratoryRun({
      prepareSession: async () => ({ ok: true, session: insufficientSession }),
      planDirections: insufficientPlanner
    }).prepare()
    expect(insufficient).toMatchObject({ ok: true, run: { phase: 'insufficient', directionSet: null } })
    expect(insufficientPlanner).not.toHaveBeenCalled()

    const pressure = buildAuthoringScenePressureProjection(fixtures[0]).projection
    const unknown = parseAuthoringSceneDirectionSet({
      pressure: { statement: '试探来客。', evidenceRefs: [pressure.evidence[0].ref] },
      directions: [
        { id: 'a', title: '试探', action: '询问总册。', immediateGain: '得到回答', cost: '暴露目的', evidenceRefs: [pressure.evidence[0].ref], entityRefs: ['worldbook-entry:unknown'] },
        { id: 'b', title: '离开', action: '锁门后离开。', immediateGain: '保住线索', cost: '失去时机', evidenceRefs: [pressure.evidence[0].ref], entityRefs: [] }
      ]
    }, pressure)
    expect(unknown).toMatchObject({ ok: false, reason: 'direction-entity-unknown' })
    const duplicate = parseAuthoringSceneDirectionSet({
      pressure: { statement: '必须处理眼前线索。', evidenceRefs: [pressure.evidence[0].ref] },
      directions: [
        { id: 'a', title: '先问', action: '当面询问总册下落。', immediateGain: '得到回答', cost: '暴露目的', evidenceRefs: [pressure.evidence[0].ref] },
        { id: 'b', title: '再问', action: '当面询问总册下落！', immediateGain: '确认态度', cost: '引起警惕', evidenceRefs: [pressure.evidence[0].ref] }
      ]
    }, pressure)
    expect(duplicate).toMatchObject({ ok: false, reason: 'direction-action-duplicate' })
    expect(parseAuthoringSceneDirectionSet('{broken', pressure)).toMatchObject({ ok: false, reason: 'direction-output-invalid-json' })
    expect(parseAuthoringSceneDirectionSet({ status: 'insufficient-evidence', missing: ['人物目标'] }, pressure))
      .toMatchObject({ ok: false, reason: 'insufficient-evidence', missing: ['人物目标'] })

    const failedPlanner = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'TIMEOUT' }))
      .mockImplementationOnce(async (request) => {
        const evidenceRef = request.pressureProjection.evidence[0].ref
        return {
          pressure: { statement: '来客迫使莉娜立刻决定是否公开缺页。', evidenceRefs: [evidenceRef] },
          directions: [
            { id: 'retry-a', title: '暂时隐瞒', action: '先收起总册再询问来意。', immediateGain: '保住主动权', cost: '来客会察觉回避', evidenceRefs: [evidenceRef], entityRefs: [] },
            { id: 'retry-b', title: '当面核对', action: '摊开缺页要求对方解释。', immediateGain: '立即取得回应', cost: '提前暴露关键线索', evidenceRefs: [evidenceRef], entityRefs: [] }
          ]
        }
      })
    const failedLaboratory = createAuthoringSceneLaboratoryRun({
      prepareSession: async () => ({ ok: true, session: fixtures[0] }),
      planDirections: failedPlanner
    })
    const phases = []
    const failedRun = await failedLaboratory.prepare({ onPhase: (phase) => phases.push(phase) })
    expect(failedRun).toMatchObject({ ok: false, reason: 'scene-direction-planning-failed', cause: 'TIMEOUT' })
    expect(failedPlanner).toHaveBeenCalledTimes(1)
    expect(phases).toEqual(['preparing-context', 'planning-directions'])
    const retried = await failedLaboratory.retryDirections({
      session: failedRun.session,
      pressureProjection: failedRun.pressureProjection
    })
    expect(retried).toMatchObject({ ok: true, run: { phase: 'ready', runSession: fixtures[0] } })
    expect(failedPlanner).toHaveBeenCalledTimes(2)
    expect(JSON.stringify({ ...localStorage })).toBe(beforeStorage)
}
{
    // F1-4 semantic/boundary calibration stays pure and multi-axis. It must
    // neither revive fixed-three-paragraph packing nor confuse depiction with
    // a world-state change.
    const environment = buildUnitSemanticProjection({
      text: '雨落在税务所的高窗上。\n\n灰尘沿书架边缘铺着。\n\n穹顶映着一层暗淡的蓝光。'
    })
    expect(environment.paragraphs.every((paragraph) => paragraph.axes.effects.includes('depicts'))).toBe(true)
    expect(environment.paragraphs.some((paragraph) => paragraph.axes.effects.includes('changes'))).toBe(false)

    const dialogue = createSceneBeatDraft({
      text: '“你来晚了。”\n\n“路上有人跟着我。”\n\n“那就别说名字。”\n\n“总册呢？”'
    })
    expect(dialogue.units).toHaveLength(1)
    expect(dialogue.paragraphs.every((paragraph) => paragraph.axes.functions.includes('dialogue'))).toBe(true)

    const changedWorld = createSceneBeatDraft({
      text: '莉娜推开暗格，穹顶最暗的那颗星随即亮起。\n\n她意识到机关已经回应了黄铜钥匙。'
    })
    expect(changedWorld.paragraphs[0].axes).toMatchObject({ subjects: expect.arrayContaining(['environment']), effects: expect.arrayContaining(['changes']) })
    expect(changedWorld.units).toHaveLength(2)

    const importedChapter = createSceneBeatDraft({
      text: [
        '雾从码头一直漫到旧港的石阶。',
        '莉娜把潮湿的总册夹在外套里。',
        '“钟声比约定早了一刻。”艾德加说。',
        '“所以有人已经进去过。”',
        '他们没有再说话，只沿着税务所外墙前行。',
        '次日清晨，钟楼广场只剩下烧焦的绳索。',
        '守卫认出那是昨夜封门用的绳结。',
        '莉娜意识到失窃者一直留在城内。',
        '她把这一发现写在总册最后一页。',
        '窗外的雾仍贴着钟楼缓慢流动。'
      ].join('\n\n')
    })
    expect(importedChapter.units.length).toBeGreaterThanOrEqual(3)
    expect(importedChapter.units).not.toHaveLength(Math.ceil(importedChapter.paragraphs.length / 3))

    const transitionBoundary = importedChapter.boundaries.find((boundary) => boundary.reason === 'scene-transition')
    expect(transitionBoundary).toBeTruthy()
    const authorMerged = setSceneBeatBoundary(importedChapter, transitionBoundary.key, false)
    expect(authorMerged.boundaries.find((boundary) => boundary.key === transitionBoundary.key))
      .toMatchObject({ split: false, source: 'author' })
    const revised = createSceneBeatDraft({
      text: importedChapter.paragraphs.map((paragraph, index) => index === 4 ? `${paragraph.text}他们在门前停了很久。` : paragraph.text).join('\n\n'),
      corrections: authorMerged.corrections
    })
    expect(revised.boundaries.some((boundary) => boundary.source === 'author')).toBe(false)
    expect(Object.isFrozen(revised)).toBe(true)

    const hintedText = '雨声压住了走廊里的脚步。\n\n莉娜推开档案室的门。\n\n“总册被人动过。”'
    const hinted = createSceneBeatDraft({
      text: hintedText,
      boundaryHints: [{ offset: hintedText.indexOf('\n\n') + 2, split: true, reason: 'rhetorical-shift' }],
      sessionFingerprint: 'manifest-f1-5',
      direction: {
        kind: 'authoring-scene-direction-selection', fingerprint: 'direction-f1-5',
        action: '推门核对总册', immediateGain: '确认线索', cost: '暴露行踪', evidenceRefs: ['worldbook-entry:place-tax-office']
      }
    })
    expect(hinted).toMatchObject({
      sessionFingerprint: 'manifest-f1-5',
      directionFingerprint: 'direction-f1-5',
      beat: { action: '推门核对总册' },
      prose: expect.stringContaining('雨声'),
      proposedUnits: expect.any(Array)
    })
    expect(hinted.proposedUnits).toHaveLength(hinted.units.length)
    expect(hinted.boundaries[0]).toMatchObject({ split: true, source: 'response-hint', reason: 'rhetorical-shift' })
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
const projection = buildAuthoringSceneProjection(v2Input({
      expectedWorldbookId: 'wb-missing',
      worldbook: null,
      sceneAnchors: []
    }))
    expect(projection).toMatchObject({ worldbookId: 'wb-missing', worldbookStatus: 'missing' })
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

describe('scene anchor revision guard', () => {
  it('accepts equal opaque revision tokens without numeric coercion', () => {
    const result = upsertSceneAnchor({
      anchors: [],
      anchor: ANCHOR_UNIT_B,
      expectedDocumentRevision: 'writing-k2n-2f-9',
      liveDocumentRevision: 'writing-k2n-2f-9'
    })
    expect(result.ok).toBe(true)
  })

  it('removes only the active explicit anchor so the resolver can inherit again', () => {
    const anchors = normalizeSceneAnchors([
      { ...ANCHOR_UNIT_B, unitId: 'unit-a' },
      { ...ANCHOR_UNIT_B, unitId: 'unit-b', locationId: 'place-other' }
    ])
    const result = removeSceneAnchor({
      anchors,
      unitId: 'unit-b',
      expectedDocumentRevision: 'rev-v2',
      liveDocumentRevision: 'rev-v2'
    })
    expect(result.ok).toBe(true)
    expect(result.anchors.map((anchor) => anchor.unitId)).toEqual(['unit-a'])
    expect(removeSceneAnchor({
      anchors,
      unitId: 'unit-b',
      expectedDocumentRevision: 'old',
      liveDocumentRevision: 'new'
    })).toMatchObject({ ok: false, reason: 'stale' })
  })
})
