import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import StructuredSettingsPanel from '../components/worldbook/StructuredSettingsPanel.vue'
import { useWorldStore } from '../stores/worldStore'
import * as genSvc from '../services/generationService'
import * as apiMod from '../services/api'

vi.spyOn(apiMod, 'getResolvedApiSettings').mockResolvedValue({
  baseUrl: 'http://x',
  apiKey: 'k',
  model: 'm'
})

function makeWorldbook(overrides = {}) {
  return {
    id: 'wb-int',
    name: 'Integration WB',
    structuredSettings: {
      world: { origin: '', powerSystem: '', geography: '', history: '', factions: '', rules: '' },
      story: { logline: '', concept: '', theme: '', coreConflict: '', mainline: '', sublines: '' },
      characters: { protagonists: '', majorSupporting: '', npcs: '', relationshipSummary: '' },
      creativeRules: { writingStyle: '', perspective: '', tone: '', taboos: '', consistency: '', references: '' }
    },
    ...overrides
  }
}

describe('StructuredSettingsPanel — 集成：AI 批量 → 草稿 → 采纳 → dirty', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.removeItem('worldbook:setting-drafts:wb-int')
    vi.restoreAllMocks()
    vi.spyOn(apiMod, 'getResolvedApiSettings').mockResolvedValue({
      baseUrl: 'http://x',
      apiKey: 'k',
      model: 'm'
    })
    vi.spyOn(useWorldStore(), 'updateStructuredSetting').mockResolvedValue(undefined)
  })

  it('AI 补全本节 → 6 字段草稿就绪 → 抽屉列出 → 采纳 1 个 → 字段变 dirty', async () => {
    vi.spyOn(genSvc, 'runGenerationTask').mockImplementation(async () => {
      return { success: true, content: 'ai content for this field', parsed: 'ai content for this field' }
    })

    const worldbook = reactive(makeWorldbook())
    const wrapper = mount(StructuredSettingsPanel, { props: { worldbook } })
    await nextTick()

    // 点击"AI 补全本节"
    const aiBtn = wrapper.find('.section-ai-btn')
    expect(aiBtn.exists()).toBe(true)
    await aiBtn.trigger('click')

    // 等待串行 6 字段完成（每个 await runGenerationTask 是 microtask + setTimeout 0）
    await flushPromises()
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()

    // 6 字段草稿就绪 → 抽屉显示
    const summary = wrapper.find('.draft-drawer summary')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toContain('6')

    // 卡片有 draft-ready-dot
    const dots = wrapper.findAll('.draft-ready-dot')
    expect(dots.length).toBe(6)

    // 点击第一个抽屉项 → 打开 review
    const items = wrapper.findAll('.draft-drawer-item')
    expect(items.length).toBe(6)
    await items[0].trigger('click')
    await nextTick()

    // review 出现
    expect(wrapper.find('.setting-draft-review').exists()).toBe(true)

    // 采纳
    const adoptBtn = wrapper.find('.setting-draft-review .primary-btn')
    await adoptBtn.trigger('click')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()

    // 第一个字段已写入 form（并被 store 同步 — 通过 updateStructuredSetting mock）
    // 5 字段剩余
    const remaining = wrapper.findAll('.draft-drawer-item')
    expect(remaining.length).toBe(5)
    expect(wrapper.find('.setting-draft-review').exists()).toBe(false)

    wrapper.unmount()
  })

  it('生成中再次点击 → 中止，状态切到 aborted', async () => {
    // 模拟一个 in-flight 不会自然完成的任务
    let resolveGen
    vi.spyOn(genSvc, 'runGenerationTask').mockImplementation(async () => {
      return await new Promise((resolve) => { resolveGen = resolve })
    })

    const worldbook = reactive(makeWorldbook())
    const wrapper = mount(StructuredSettingsPanel, { props: { worldbook } })
    await nextTick()

    const aiBtn = wrapper.find('.section-ai-btn')
    await aiBtn.trigger('click')
    await flushPromises()

    // pending 状态
    expect(aiBtn.classes()).toContain('is-pending')
    expect(aiBtn.text()).toContain('中止')

    // 再次点击 → abort
    await aiBtn.trigger('click')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 20))
    await flushPromises()

    // 解决 in-flight（模拟网络最终回来 — 但结果应被丢弃）
    if (resolveGen) resolveGen({ success: true, content: 'late', parsed: 'late' })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 20))
    await flushPromises()

    // 状态应已变 aborted（按钮文字）
    expect(aiBtn.text()).toContain('已中止')
    // 没有草稿就绪
    expect(wrapper.findAll('.draft-drawer-item').length).toBe(0)

    wrapper.unmount()
  })

  it('单字段 AI 生成（per-field 按钮）→ 草稿就绪 + 抽屉 1 项', async () => {
    vi.spyOn(genSvc, 'runGenerationTask').mockResolvedValue({
      success: true,
      content: 'single field draft',
      parsed: 'single field draft'
    })

    const worldbook = reactive(makeWorldbook())
    const wrapper = mount(StructuredSettingsPanel, { props: { worldbook } })
    await nextTick()

    // 找到第一个 card 的 generate 按钮
    const generateBtn = wrapper.find('.action-btn')
    expect(generateBtn.exists()).toBe(true)
    await generateBtn.trigger('click')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 20))
    await flushPromises()

    // review 出现（因为单字段生成后会自动 focus）
    expect(wrapper.find('.setting-draft-review').exists()).toBe(true)
    // 抽屉 1 项
    expect(wrapper.findAll('.draft-drawer-item').length).toBe(1)

    wrapper.unmount()
  })

  it('丢弃草稿（drawer）→ 字段 draft-ready-dot 消失', async () => {
    vi.spyOn(genSvc, 'runGenerationTask').mockResolvedValue({
      success: true,
      content: 'c',
      parsed: 'c'
    })

    const worldbook = reactive(makeWorldbook())
    const wrapper = mount(StructuredSettingsPanel, { props: { worldbook } })
    await nextTick()

    await wrapper.find('.action-btn').trigger('click')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 20))
    await flushPromises()

    expect(wrapper.findAll('.draft-ready-dot').length).toBe(1)
    expect(wrapper.findAll('.draft-drawer-item').length).toBe(1)

    // 点击丢弃（drawer 中的）
    const discardAct = wrapper.find('.drawer-act')
    expect(discardAct.exists()).toBe(true)
    await discardAct.trigger('click')
    await nextTick()

    expect(wrapper.findAll('.draft-drawer-item').length).toBe(0)
    expect(wrapper.findAll('.draft-ready-dot').length).toBe(0)

    wrapper.unmount()
  })

  it('生成草稿后切换页面/重挂载仍保留预览', async () => {
    vi.spyOn(genSvc, 'runGenerationTask').mockResolvedValue({
      success: true,
      content: 'persistent field draft',
      parsed: 'persistent field draft'
    })

    const worldbook = reactive(makeWorldbook())
    const wrapper = mount(StructuredSettingsPanel, { props: { worldbook } })
    await nextTick()

    await wrapper.find('.action-btn').trigger('click')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 20))
    await flushPromises()

    expect(wrapper.find('.setting-draft-review').exists()).toBe(true)
    expect(wrapper.find('.setting-draft-review').text()).toContain('persistent field draft')
    wrapper.unmount()

    const remounted = mount(StructuredSettingsPanel, { props: { worldbook } })
    await nextTick()

    expect(remounted.findAll('.draft-drawer-item').length).toBe(1)
    expect(remounted.find('.setting-draft-review').exists()).toBe(true)
    expect(remounted.find('.setting-draft-review').text()).toContain('persistent field draft')

    remounted.unmount()
  })
})
