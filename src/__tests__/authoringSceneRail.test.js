import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AuthoringSceneRail from '../components/authoring/AuthoringSceneRail.vue'

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
  it("titles the section 当前场 and offers one 调整 action emitting edit（合并3例）", async () => {
{
const wrapper = mountRail()
    expect(wrapper.text()).toContain('当前场')
    expect(wrapper.text()).not.toContain('本章现场')
    const edit = wrapper.find('[data-test="scene-edit"]')
    expect(edit.text()).toBe('调整')
    await edit.trigger('click')
    expect(wrapper.emitted('edit')?.length).toBe(1)
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
    [{ anchorStatus: 'inherited' }, '沿用上一章'],
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
    expect(missing.find('[data-test="scene-bind"]').text()).toBe('重新关联')

    const bound = mountRail()
    expect(bound.find('[data-test="scene-bind"]').exists()).toBe(false)
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
    const personNames = wrapper.findAll('.scene-rail__person-name').map((node) => node.text())
    expect(personNames).toHaveLength(4)
    expect(wrapper.text()).not.toContain('事件二')
    // 视角/对象各占一行去重后共 8 人 → 隐藏 4 人；事件隐藏 2 条 → 合计 +6。
    expect(wrapper.find('[data-test="scene-more"]').text()).toBe('+6')
}
{
const wrapper = mountRail()
    const buttons = wrapper.findAll('button')
    await buttons.find((button) => button.text().includes('艾德加')).trigger('click')
    expect(wrapper.emitted('open-detail')?.[0]).toEqual([{ kind: 'character', id: 'char_edgar' }])
    await buttons.find((button) => button.text().includes('旧港税务所')).trigger('click')
    expect(wrapper.emitted('open-detail')?.[1]).toEqual([{ kind: 'location', id: 'place-tax-office' }])
    expect(wrapper.find('[data-scene-rail-item="character:char_lina"]').exists()).toBe(true)
}
{
const wrapper = mountRail()
    await wrapper.findAll('button').find((button) => button.text() === '以此推进').trigger('click')
    expect(wrapper.emitted('advance-with')?.[0]).toEqual(['event-seal'])
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
    // 统一激活：项目 ID、绑定世界书、素材收件箱一起切换。
    expect(source).toContain('function activateBook(bookId')
    expect(source).toMatch(/function activateBook[\s\S]{0,1200}setAuthoringProjectId[\s\S]{0,600}syncBookWorldbook/)
    // openBook 走统一激活。
    expect(source).toMatch(/function openBook\(bookId, options = \{\}\) \{\n  const \{ fromInitialLoad = false \} = options\n  const book = activateBook\(bookId\)/)
    // 跨书章节跳转与 insert-back 换书不再绕过同步（不得直接改 selectedBookId）。
    const selectBookChapterBody = source.slice(
      source.indexOf('function selectBookChapter'),
      source.indexOf('function selectBookChapter') + 600
    )
    expect(selectBookChapterBody).toContain('activateBook(bookId)')
    expect(selectBookChapterBody).not.toContain('selectedBookId.value = bookId')
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
    // 复验修复 1：boundary 载荷在 selectedBookId 变更之前构造（显式携带旧项目 ID），
    // 且 activateBook 记账后抑制 selectChapter 内的第二次记账。
    const activateBody = source.slice(source.indexOf('function activateBook'), source.indexOf('function openBook('))
    const payloadIndex = activateBody.indexOf('buildChapterBoundaryPayload({')
    const switchIndex = activateBody.indexOf('selectedBookId.value = bookId')
    expect(payloadIndex).toBeGreaterThan(-1)
    expect(switchIndex).toBeGreaterThan(payloadIndex)
    expect(activateBody).toContain('previousProjectId: selectedBookId.value')
    expect(source).toContain('if (pendingActivationBoundary)')
    // 删除当前书也走统一激活，不再直接改 selectedBookId。
    const deleteBody = source.slice(source.indexOf('function deleteBook'), source.indexOf('function deleteBook') + 1200)
    expect(deleteBody).toContain('activateBook(nextBookId, { savePrevious: false })')
    expect(deleteBody).not.toContain('selectedBookId.value = books.value[0].id')
    expect(deleteBody).not.toContain('selectBook(nextBookId)')
}
{
const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(resolve(__dirname, '../pages/Authoring.vue'), 'utf8')
    // 复验修复 2：同步窗口内（syncing=true / boundWorldbook=null）下一拍先被门禁拦下。
    expect(source).toContain('boundWorldbookSyncReady()')
    expect(source).toMatch(/!boundWorldbookSyncReady\(\)[\s\S]{0,200}worldbook-loading/)
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
    // v2 关系按 subjectId/objectId 匹配；v1 姓名匹配保留为兼容回退。
    expect(source).toContain('rel.subjectId === detail.id || rel.objectId === detail.id')
    expect(source).toContain("rel.subject === person.name || rel.object === person.name")
    // 有绑定世界书证据时优先使用投影角色摘要（goal/mood/voiceBasis）。
    expect(source).toMatch(/const fromWorldbook = \(person\.sourceRefs \|\| \[\]\)\.some\(\(ref\) => String\(ref\)\.startsWith\('worldbook-entry:'\)\)/)
    expect(source).toContain('(fromWorldbook ? person.goal : "")'.replace(/"/g, "'"))
    expect(source).toContain("(fromWorldbook ? person.voiceBasis : '')")
  })
})
