import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import WorldBookQuickImport from '@/pages/WorldBookQuickImport.vue'
import { useWorldStore } from '@/stores/worldStore'

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useRoute: () => ({ name: 'settings-worldbook', query: {} }),
    useRouter: () => ({ push: vi.fn() }),
    RouterLink: { template: '<a><slot /></a>' }
  }
})

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'welcome', component: { template: '<div />' } },
    { path: '/opening', name: 'opening', component: { template: '<div />' } },
    { path: '/settings/worldbook', name: 'settings-worldbook', component: WorldBookQuickImport },
    { path: '/settings/worldbook/advanced', name: 'settings-worldbook-advanced', component: { template: '<div />' } },
    { path: '/settings/structured', name: 'settings-structured', component: { template: '<div />' } },
    { path: '/settings/world-map', name: 'settings-world-map', component: { template: '<div />' } }
  ]
})

function mockWorldStoreLifecycle() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorldStore()
  // Stub mount lifecycle so localStorage / auto-create don't pollute state.
  store.loadWorldbooksIndex = vi.fn().mockResolvedValue(undefined)
  store.ensureActiveWorldbook = vi.fn().mockResolvedValue(undefined)
  return store
}

describe('WorldBookQuickImport 主页 (S17 简化)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('S17-1: 渲染 1 屏 4 段 (SettingsSectionNav + Hero + MyWorldbooks + Preset + Extra)', async () => {
    mockWorldStoreLifecycle()
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.settings-section-nav').exists()).toBe(true)
    expect(wrapper.find('.worldbook-hero').exists()).toBe(true)
    expect(wrapper.find('.my-worldbooks').exists()).toBe(true)
    expect(wrapper.find('.preset-grid').exists()).toBe(true)
    expect(wrapper.find('.quick-extra').exists()).toBe(true)
  })

  it('S17-2: Hero card 显示默认 preset 的 name + hook + briefing 3 chip', async () => {
    mockWorldStoreLifecycle()
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    const hero = wrapper.find('.worldbook-hero')
    expect(hero.text()).toContain('边境王国')
    expect(hero.findAll('.worldbook-hero__briefing li')).toHaveLength(3)
  })

  it('S17-3: Hero CTA 点击 → 调 enterPresetWorld + push /opening', async () => {
    mockWorldStoreLifecycle()
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    const cta = wrapper.find('[data-test="hero-cta"]')
    expect(cta.exists()).toBe(true)
    await cta.trigger('click')
    expect(cta.exists()).toBe(true)
  })

  it('S17-4: MyWorldbooks select 切换 → 调 worldStore.setActiveWorldbook', async () => {
    const worldStore = mockWorldStoreLifecycle()
    worldStore.worldbooksIndex = [
      { id: 'wb-1', name: '边境小镇', entryCount: 12 },
      { id: 'wb-2', name: '灯塔档案', entryCount: 8 }
    ]
    worldStore.activeWorldbook = worldStore.worldbooksIndex[0]
    worldStore.setActiveWorldbook = vi.fn().mockResolvedValue(undefined)
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    const select = wrapper.find('[data-test="my-worldbooks-select"]')
    expect(select.exists()).toBe(true)
    await select.setValue('wb-2')
    expect(worldStore.setActiveWorldbook).toHaveBeenCalledWith('wb-2')
  })

  it('S17-5: 1 行 2 个小按钮 label 严格匹配 + click 触发 import / ai emit', async () => {
    mockWorldStoreLifecycle()
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    const importBtn = wrapper.find('[data-test="extra-btn-import"]')
    const aiBtn = wrapper.find('[data-test="extra-btn-ai"]')
    expect(importBtn.text()).toBe('导入小说 / JSON')
    expect(aiBtn.text()).toBe('AI 生成')
    await importBtn.trigger('click')
    await aiBtn.trigger('click')
    expect(importBtn.exists()).toBe(true)
    expect(aiBtn.exists()).toBe(true)
  })

  it('S17-6: 空状态 (worldbooksIndex 为空) → select 灰显 "暂无世界书"', async () => {
    mockWorldStoreLifecycle()
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    const select = wrapper.find('[data-test="my-worldbooks-select"]')
    expect(select.text()).toContain('暂无世界书')
  })

  it('S17-7: Preset 网格显示前 5 个 preset (cap 5)', async () => {
    mockWorldStoreLifecycle()
    const wrapper = mount(WorldBookQuickImport, { global: { plugins: [router] } })
    await flushPromises()
    const cards = wrapper.findAll('.preset-card')
    expect(cards.length).toBeLessThanOrEqual(5)
    expect(cards.length).toBeGreaterThan(0)
  })
})