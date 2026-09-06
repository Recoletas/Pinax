import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AuthoringBlockComposer from '../components/authoring/AuthoringBlockComposer.vue'
import AuthoringBlockDraft from '../components/authoring/AuthoringBlockDraft.vue'
import AuthoringAdoptionImpact from '../components/authoring/AuthoringAdoptionImpact.vue'
import AuthoringIdeaShelf from '../components/authoring/AuthoringIdeaShelf.vue'
import AuthoringContextSummary from '../components/authoring/AuthoringContextSummary.vue'
import AuthoringSceneLaboratory from '../components/authoring/AuthoringSceneLaboratory.vue'
import AuthoringInterventionComposer from '../components/authoring/AuthoringInterventionComposer.vue'
import AuthoringInterventionGhost from '../components/authoring/AuthoringInterventionGhost.vue'
import AuthoringLivingStoryProjection from '../components/authoring/AuthoringLivingStoryProjection.vue'

const target = Object.freeze({ unitId: 'u-1', unitRevision: 2, chapterId: 'ch-1', documentRevision: 7, selectionBookmark: { resolve() {} } })
const people = [{ id: 'lina', name: '莉娜' }, { id: 'edgar', name: '艾德加' }]
const mountComposer = (props = {}) => mount(AuthoringBlockComposer, { props: { target, people, ...props } })
const radio = (wrapper, label) => wrapper.findAll('[role="radio"]').find((button) => button.text() === label)

describe('authoring block composer', () => {
  it('owns a frozen target and submits a canonical turn', async () => {
    const wrapper = mountComposer()
    expect(wrapper.find('[data-test="block-composer"]').exists()).toBe(true)
    expect(wrapper.findAll('[role="radio"]')).toHaveLength(6)
    expect(wrapper.find('[data-test="block-primary"]').text()).toBe('生成推演稿')
    expect(wrapper.text()).not.toContain('生成后先预览，确认才写入正文')
    expect(wrapper.find('.authoring-block-composer__starters').attributes('aria-label')).toBe('写作起点')
    expect(wrapper.text()).toContain('接下来想写什么')
    await wrapper.find('.authoring-block-composer__starters button').trigger('click')
    expect(wrapper.find('textarea').element.value).toContain('立刻采取行动')
    await wrapper.find('textarea').setValue('推开门')
    await wrapper.find('[data-test="block-primary"]').trigger('click')
    const submission = wrapper.emitted('submit')?.[0]?.[0]
    expect(submission).toMatchObject({ target, turn: { operation: 'next-passage', kind: 'action', instruction: '推开门' } })
    expect(submission).not.toHaveProperty('semiAutoLimit')

    const summary = mount(AuthoringContextSummary, {
      props: {
        manifest: {
          blocks: [
            { candidateId: 'body-1', kind: 'manuscript-unit', label: '正文一' },
            { candidateId: 'lore-1', kind: 'worldbook-entry', label: '设定一' }
          ],
          excluded: [{ candidateId: 'memory-1', kind: 'memory', label: '剧情记忆', reason: 'budget-profile-total' }]
        }
      }
    })
    expect(summary.find('summary').text()).toContain('参考范围')
    expect(summary.find('summary').text()).toContain('正文 1 · 设定 1')
    expect(summary.find('summary').text()).not.toContain('记忆 0')

    const ideaShelf = mount(AuthoringIdeaShelf, {
      props: {
        docs: [{ id: 'note-1', title: '速记一', status: 'active' }],
        catalog: [{ id: 'exploration-doc:note-1', sourceKind: 'exploration-doc', sourceId: 'note-1', group: 'exploration', label: '速记一', typeLabel: '速记', excerpt: '内容' }],
        currentChapterId: 'chapter-1'
      }
    })
    expect(ideaShelf.text()).not.toContain('未编排')
    expect(ideaShelf.find('[data-test="authoring-run-tray"]').exists()).toBe(false)
    await ideaShelf.find('[aria-label="带入推演夹"]').trigger('click')
    expect(ideaShelf.emitted('add')?.[0]?.[0]).toMatchObject({ id: 'exploration-doc:note-1' })
    await ideaShelf.findAll('button').find((button) => button.text() === '关联当前章').trigger('click')
    expect(ideaShelf.emitted('link-current')?.[0]).toEqual(['note-1'])
    await ideaShelf.find('[aria-label="新建速记"]').trigger('click')
    expect(ideaShelf.emitted('create')).toHaveLength(1)

    await radio(wrapper, '重写当前块').trigger('click')
    await wrapper.find('textarea').setValue('收紧节奏')
    await wrapper.find('[data-test="block-primary"]').trigger('click')
    expect(wrapper.emitted('submit')?.[1]?.[0].turn).toMatchObject({ operation: 'rewrite-unit', instruction: '收紧节奏' })

    const staleProse = '　　潮水越过石阶。\n\n她没有回头。\n'
    await wrapper.setProps({ staleResult: { text: staleProse } })
    const stalePreview = wrapper.find('[data-test="block-stale-preview"]')
    expect(stalePreview.exists()).toBe(true)
    expect(stalePreview.attributes('readonly')).toBeDefined()
    expect(stalePreview.attributes('wrap')).toBe('soft')
    expect(stalePreview.element.value).toBe(staleProse)
    expect(wrapper.findAll('button').some((button) => button.text().includes('采用'))).toBe(false)
  })

  it('labels an empty chapter opening and emits a single cancel transition', async () => {
    const wrapper = mountComposer({ emptyChapter: true })
    expect(wrapper.find('[data-test="block-primary"]').text()).toBe('生成推演稿')
    await wrapper.find('[aria-label="收起推演"]').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('restore-selection')).toBeUndefined()
  })

  it('requires dialogue participants and exposes persist-only retry', async () => {
    const wrapper = mountComposer({ failure: { phase: 'persist', message: '保存失败' } })
    await radio(wrapper, '人物对话').trigger('click')
    await wrapper.find('textarea').setValue('问他真相')
    await wrapper.find('[data-test="block-primary"]').trigger('click')
    expect(wrapper.emitted('submit')).toBeUndefined()
    const selects = wrapper.findAll('select')
    await selects[0].setValue('lina')
    await selects[1].setValue('edgar')
    await wrapper.find('[data-test="block-primary"]').trigger('click')
    expect(wrapper.emitted('submit')?.[0]?.[0].turn).toMatchObject({ kind: 'dialogue', actorId: 'lina', targetId: 'edgar' })
    expect(wrapper.text()).toContain('再次保存')
  })

  it('uses one viewpoint selector for thought turns and ignores IME Escape', async () => {
    const wrapper = mountComposer()
    await radio(wrapper, '人物内心').trigger('click')
    expect(wrapper.text()).toContain('视角人物')
    expect(wrapper.findAll('select')).toHaveLength(1)

    await wrapper.find('select').setValue('lina')
    await wrapper.find('textarea').setValue('她想起那封信')
    await wrapper.find('textarea').trigger('keydown', { key: 'Escape', isComposing: true })
    await wrapper.find('textarea').trigger('keydown', { key: 'Escape', keyCode: 229 })
    expect(wrapper.emitted('cancel')).toBeUndefined()
    expect(wrapper.find('textarea').element.value).toBe('她想起那封信')

    await wrapper.find('[data-test="block-primary"]').trigger('click')
    expect(wrapper.emitted('submit')?.[0]?.[0].turn).toMatchObject({
      kind: 'thought',
      actorId: 'lina',
      viewpointCharacterId: 'lina'
    })
  })

  it('focuses the instruction on mount and exposes a stable focus handoff', async () => {
    const wrapper = mount(AuthoringBlockComposer, {
      attachTo: document.body,
      props: { target, people }
    })
    await wrapper.vm.$nextTick()
    const instruction = wrapper.find('.authoring-block-composer__instruction textarea')
    expect(document.activeElement).toBe(instruction.element)

    instruction.element.blur()
    expect(typeof wrapper.vm.focusInstruction).toBe('function')
    wrapper.vm.focusInstruction()
    expect(document.activeElement).toBe(instruction.element)
    wrapper.unmount()
  })
})

describe('block composer initial instruction', () => {
  it('prefills the instruction from initialInstruction prop once', async () => {
    const wrapper = mountComposer({ initialInstruction: '以此事件推进：守卫吹响了哨子' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('textarea').element.value).toBe('以此事件推进：守卫吹响了哨子')
    // 用户改写后，prop 未变化不再覆盖输入。
    await wrapper.find('textarea').setValue('我自己改过的指令')
    await wrapper.setProps({ generating: true })
    await wrapper.setProps({ generating: false, initialInstruction: '' })
    expect(wrapper.find('textarea').element.value).toBe('我自己改过的指令')

    const directions = [
      { id: 'conceal', title: '先隐瞒异象', action: '独自检查暗格。', immediateGain: '保住主动权', cost: '同伴会起疑' },
      { id: 'verify', title: '共同验证', action: '当面指出缺页。', immediateGain: '确认线索', cost: '交出判断权' },
      { id: 'probe', title: '借机试探', action: '故意说错编号。', immediateGain: '判断知情程度', cost: '暴露怀疑' }
    ]
    const laboratory = mount(AuthoringSceneLaboratory, {
      props: {
        pressure: { statement: '莉娜必须决定是否交出秘密。', evidence: [{ id: 'lina', label: '莉娜 · 当前视角' }] },
        directions,
        selectedDirectionId: ''
      }
    })
    expect(laboratory.findAll('.authoring-scene-lab__direction')).toHaveLength(3)
    expect(laboratory.text()).toContain('眼前所得')
    expect(laboratory.text()).toContain('代价')
    await laboratory.setProps({
      entryIntent: { mode: 'next-passage', entityKind: 'character', entityName: '艾德加' }
    })
    expect(laboratory.text()).toContain('让艾德加下一段入场')
    expect(laboratory.text()).toContain('采纳推演稿后才更新当前场')
    await laboratory.setProps({
      entryIntent: { mode: 'run-only', entityKind: 'location', entityName: '旧港税务所' }
    })
    expect(laboratory.text()).toContain('以旧港税务所作为本次推演参考')
    expect(laboratory.text()).toContain('只影响这次推演，不改变当前场')
    await laboratory.findAll('.authoring-scene-lab__direction')[1].trigger('click')
    expect(laboratory.emitted('select')?.[0]).toEqual(['verify'])
    await laboratory.findAll('.authoring-scene-lab__direction')[1].trigger('keydown', { key: 'Escape', isComposing: true })
    await laboratory.findAll('.authoring-scene-lab__direction')[1].trigger('keydown', { key: 'Escape', keyCode: 229 })
    expect(laboratory.emitted('close')).toBeUndefined()
    await laboratory.findAll('.authoring-scene-lab__direction')[1].trigger('keydown', { key: 'Escape' })
    expect(laboratory.emitted('close')).toHaveLength(1)
    await laboratory.setProps({ phase: 'insufficient' })
    expect(laboratory.findAll('.authoring-scene-lab__direction')).toHaveLength(0)
    expect(laboratory.text()).toContain('当前信息还不足以形成真实取舍')
    await laboratory.setProps({ phase: 'preparing-context' })
    expect(laboratory.text()).toContain('正在核对本场依据')
    await laboratory.setProps({ phase: 'planning-directions' })
    expect(laboratory.text()).toContain('正在整理本场方向')
    await laboratory.setProps({ phase: 'failed', notice: '连接中断，现场仍已保留。' })
    expect(laboratory.text()).toContain('连接中断，现场仍已保留。')
    await laboratory.findAll('.authoring-scene-lab__footer button').find((button) => button.text() === '重试方向').trigger('click')
    expect(laboratory.emitted('retry')).toHaveLength(1)

    const interventionTarget = { ...target, projectId: 'book-1', documentId: 'ch-1', nodeId: 'node-1' }
    const intervention = mount(AuthoringInterventionComposer, {
      props: { target: interventionTarget, originalText: '钟楼在午夜敲响。' }
    })
    expect(intervention.text()).toContain('写下变化，先看后文哪些地方会被牵动')
    expect(intervention.text()).toContain('改变谁做了什么、事情是否发生')
    expect(intervention.text()).toContain('补充为什么这样改（可选）')
    expect(intervention.findAll('[role="radio"]')).toHaveLength(4)
    expect(intervention.find('[data-test="intervention-primary"]').attributes('disabled')).toBeDefined()
    await intervention.find('textarea').setValue('钟楼在清晨敲响。')
    await intervention.find('input').setValue('让守卫有时间赶到')
    await intervention.find('[data-test="intervention-primary"]').trigger('click')
    expect(intervention.emitted('submit')?.[0]?.[0]).toMatchObject({
      projectId: 'book-1',
      operation: 'change-event',
      before: '钟楼在午夜敲响。',
      after: '钟楼在清晨敲响。',
      rationale: '让守卫有时间赶到'
    })
    await intervention.find('textarea').trigger('keydown', { key: 'Escape', isComposing: true })
    expect(intervention.emitted('cancel')).toBeUndefined()
    await intervention.find('textarea').trigger('keydown', { key: 'Escape' })
    expect(intervention.emitted('cancel')).toHaveLength(1)
    await intervention.setProps({ phase: 'ready' })
    expect(intervention.text()).toContain('暂未发现确定影响')
    expect(intervention.text()).toContain('相似措辞和普通提及不会自动列入')
    await intervention.setProps({
      phase: 'ready',
      evidenceCount: 3,
      impactGroups: [{
        id: 'impact-1',
        title: '第二章 · 守卫没有听见钟声',
        reason: '大纲明确：“钟声响起”导致“守卫赶到”。改变前项可能使后项失去原有前提。',
        evidence: [
          { sourceRef: 'node:ch-1:clock', label: '第一章 · 钟声', excerpt: '钟楼在午夜敲响。' },
          { sourceRef: 'node:ch-2:guard', label: '第二章 · 守卫', excerpt: '守卫循声赶到。' }
        ]
      }],
      candidateGroups: [{
        id: 'candidate-1',
        title: '第三章 · 墙上的旧肖像',
        reason: '大纲将钟声与肖像标为伏笔关系，只能作为待核对线索。',
        reviewStatus: '',
        evidence: [
          { sourceRef: 'node:ch-3:portrait', label: '第三章 · 肖像', excerpt: '肖像背后刻着钟楼落成的日期。' }
        ]
      }],
      candidateReviewPendingCount: 1
    })
    expect(intervention.text()).toContain('条件与相关依据已冻结')
    expect(intervention.text()).toContain('可能需要调整 · 1')
    expect(intervention.text()).toContain('第二章 · 守卫没有听见钟声')
    expect(intervention.text()).toContain('查看依据')
    expect(intervention.text()).toContain('守卫循声赶到。')
    const candidateDetails = intervention.find('.authoring-intervention__candidates')
    expect(candidateDetails.attributes('open')).toBeUndefined()
    expect(candidateDetails.text()).toContain('可能相关 · 1')
    expect(candidateDetails.text()).toContain('尚无足够依据判断是否受影响')
    expect(intervention.find('.authoring-intervention__rehearsal').text()).toContain('先处理 1 项可能相关')
    expect(intervention.find('.authoring-intervention__rehearsal').findAll('[role="radio"]')).toHaveLength(0)
    await candidateDetails.find('[data-test="intervention-candidate-exclude"]').trigger('click')
    expect(intervention.emitted('review-candidate')?.[0]?.[0]).toEqual({ groupId: 'candidate-1', decision: 'exclude' })
    await intervention.setProps({
      candidateGroups: [{
        id: 'candidate-1',
        title: '第三章 · 墙上的旧肖像',
        reason: '只能作为待核对线索。',
        reviewStatus: 'keep',
        evidence: []
      }],
      candidateReviewPendingCount: 0,
      rehearsalDirections: [{
        id: 'minimal-repair',
        label: '最小修补',
        intent: '只调整最直接依赖这次改动的文本。',
        targetCount: 1
      }, {
        id: 'preserve-downstream',
        label: '保留后果',
        intent: '改写过渡原因，但尽量保留既有后续结果。',
        targetCount: 0
      }]
    })
    expect(intervention.text()).toContain('已保留')
    expect(intervention.find('[data-test="intervention-candidate-keep"]').attributes('aria-pressed')).toBe('true')
    const rehearsal = intervention.find('.authoring-intervention__rehearsal')
    expect(rehearsal.findAll('[role="radio"]')).toHaveLength(2)
    expect(rehearsal.findAll('[data-test="intervention-collaborate"]')).toHaveLength(0)
    await intervention.setProps({ collaborationEnabled: true, collaborationReady: true })
    await rehearsal.find('[data-test="intervention-collaborate"]').trigger('click')
    expect(intervention.emitted('collaborate')).toHaveLength(1)
    await intervention.setProps({ collaborationActive: true, collaborationState: 'connected' })
    expect(rehearsal.find('[data-test="intervention-collaborate"]').text()).toBe('打开共同排演')
    await rehearsal.find('[data-test="intervention-collaborate"]').trigger('click')
    expect(intervention.emitted('open-collaboration')).toHaveLength(1)
    await rehearsal.findAll('[role="radio"]')[0].trigger('click')
    expect(intervention.emitted('select-rehearsal')?.[0]).toEqual(['minimal-repair'])
    await intervention.setProps({
      rehearsalSelection: {
        directionId: 'minimal-repair',
        rewriteTargetRefs: ['node:ch-2:guard'],
        unchangedTargetRefs: ['node:ch-3:portrait']
      }
    })
    expect(rehearsal.text()).toMatch(/范围已冻结\s*·\s*调整 1 处\s*·\s*保持 1 处/)
    expect(rehearsal.findAll('[role="radio"]')[0].attributes('aria-checked')).toBe('true')
    await rehearsal.find('[data-test="intervention-rehearse"]').trigger('click')
    expect(intervention.emitted('rehearse')).toHaveLength(1)
    expect(intervention.text()).not.toMatch(/manifest|receipt|token|candidate ID/i)

    const interventionGhost = mount(AuthoringInterventionGhost, {
      props: {
        ghosts: [{
          id: 'ghost-source',
          role: 'intervention',
          title: '第一章 · 钟声',
          text: '钟楼在清晨敲响。',
          status: 'fresh'
        }, {
          id: 'ghost-guard',
          role: 'downstream',
          title: '第二章 · 守卫',
          text: '守卫赶到时天色已亮。',
          status: 'fresh'
        }],
        activeGhostId: 'ghost-source',
        batchCount: 2
      }
    })
    expect(interventionGhost.text()).toContain('独立编辑，不会写入正文')
    expect(interventionGhost.text()).toContain('采用此处')
    await interventionGhost.find('textarea').setValue('作者编辑后的清晨钟声。')
    expect(interventionGhost.emitted('update')?.at(-1)?.[0]).toEqual({
      ghostId: 'ghost-source',
      text: '作者编辑后的清晨钟声。'
    })
    await interventionGhost.findAll('nav button')[1].trigger('click')
    expect(interventionGhost.emitted('select')?.[0]).toEqual(['ghost-guard'])
    await interventionGhost.findAll('footer button')[0].trigger('click')
    expect(interventionGhost.emitted('retry')?.[0]).toEqual(['ghost-source'])
    await interventionGhost.findAll('footer button')[1].trigger('click')
    expect(interventionGhost.emitted('discard')?.[0]).toEqual(['ghost-source'])
    await interventionGhost.get('[data-test="intervention-adopt"]').trigger('click')
    expect(interventionGhost.emitted('adopt')?.[0]).toEqual(['ghost-source'])
    await interventionGhost.get('[data-test="intervention-adopt-all"]').trigger('click')
    expect(interventionGhost.emitted('adopt-all')).toHaveLength(1)
    await interventionGhost.setProps({ persistPendingGhostId: 'ghost-source', persistError: '保存失败，正文修改仍保留。' })
    expect(interventionGhost.text()).toContain('保存失败，正文修改仍保留。')
    expect(interventionGhost.findAll('[data-test="intervention-adopt"]')).toHaveLength(0)
    await interventionGhost.get('[data-test="intervention-retry-persist"]').trigger('click')
    expect(interventionGhost.emitted('retry-persist')?.[0]).toEqual(['ghost-source'])

    const livingStory = mount(AuthoringLivingStoryProjection, {
      props: {
        activeUnitId: 'unit-1',
        projection: {
          fingerprint: 'living-story-1',
          scenes: [{ id: 'scene-1', index: 0, title: '税务所 · 当晚', beatIds: ['beat-1', 'beat-2'] }],
          beats: [{
            id: 'beat-1', unitId: 'unit-1', title: '莉娜发现总册缺页。', function: 'action', effects: ['reveals'], threads: [],
            target: { documentId: 'chapter-1', unitId: 'unit-1', nodeId: 'node-1' }
          }, {
            id: 'beat-2', unitId: 'unit-2', title: '艾德加锁上档案室。', function: 'action', effects: ['changes'], threads: [{ id: 'thread-1', label: '缺页去向', sourceRef: 'outline-node:thread-1' }],
            target: { documentId: 'chapter-1', unitId: 'unit-2', nodeId: 'node-2' }
          }],
          relations: [{ id: 'relation-1', kind: 'causes', fromBeatId: 'beat-1', toBeatId: 'beat-2', label: '导致' }],
          lanes: {
            characters: [{ id: 'lina', label: '莉娜', sourceRef: 'worldbook-entry:lina' }],
            locations: [{ id: 'tax-office', label: '税务所', sourceRef: 'worldbook-entry:tax-office' }],
            threads: [{ id: 'thread-1', label: '缺页去向', sourceRef: 'outline-node:thread-1' }]
          }
        }
      }
    })
    expect(livingStory.text()).toContain('1 场 · 2 拍 · 1 条明确关系')
    expect(livingStory.text()).toContain('从正文、当前场和项目大纲即时派生')
    expect(livingStory.text()).toContain('导致')
    await livingStory.find('.living-story__beat-copy').trigger('click')
    expect(livingStory.emitted('locate')?.[0]?.[0]).toMatchObject({ id: 'beat-1', unitId: 'unit-1' })
    await livingStory.find('.living-story__intervene').trigger('click')
    expect(livingStory.emitted('intervene')?.[0]?.[0]).toMatchObject({ id: 'beat-1' })
    await livingStory.find('.living-story__lanes button').trigger('click')
    expect(livingStory.emitted('open-source')?.[0]?.[0]).toMatchObject({ sourceRef: 'worldbook-entry:lina' })
    await livingStory.findAll('.living-story__filters button').find((button) => button.text() === '揭示').trigger('click')
    expect(livingStory.findAll('.living-story__beat')).toHaveLength(1)
    expect(livingStory.text()).toContain('莉娜发现总册缺页')
    expect(livingStory.text()).not.toContain('艾德加锁上档案室')

    const ghostText = '雨落在税务所的高窗上。\n\n莉娜翻到缺页的位置。\n\n次日清晨，她带着总册回到钟楼。'
    const ghost = mount(AuthoringBlockDraft, {
      props: {
        modelValue: ghostText,
        originalText: ghostText,
        selectedDirection: {
          kind: 'authoring-selected-direction-receipt',
          title: '正面核对',
          action: '把缺页摊开，要求艾德加解释。',
          fingerprint: 'direction-1',
          evidenceRefs: ['worldbook-entry:char-edgar']
        },
        sessionFingerprint: 'manifest-1'
      }
    })
    const boundaryTicks = ghost.findAll('.authoring-block-draft__boundary-tick')
    expect(boundaryTicks).toHaveLength(2)
    expect(boundaryTicks.filter((button) => button.classes().includes('is-split'))).toHaveLength(1)
    await boundaryTicks[0].trigger('click')
    expect(ghost.text()).toContain('这两段暂时保持在同一写作单元')
    await ghost.findAll('.authoring-block-draft__boundary-action button')
      .find((button) => button.text() === '拆分').trigger('click')
    expect(ghost.find('.authoring-block-draft__structure summary').text()).toBe('调整结构（3 个写作单元）')
    expect(ghost.text()).toContain('沿“正面核对”推演')
    expect(ghost.findAll('.authoring-block-draft__unit-plan li')).toHaveLength(3)
    expect(ghost.text()).not.toContain('environment')
    expect(ghost.vm.getSceneBeatDraft()).toMatchObject({
      kind: 'scene-beat-draft',
      sessionFingerprint: 'manifest-1',
      directionFingerprint: 'direction-1',
      proposedUnits: expect.any(Array)
    })
    await ghost.setProps({ modelValue: `${ghostText}\n\n她没有回头。` })
    await ghost.setProps({ modelValue: ghostText })
    expect(ghost.find('.authoring-block-draft__structure summary').text()).toBe('调整结构（2 个写作单元）')
    const impact = mount(AuthoringAdoptionImpact, {
      props: { impact: { headline: '已纳入正文 · 新增 2 个写作单元', details: ['当前地点已更新'] } }
    })
    expect(impact.get('[data-test="adoption-impact"]').text()).toContain('已纳入正文 · 新增 2 个写作单元')
    expect(impact.text()).toContain('当前地点已更新')
  })
})
