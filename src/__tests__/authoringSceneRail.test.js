import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AuthoringSceneRail from '../components/authoring/AuthoringSceneRail.vue'
import AuthoringOutlinePanel from '../components/authoring/AuthoringOutlinePanel.vue'
import AuthoringInspectorDetail from '../components/authoring/AuthoringInspectorDetail.vue'
import AuthoringExceptionReview from '../components/authoring/AuthoringExceptionReview.vue'
import AuthoringMemoryReview from '../components/authoring/AuthoringMemoryReview.vue'
import AuthoringMemoryNotice from '../components/authoring/AuthoringMemoryNotice.vue'
import AuthoringSceneCuration from '../components/authoring/AuthoringSceneCuration.vue'
import AuthoringSceneCurationPreview from '../components/authoring/AuthoringSceneCurationPreview.vue'
import {
  createAuthoringInspectorState,
  openAuthoringInspectorDetail,
  returnFromAuthoringInspectorDetail,
  toggleAuthoringInspectorDual
} from '../services/authoring/authoringInspectorRoute.js'
import { buildAuthoringCaretContext, buildAuthoringSettingContext, extractAuthoringCaretWindow } from '../services/authoring/authoringSettingContext.js'
import { normalizeWritingAnnotation } from '../services/writing/writingAnnotations.js'
import { resolveWritingWorldbookReference } from '../services/writing/writingWorldbookReferences.js'
import { buildWritingWorldbookMentions } from '../services/writing/writingWorldbookMentions.js'
import { createWritingDocument } from '../services/writing/writingDocumentSchema.js'
import {
  buildAuthoringQuickWordCatalog,
  resolveAuthoringQuickWordPrefix,
  resolveAuthoringQuickWordSuggestions
} from '../services/authoring/authoringQuickWords.js'
import { buildAuthoringSceneLocationProjection } from '../services/agents/authoring/authoringSceneLocationProjection.js'

// worldbook scene closure Task 8：左侧“当前场”稿件原生索引契约。
// 标题 当前场；无逐人 行动者/对象 按钮；单一 调整 动作；
// 投影状态四态；最多四人 + 一条未决事件后收 +N；无 pill / 横滚。

function makeProjection(overrides = {}) {
  return {
    schemaVersion: 2,
    projectId: 'book-1',
    chapterId: 'chapter-9',
    revision: 'rev-1',
    activeUnitId: 'unit-b',
    worldbookId: 'wb-1',
    worldbookStatus: 'bound',
    anchorStatus: 'explicit',
    viewpointCharacter: { id: 'char_lina', name: '莉娜' },
    activeActor: null,
    dialogueTarget: { id: 'char_collector', name: '收债人' },
    location: { id: 'place-tax-office', name: '旧港税务所', region: '北海联邦 · 旧港' },
    time: { id: 'time_crisis', label: '危机纪元 227年 9月 15日' },
    presentCharacters: [
      { id: 'char_lina', name: '莉娜' },
      { id: 'char_edgar', name: '艾德加' }
    ],
    activeRelations: [],
    unresolvedEvents: [
      { id: 'event-seal', label: '伪造印章的来源', sourceRefs: ['plot-journal:j2'] }
    ],
    emergenceCandidates: [],
    unreadChanges: { characters: 0, location: 0, time: 0, events: 1, emergence: 0 },
    sourceRefs: [],
    ...overrides
  }
}

function mountRail(projection = makeProjection(), props = {}) {
  return mount(AuthoringSceneRail, {
    props: { projection, ...props }
  })
}

describe('authoring scene rail — current scene index (Task 8)', () => {
  it('keeps public authoring shell controls honest and component-owned', async () => {
    const outline = mount(AuthoringOutlinePanel, {
      props: {
        projectFilter: 'causes',
        projectNodes: [
          { id: 'project-a', title: '人物线节点', intent: '莉娜决定追查。', status: 'drafted', chapterRefs: ['chapter-9'], explorationRefs: [{ documentId: 'exp-1', role: 'alternative', state: 'proposed' }] },
          { id: 'project-b', title: '无关节点', intent: '港口下雨。', status: 'drafted', chapterRefs: [] }
        ],
        projectEdges: [{ id: 'edge-a', kind: 'causes', fromNodeId: 'project-a', toNodeId: 'missing-node' }],
        projectConflicts: [{ fingerprint: '冲突节点::同一内容', title: '冲突节点', occurrences: [{ chapterId: 'chapter-9' }] }],
        chapters: [{ id: 'chapter-9', title: '石柱下的星图' }],
        explorations: [{ id: 'exp-1', title: '税务所的另一种入口' }]
      }
    })
    expect(outline.findAll('.authoring-outline-row.is-project')).toHaveLength(1)
    expect(outline.text()).toContain('人物线节点')
    expect(outline.text()).not.toContain('无关节点')
    expect(outline.text()).not.toContain('当前只读')
    expect(outline.text()).toContain('冲突节点')
    const sourceChapter = outline.find('.authoring-outline-conflict-chapters button')
    expect(sourceChapter.text()).toBe('第一章 石柱下的星图')
    await sourceChapter.trigger('click')
    expect(outline.emitted('open-project-chapter')?.[0]).toEqual(['chapter-9'])
    await outline.find('.authoring-outline-row.is-project').trigger('click')
    expect(outline.find('.is-project-detail').text()).toContain('莉娜决定追查。')
    expect(outline.find('.is-project-detail').text()).toContain('已移除节点')
    expect(outline.find('.is-project-detail').text()).toContain('税务所的另一种入口')
    const projectLinks = outline.findAll('.authoring-outline-project-links button')
    expect(projectLinks).toHaveLength(2)
    await projectLinks[0].trigger('click')
    await projectLinks[1].trigger('click')
    expect(outline.emitted('open-project-chapter')?.at(-1)).toEqual(['chapter-9'])
    expect(outline.emitted('open-project-exploration')?.[0]).toEqual(['exp-1'])
    expect(outline.find('.is-project-detail').exists()).toBe(true)

    const dangling = mount(AuthoringOutlinePanel, {
      props: {
        dual: true,
        projectNodes: [{
          id: 'dangling', title: '残留引用', intent: '等待整理。', status: 'planned',
          chapterRefs: ['missing-chapter'],
          explorationRefs: [{ documentId: 'missing-exploration', state: 'proposed' }]
        }]
      }
    })
    await dangling.find('.authoring-outline-row.is-project').trigger('click')
    const danglingLinks = dangling.findAll('.authoring-outline-project-links button')
    expect(danglingLinks).toHaveLength(2)
    expect(danglingLinks.every((button) => button.attributes('disabled') !== undefined)).toBe(true)
    expect(dangling.text()).toContain('引用已失效')
    await danglingLinks[0].trigger('click')
    await danglingLinks[1].trigger('click')
    expect(dangling.emitted('open-project-chapter')).toBeUndefined()
    expect(dangling.emitted('open-project-exploration')).toBeUndefined()

    const memoryNotice = mount(AuthoringMemoryNotice, {
      props: { notice: { text: '已安静提取候选', count: 1, reviewable: false } }
    })
    expect(memoryNotice.find('button').exists()).toBe(false)
    await memoryNotice.setProps({ notice: { text: '有 1 条记忆冲突待确认', count: 1, reviewable: true } })
    await memoryNotice.find('button').trigger('click')
    expect(memoryNotice.emitted('review')).toHaveLength(1)

    const staleDetail = mount(AuthoringInspectorDetail, {
      props: { detail: { kind: 'character', id: 'missing-character' }, model: null }
    })
    expect(staleDetail.text()).toContain('这条详情已不在当前场')
    const staleActions = staleDetail.findAll('.writing-inspector-detail__actions button')
    expect(staleActions.length).toBeGreaterThan(0)
    expect(staleActions.every((button) => button.attributes('disabled') !== undefined)).toBe(true)

    const activeDetail = mount(AuthoringInspectorDetail, {
      props: {
        detail: { kind: 'character', id: 'character-1' },
        model: { id: 'character-1', name: '莉娜', sections: [] }
      }
    })
    await activeDetail.find('.writing-inspector-detail__actions button').trigger('click')
    expect(activeDetail.emitted('set-actor')?.[0]).toEqual(['character-1'])

    const locationBridge = buildAuthoringSceneLocationProjection({
      projectId: 'book-1',
      chapterId: 'chapter-9',
      writingUnitId: 'unit-b',
      location: { id: 'place-tax-office', name: '旧港税务所' },
      worldbook: {
        id: 'wb-1', name: '雾港纪事', entries: [{
          id: 'place-tax-office', type: 'location', name: '旧港税务所',
          mapBinding: { status: 'confirmed', placeId: 'place:tax-office', mapAssetId: 'map-mist', x: 18, y: 29 },
          metadata: { place: { parentRef: { targetName: '北海联邦 · 旧港' }, relations: [{ type: 'adjacent', targetName: '钟楼广场' }] } }
        }]
      }
    })
    expect(locationBridge).toMatchObject({
      availability: 'ready', sourceRef: 'worldbook-entry:place-tax-office',
      mapStatus: 'confirmed', mapStatusLabel: '已落图', placeId: 'place:tax-office'
    })
    expect(locationBridge.mapRoute.query).toMatchObject({
      bookId: 'book-1', worldbookId: 'wb-1', entryId: 'place-tax-office', placeId: 'place:tax-office'
    })
    expect(JSON.stringify(locationBridge)).not.toContain('"x":18')
    expect(JSON.stringify(locationBridge)).not.toContain('"y":29')
    const locationDetail = mount(AuthoringInspectorDetail, {
      props: {
        detail: { kind: 'location', id: 'place-tax-office' },
        model: { id: 'place-tax-office', name: '旧港税务所', sections: [], locationBridge }
      }
    })
    expect(locationDetail.get('[data-test="scene-location-map-bridge"]').text()).toContain('已落图')
    expect(locationDetail.text()).toContain('相邻 钟楼广场')
    await locationDetail.get('[data-test="scene-location-map-bridge"] button').trigger('click')
    expect(locationDetail.emitted('open-map')?.[0]).toEqual([{ kind: 'location', id: 'place-tax-office' }])
    expect(locationDetail.find('.writing-inspector-detail__actions button').text()).toBe('查看世界书地点')

    const unboundLocation = buildAuthoringSceneLocationProjection({
      projectId: 'book-1', location: { id: 'place-unbound' },
      worldbook: { id: 'wb-1', entries: [{ id: 'place-unbound', type: 'location', name: '孤塔' }] }
    })
    expect(unboundLocation).toMatchObject({ mapStatus: 'unbound', mapStatusLabel: '未落图', canOpenMap: true })

    const exceptionReview = mount(AuthoringExceptionReview, {
      props: {
        open: true,
        exceptions: [{ id: 'exception-1', reason: 'locked-conflict', summary: '正文与锁定设定不一致。' }]
      }
    })
    await exceptionReview.find('.authoring-exception-review__dismiss').trigger('click')
    expect(exceptionReview.emitted('close')).toHaveLength(1)
    expect(exceptionReview.find('.authoring-exception-review').exists()).toBe(false)

    const memoryReview = mount(AuthoringMemoryReview, {
      props: {
        open: true,
        candidates: [{ id: 'memory-1', content: '旧港税务所已经关闭。', conflictsWith: ['memory-0'] }]
      }
    })
    await memoryReview.find('[data-action="merge-candidate"]').trigger('click')
    expect(memoryReview.vm.$options.emits).toContain('merge')
    expect(memoryReview.emitted('merge')?.[0]).toEqual(['memory-1'])

    for (const file of [
      'AuthoringMemoryReview.vue',
      'AuthoringMemoryNotice.vue',
      'AuthoringTransientNotice.vue',
      'AuthoringExceptionReview.vue'
    ]) {
      const source = readFileSync(resolve(__dirname, `../components/authoring/${file}`), 'utf8')
      expect(source).toContain('<style scoped>')
    }
    const curationSource = readFileSync(resolve(__dirname, '../components/authoring/AuthoringSceneCuration.vue'), 'utf8')
    expect(curationSource).not.toContain('class="writing-inspector-detail__back"')

    const curation = mount(AuthoringSceneCuration, {
      props: {
        draft: {
          unitId: 'unit-1', presentCharacterIds: [], viewpointCharacterId: '', locationId: '',
          time: { label: '', period: '' }
        },
        worldbookStatus: 'bound',
        characterCandidates: [
          { id: 'char-lina', name: '莉娜' },
          { id: 'char-edgar', name: '艾德加' }
        ],
        locationCandidates: [
          { id: 'place-port', name: '旧港' },
          { id: 'place-tower', name: '孤塔' }
        ]
      }
    })
    await curation.find('.scene-curation__person-toggle').trigger('click')
    expect(curation.text()).toContain('加入当前场')
    await curation.find('.scene-curation__candidate-actions .is-current').trigger('click')
    const selectedDraft = curation.emitted('update-draft')?.at(-1)?.[0]
    expect(selectedDraft.presentCharacterIds).toEqual(['char-lina'])
    await curation.setProps({ draft: selectedDraft })
    await curation.find('.scene-curation__viewpoint').trigger('click')
    expect(curation.emitted('update-draft')?.at(-1)?.[0]).toMatchObject({
      presentCharacterIds: ['char-lina'],
      viewpointCharacterId: 'char-lina'
    })
    const updateCountBeforeRunIntent = curation.emitted('update-draft')?.length
    await curation.findAll('.scene-curation__person-toggle')[1].trigger('click')
    let characterScopeButtons = curation.findAll('.scene-curation__people .scene-curation__scope-btn')
    await characterScopeButtons.find((button) => button.text() === '让他下一段入场').trigger('click')
    await characterScopeButtons.find((button) => button.text() === '仅带入本次推演').trigger('click')
    await curation.find('.scene-curation__option').trigger('click')
    const locationScopeButtons = curation.findAll('.scene-curation__options .scene-curation__scope-btn')
    await locationScopeButtons.find((button) => button.text() === '下一段转到这里').trigger('click')
    expect(curation.emitted('run-intent')).toEqual([
      [{ mode: 'next-passage', entityKind: 'character', entityId: 'char-edgar' }],
      [{ mode: 'run-only', entityKind: 'character', entityId: 'char-edgar' }],
      [{ mode: 'next-passage', entityKind: 'location', entityId: 'place-port' }]
    ])
    expect(curation.emitted('update-draft')).toHaveLength(updateCountBeforeRunIntent)
    expect(curation.text()).toContain('保存当前场')
    expect(curation.text()).not.toContain('保存并推演')
    expect(curation.find('[role="listbox"]').exists()).toBe(false)
    expect(curation.find('.scene-curation__person-toggle').text()).toContain('在场')
    expect(curation.vm.$options.emits).not.toContain('save-and-simulate')
    const runIntentCountAtCapacity = curation.emitted('run-intent')?.length
    await curation.setProps({
      draft: {
        ...selectedDraft,
        presentCharacterIds: Array.from({ length: 8 }, (_, index) => `character-${index}`),
        viewpointCharacterId: ''
      },
      characterCandidates: [{ id: 'character-ninth', name: '第九人' }]
    })
    await curation.find('.scene-curation__person-toggle').trigger('click')
    await curation.findAll('.scene-curation__people .scene-curation__scope-btn')
      .find((button) => button.text() === '让他下一段入场').trigger('click')
    expect(curation.emitted('run-intent')).toHaveLength(runIntentCountAtCapacity)
    expect(curation.text()).toContain('当前场最多保留 8 位在场人物')
    await curation.setProps({ draft: { ...selectedDraft, originAxis: 'worldbook-mismatch' } })
    expect(curation.text()).toContain('来自旧世界书')

    const curationDetail = mount(AuthoringInspectorDetail, {
      props: {
        detail: { kind: 'scene-edit', id: 'unit-1' },
        curation: selectedDraft,
        worldbookStatus: 'bound',
        characterCandidates: [{ id: 'char-edgar', name: '艾德加' }],
        locationCandidates: []
      }
    })
    await curationDetail.find('.scene-curation__person-toggle').trigger('click')
    await curationDetail.findAll('.scene-curation__scope-btn')
      .find((button) => button.text() === '让他下一段入场').trigger('click')
    expect(curationDetail.emitted('run-intent')?.[0]).toEqual([{
      mode: 'next-passage', entityKind: 'character', entityId: 'char-edgar'
    }])

    const preview = mount(AuthoringSceneCurationPreview, {
      props: {
        draft: { ...selectedDraft, presentCharacterIds: ['char-lina', 'char-edgar'], locationId: 'place-tower' },
        baseline: { ...selectedDraft, locationId: 'place-port' },
        characterCandidates: [{ id: 'char-lina', name: '莉娜' }, { id: 'char-edgar', name: '艾德加' }],
        locationCandidates: [{ id: 'place-port', name: '旧港' }, { id: 'place-tower', name: '孤塔' }]
      }
    })
    expect(preview.text()).toContain('调整这一处的现场')
    expect(preview.text()).toContain('莉娜→莉娜、艾德加')
    expect(preview.text()).toContain('旧港→孤塔')
    expect(preview.text()).toContain('在右侧保存后成为当前场')
  })

  it('keeps contextual setting selection bounded and preserves inspector return state（合并3例）', async () => {
    const worldbook = {
      id: 'wb-1',
      entries: [
        { id: 'char_lina', name: '莉娜', type: 'character', content: '旧港调查员。', keys: ['莉娜'], metadata: { updatedAt: 12 } },
        { id: 'place-tax-office', name: '旧港税务所', type: 'location', content: '废弃的税务大厅。', keys: ['税务所'] },
        { id: 'rule-1', name: '魔法代价', type: 'rule', content: '每次施法都会遗失记忆。', keys: ['施法'] },
        ...Array.from({ length: 30 }, (_, index) => ({ id: `extra-${index}`, name: `背景${index}`, type: 'lore', content: '无关背景。' }))
      ]
    }
    const document = { content: [{ attrs: { unitId: 'u1' }, content: [
      { attrs: { nodeId: 'n1' }, text: '莉娜进入税务所。' },
      { attrs: { nodeId: 'n2' }, text: '门外一片寂静。' },
      { attrs: { nodeId: 'n3' }, text: '她想起施法的代价。' },
      { attrs: { nodeId: 'n4' }, text: '旧港税务所尚在前方。' }
    ] }] }
    const caretContext = buildAuthoringCaretContext(document, { nodeId: 'n4', cursorLocalOffset: 1 })
    const context = buildAuthoringSettingContext({ worldbook, document, caretContext, sceneProjection: makeProjection(), limit: 12 })
    expect(context.total).toBeLessThanOrEqual(12)
    expect(context.groups[0].label).toBe('正在写这里')
    expect(context.groups.flatMap((group) => group.items.map((item) => item.id))).toEqual(expect.arrayContaining(['char_lina', 'place-tax-office', 'rule-1']))
    expect(context.groups.flatMap((group) => group.items.map((item) => item.id))).not.toContain('extra-20')

    const caretText = extractAuthoringCaretWindow({
      currentNodeText: '莉娜停在门口。很远的段落才提到旧港税务所。', cursorLocalOffset: 2
    }, { before: 4, after: 4 })
    expect(caretText).toBe('莉娜')
    const localDocument = { content: [{ attrs: { unitId: 'u2' }, content: [{ attrs: { nodeId: 'local' }, text: '莉娜停在门口。很远的段落才提到旧港税务所。' }] }] }
    const localCaret = buildAuthoringCaretContext(localDocument, { nodeId: 'local', cursorLocalOffset: 2 })
    const caretIds = buildAuthoringSettingContext({ worldbook, document: localDocument, caretContext: localCaret }).groups
      .flatMap((group) => group.items.map((item) => item.id))
    expect(caretIds).toContain('char_lina')
    expect(caretIds).not.toContain('place-tax-office')

    const mentions = buildWritingWorldbookMentions({
      content: [{ attrs: { unitId: 'u1' }, content: [{ attrs: { nodeId: 'n1' }, text: '莉娜走进旧港税务所。' }] }]
    }, worldbook)
    expect(mentions).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: 'n1', entryId: 'char_lina', start: 0, end: 2 }),
      expect.objectContaining({ nodeId: 'n1', entryId: 'place-tax-office', text: '旧港税务所' })
    ]))
    const longestMention = buildWritingWorldbookMentions({
      content: [{ attrs: { unitId: 'u1' }, content: [{ attrs: { nodeId: 'n2' }, text: '旧港税务所' }] }]
    }, {
      id: 'wb-1',
      entries: [
        { id: 'short', name: '税务所' },
        { id: 'long', name: '旧港税务所' }
      ]
    })
    expect(longestMention).toEqual([expect.objectContaining({ entryId: 'long', text: '旧港税务所', start: 0, end: 5 })])
    const ambiguousMention = buildWritingWorldbookMentions({
      content: [{ attrs: { unitId: 'u1' }, content: [{ attrs: { nodeId: 'n3' }, text: '林舟走进大厅。' }] }]
    }, {
      id: 'wb-1',
      entries: [
        { id: 'lin-a', name: '林舟', keys: ['林先生'], type: 'character' },
        { id: 'lin-b', name: '林舟', keys: ['林医生'], type: 'character' }
      ]
    })
    expect(ambiguousMention).toEqual([expect.objectContaining({
      entryId: '', entryIds: ['lin-a', 'lin-b'], ambiguous: true, entryType: 'ambiguous'
    })])

    const base = createAuthoringInspectorState({ tool: 'worldbook', mode: 'search', query: '旧港' })
    const detail = openAuthoringInspectorDetail(base, 'char_lina')
    expect(returnFromAuthoringInspectorDetail(detail)).toMatchObject({ mode: 'search', query: '旧港', selectedId: '' })
    expect(toggleAuthoringInspectorDual(base, false).dual).toBe(false)

    const annotation = normalizeWritingAnnotation({
      id: 'a1', body: '核对人物身份', chapterId: 'chapter-9',
      target: { unitId: 'unit-b', nodeId: 'node-1', start: 0, end: 2 },
      references: [{ kind: 'worldbook-entry', worldbookId: 'wb-1', entryId: 'char_lina', entryRevision: 10, labelSnapshot: '旧名' }]
    })
    expect(annotation.references[0].entryId).toBe('char_lina')
    expect(resolveWritingWorldbookReference(annotation.references[0], worldbook)).toMatchObject({ status: 'stale', label: '莉娜' })

    const outline = mount(AuthoringOutlinePanel, { props: { dual: true, chapterTitle: '石柱下的星图', items: [
      { id: 'o1', title: '发现星图', content: '莉娜在石柱下发现星图。', source: { type: 'manual' } },
      { id: 'o2', title: '转动石柱', content: '穹顶亮起第一颗星。', source: { type: 'narrative-asset' } }
    ] } })
    await outline.find('.authoring-outline-row').trigger('click')
    expect(outline.emitted('insert')).toBeUndefined()
    expect(outline.find('.authoring-outline-detail').text()).toContain('莉娜在石柱下发现星图。')
    await outline.find('.authoring-outline-detail__primary button').trigger('click')
    expect(outline.emitted('insert')?.[0]?.[0]).toMatchObject({ id: 'o1' })
  })
  it("titles the section 当前场 and offers one 调整 action emitting edit（合并3例）", async () => {
{
const wrapper = mountRail()
    expect(wrapper.text()).toContain('当前场')
    expect(wrapper.text()).not.toContain('本章现场')
    const edit = wrapper.find('[data-test="scene-edit"]')
    expect(edit.text()).toBe('调整')
    await edit.trigger('click')
    expect(wrapper.emitted('edit')?.length).toBe(1)
    const experienceSource = readFileSync(resolve(__dirname, '../pages/Experience.vue'), 'utf8')
    const authoringRailSource = readFileSync(resolve(__dirname, '../components/authoring/AuthoringSceneRail.vue'), 'utf8')
    expect(experienceSource).toContain('<SceneIndexSection')
    expect(authoringRailSource).toContain('<SceneIndexSection')
}
{
const wrapper = mountRail()
    const emitted = wrapper.emitted()
    for (const event of Object.keys(emitted)) {
      expect(['open-detail', 'advance-with', 'edit', 'bind-worldbook']).toContain(event)
    }
}
{
const wrapper = mountRail(makeProjection({
      activeActor: { id: 'char_edgar', name: '艾德加' }
    }))
    const texts = wrapper.findAll('button').map((button) => button.text().trim())
    expect(texts).not.toContain('行动者')
    expect(texts).not.toContain('对象')
    // 无 .scene-rail__role 胶囊类控件。
    expect(wrapper.findAll('.scene-rail__role')).toHaveLength(0)
}
})

  {
const casesK6 = [
    [{ worldbookStatus: 'bound', anchorStatus: 'explicit' }, '当前落笔处'],
    [{ anchorStatus: 'inherited' }, '沿用前文'],
    [{ anchorStatus: 'no-anchor' }, '待设置'],
    [{ anchorStatus: 'worldbook-mismatch' }, '需重新确认'],
    [{ worldbookId: null, worldbookStatus: 'unbound' }, '未关联世界书'],
    [{ worldbookStatus: 'missing' }, '世界书已缺失']
  ]
it('renders projection status %j as %s' + '（参数组合并）', async () => {
  const failuresK6 = []
  for (const [caseIndexK6, caseValueK6] of casesK6.entries()) {
    const rowK6 = Array.isArray(caseValueK6) ? caseValueK6 : [caseValueK6]
    try { await ((overrides, label) => {
    const wrapper = mountRail(makeProjection(overrides))
    expect(wrapper.find('.scene-rail__status').text()).toBe(label)
  })(...rowK6) } catch (errorK6) { failuresK6.push('#' + caseIndexK6 + ': ' + (errorK6 && errorK6.message)) }
  }
  if (failuresK6.length) throw new Error(failuresK6.join('\n'))
})
}

  it("offers the bind action on unbound and missing statuses only（合并4例）", async () => {
{
const unbound = mountRail(makeProjection({ worldbookId: null, worldbookStatus: 'unbound' }))
    await unbound.find('[data-test="scene-bind"]').trigger('click')
    expect(unbound.emitted('bind-worldbook')?.length).toBe(1)

    const missing = mountRail(makeProjection({ worldbookStatus: 'missing' }))
    expect(missing.find('[data-test="scene-bind"]').text()).toContain('重新关联')

const bound = mountRail()
    expect(bound.find('[data-test="scene-bind"]').exists()).toBe(false)
    const empty = mountRail(makeProjection({
      viewpointCharacter: null,
      dialogueTarget: null,
      presentCharacters: [],
      location: null,
      time: null,
      unresolvedEvents: [],
      emergenceCandidates: []
    }))
    await empty.find('[aria-label="从世界书添加在场人物"]').trigger('click')
    expect(empty.emitted('edit')?.length).toBe(1)
    await empty.find('[aria-label="推演本场"]').trigger('click')
    expect(empty.emitted('advance-with')?.[0]).toEqual([''])
}
{
const many = makeProjection({
      presentCharacters: ['一', '二', '三', '四', '五', '六'].map((name, index) => ({ id: `char-${index}`, name })),
      unresolvedEvents: [
        { id: 'e1', label: '事件一', sourceRefs: [] },
        { id: 'e2', label: '事件二', sourceRefs: [] },
        { id: 'e3', label: '事件三', sourceRefs: [] }
      ]
    })
    const wrapper = mountRail(many)
    const sectionLabels = wrapper.findAll('.ws-codex-section__label').map((node) => node.text())
    expect(sectionLabels).toEqual(['时间', '人物', '地点', '事件'])
    const counts = wrapper.findAll('.ws-codex-section__count').map((node) => node.text())
    expect(counts).toEqual(['1', '8', '1', '3'])
    expect(wrapper.find('[data-section="events"] .ws-codex-section__latest').text()).toBe('事件一')
}
{
const wrapper = mountRail()
    await wrapper.find('[aria-label="查看人物详情"]').trigger('click')
    expect(wrapper.emitted('open-detail')?.[0]).toEqual([{ kind: 'character', id: 'char_lina' }])
    await wrapper.find('[aria-label="查看地点详情"]').trigger('click')
    expect(wrapper.emitted('open-detail')?.[1]).toEqual([{ kind: 'location', id: 'place-tax-office' }])
    expect(wrapper.find('[data-scene-rail-item="character:char_lina"]').exists()).toBe(true)
}
{
const wrapper = mountRail()
    await wrapper.find('[aria-label="查看事件详情"]').trigger('click')
    expect(wrapper.emitted('open-detail')?.at(-1)).toEqual([{ kind: 'event', id: 'event-seal' }])
}
{
    const catalog = buildAuthoringQuickWordCatalog({
      worldbook: {
        entries: [
          { id: 'char-lina', type: 'character', name: '林昭', keysSecondary: ['阿昭'], content: '巡夜人。' },
          { id: 'place-port', type: 'location', name: '旧港税务所', content: '北岸旧港的税务机关。' },
          { id: 'place-dock', type: 'location', name: '旧港码头', content: '潮船停靠处。' }
        ]
      },
      document: createWritingDocument('潮汐钟响了。潮汐钟再次响起。')
    })
    expect(catalog.some((item) => item.text === '林昭' && item.sourceKind === 'character')).toBe(true)
    expect(catalog.some((item) => item.text === '旧港税务所' && item.sourceKind === 'setting')).toBe(true)
    const enabledIds = catalog.filter((item) => ['林昭', '旧港税务所', '旧港码头'].includes(item.text)).map((item) => item.id)
    const prefix = resolveAuthoringQuickWordPrefix({ empty: true, currentNodeText: '他望向旧港', cursorLocalOffset: 5 }, catalog, enabledIds)
    expect(prefix).toBe('旧港')
    expect(resolveAuthoringQuickWordSuggestions({ catalog, enabledIds, prefix }).map((item) => item.text)).toEqual(['旧港税务所', '旧港码头'])
    const dockId = catalog.find((item) => item.text === '旧港码头').id
    expect(resolveAuthoringQuickWordSuggestions({ catalog, enabledIds, recentIds: [dockId], prefix }).map((item) => item.text)).toEqual(['旧港码头', '旧港税务所'])
    expect(resolveAuthoringQuickWordPrefix({ empty: true, currentNodeText: '林', cursorLocalOffset: 1 }, catalog, enabledIds)).toBe('林')
    expect(resolveAuthoringQuickWordPrefix({ empty: true, currentNodeText: '林', cursorLocalOffset: 1 }, catalog, [])).toBe('')
    expect(resolveAuthoringQuickWordPrefix({ empty: false, currentNodeText: '林', cursorLocalOffset: 1 }, catalog, enabledIds)).toBe('')
}
})
})

// —— 复验修复 1/3：跨书切换同步 + 检查器世界书关系 ——

describe('cross-book activation sync and worldbook-backed inspector detail (rework)', () => {
  it("routes every book switch through the unified activation helper（合并4例）", async () => {
{
const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(resolve(__dirname, '../pages/Authoring.vue'), 'utf8')
    const activation = readFileSync(resolve(__dirname, '../composables/useAuthoringBookActivation.js'), 'utf8')
    // 统一激活：项目 ID、绑定世界书、素材收件箱一起切换。
    expect(source).toContain('useAuthoringBookActivation({')
    expect(source).toMatch(/activateBook,[\s\S]{0,120}openBook,[\s\S]{0,120}selectBook/)
    expect(activation).toContain('function activateBook(bookId')
    const activationBody = activation.slice(activation.indexOf('function activateBook'), activation.indexOf('function openBook('))
    expect(activationBody).toContain('setAuthoringProjectId')
    expect(activationBody).toContain('synchronizeWorldbook')
    // owner 内的 openBook 走统一激活，页面不保留平行实现。
    expect(activation).toMatch(/function openBook\(bookId, \{ fromInitialLoad = false \} = \{\}\) \{\n {4}const book = activateBook\(bookId\)/)
    expect(source).not.toContain('function openBook(bookId')
    // insert-back 与路由恢复的跨书跳转不再绕过同步（不得直接改 selectedBookId）。
    const openBookAtChapterBody = source.slice(
      source.indexOf('function openBookAtChapter'),
      source.indexOf('function openBookAtChapter') + 500
    )
    expect(openBookAtChapterBody).toContain('activateBook(bookId)')
    expect(openBookAtChapterBody).not.toContain('selectedBookId.value = bookId')
}
{
const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(resolve(__dirname, '../pages/Authoring.vue'), 'utf8')
    const activation = readFileSync(resolve(__dirname, '../composables/useAuthoringBookActivation.js'), 'utf8')
    // 复验修复 1：boundary 载荷在 selectedBookId 变更之前构造（显式携带旧项目 ID），
    // 且 activateBook 记账后抑制 selectChapter 内的第二次记账。
    const activateBody = activation.slice(activation.indexOf('function activateBook'), activation.indexOf('function openBook('))
    const payloadIndex = activateBody.indexOf('buildOutgoingBoundary()')
    const switchIndex = activateBody.indexOf('selectedBookId.value = bookId')
    expect(payloadIndex).toBeGreaterThan(-1)
    expect(switchIndex).toBeGreaterThan(payloadIndex)
    expect(source).toMatch(/buildOutgoingBoundary:[\s\S]{0,260}previousProjectId: selectedBookId\.value/)
    expect(activation).toContain('if (!pendingActivationBoundary) return false')
    expect(source).toContain('consumeActivationBoundary()')
    expect(activateBody).toMatch(/saveCurrentChapter\(\)[\s\S]{0,220}dispatchChapterBoundary/)
    expect(source).toMatch(/function saveCurrentChapter[\s\S]{0,2200}rememberPendingObserverNodes/)
    expect(source).not.toMatch(/function saveCurrentChapter[\s\S]{0,2200}noteAuthoringTextCommit/)
    expect(activateBody).toContain("notify('当前章节保存失败，未切换书籍')")
    const explorationBoundary = source.slice(source.indexOf('function wt3PersistBeforeLeaving'), source.indexOf('function openExplorationDoc'))
    expect(explorationBoundary).toContain("authoringTask.notify(tr('构思文档保存失败，已留在当前文档'))")
    expect(explorationBoundary.indexOf('if (!result?.ok)')).toBeLessThan(explorationBoundary.indexOf("wt3ActiveDocId.value = ''"))
    expect(source).not.toContain('watch(markdownContent')
}
{
const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(resolve(__dirname, '../pages/Authoring.vue'), 'utf8')
    const blockWorkflow = readFileSync(resolve(__dirname, '../composables/useAuthoringBlockWorkflow.js'), 'utf8')
    // 复验修复 2：同步窗口内（syncing=true / boundWorldbook=null）下一拍先被门禁拦下。
    expect(source).toContain('boundWorldbookSyncReady()')
    expect(source).toContain('worldbookReady: boundWorldbookSyncReady()')
    expect(blockWorkflow).toMatch(/!context\.worldbookReady[\s\S]{0,200}worldbook-loading/)
    // 同步工厂第一步即清空旧绑定（时序行为测试见 authoringWorldbookBinding.test.js）。
    const bindingModule = readFileSync(resolve(__dirname, '../services/agents/authoring/authoringProjectWorldbook.js'), 'utf8')
    expect(bindingModule).toMatch(/boundWorldbook\.value = null[\s\S]{0,300}syncing\.value = true/)
}
{
const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const authoring = readFileSync(resolve(__dirname, '../pages/Authoring.vue'), 'utf8')
    // 投影与内核 runtime state 不再携带会话状态。
    expect(authoring).not.toContain('sceneThread: gameStore.sceneThread')
    expect(authoring).not.toContain('historyNode: gameStore.historyNode')
    // 执行器在入口剥离会话键（解构排除 + 不再向内核传 sceneThread）。
    const executor = readFileSync(resolve(__dirname, '../services/agents/authoring/narrativeKernelExecutor.js'), 'utf8')
    expect(executor).not.toContain('runtimeState?.sceneThread')
    expect(executor).toContain('sceneThread: _excludedSceneThread')
    expect(executor).not.toContain('sceneThread: runtimeState')
}
})

  it('matches inspector relations by v2 endpoint ids and prefers worldbook character profiles', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(resolve(__dirname, '../pages/Authoring.vue'), 'utf8')
    const inspector = readFileSync(resolve(__dirname, '../composables/useAuthoringInspectorState.js'), 'utf8')
    // v2 关系按 subjectId/objectId 匹配；v1 姓名匹配保留为兼容回退。
    expect(source).toContain('rel.subjectId === detail.id || rel.objectId === detail.id')
    expect(source).toContain("rel.subject === person.name || rel.object === person.name")
    const openDetailBody = source.slice(source.indexOf('function openSceneDetail'), source.indexOf('async function closeSceneDetail'))
    expect(openDetailBody).toContain("openInspectorTool('scene', { detailState:")
    expect(openDetailBody).not.toContain("payload.kind === 'character'")
    const editBody = source.slice(source.indexOf('function handleSceneEditRequest'), source.indexOf('function handleCurationDraftUpdate'))
    expect(editBody).toContain("openInspectorTool('scene')")
    expect(inspector).toContain('activeInspectorTool.value = normalizedTool')
    expect(inspector).toContain('inspectorOpen.value = true')
    expect(inspector).toContain('inspectorDetailState.value = options.detailState || null')
    // 有绑定世界书证据时优先使用投影角色摘要（goal/mood/voiceBasis）。
    expect(source).toMatch(/const fromWorldbook = \(person\.sourceRefs \|\| \[\]\)\.some\(\(ref\) => String\(ref\)\.startsWith\('worldbook-entry:'\)\)/)
    expect(source).toContain('(fromWorldbook ? person.goal : "")'.replace(/"/g, "'"))
    expect(source).toContain("(fromWorldbook ? person.voiceBasis : '')")
  })
})
