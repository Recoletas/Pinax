import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'

import SettingsPopup from '../components/workbench/SettingsPopup.vue'
import { useSettingsPopup } from '../composables/useSettingsPopup'

const stubAppearance = { template: '<div data-test="appearance-stub">外观</div>' }
const stubApiPanel = { template: '<div data-test="api-stub">AI</div>' }

function mountPopup() {
  return mount(SettingsPopup, {
    global: {
      stubs: {
        AppearanceControls: stubAppearance,
        ApiSettingsPanel: stubApiPanel
      }
    }
  })
}

describe('SettingsPopup', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    const { close } = useSettingsPopup()
    close()
  })

  it('renders the 3 tabs (外观 / AI 配置 / 存储)', async () => {
    useSettingsPopup().open('appearance')
    await nextTick()
    const wrapper = mountPopup()
    expect(wrapper.find('[data-test="settings-tab-appearance"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="settings-tab-ai"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="settings-tab-storage"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('default open() lands on 外观 and only that section is visible', async () => {
    useSettingsPopup().open()
    await nextTick()
    const wrapper = mountPopup()
    expect(wrapper.find('[data-test="settings-tab-appearance"]').classes()).toContain('active')
    expect(wrapper.find('[data-test="appearance-stub"]').isVisible()).toBe(true)
    expect(wrapper.find('[data-test="api-stub"]').isVisible()).toBe(false)
    wrapper.unmount()
  })

  it('switching to AI tab reveals API panel and hides appearance', async () => {
    useSettingsPopup().open('ai')
    await nextTick()
    const wrapper = mountPopup()
    const aiTab = wrapper.find('[data-test="settings-tab-ai"]')
    await aiTab.trigger('click')
    expect(wrapper.find('[data-test="settings-tab-ai"]').classes()).toContain('active')
    expect(wrapper.find('[data-test="api-stub"]').isVisible()).toBe(true)
    expect(wrapper.find('[data-test="appearance-stub"]').isVisible()).toBe(false)
    wrapper.unmount()
  })

  it('switching to 存储 tab reveals the storage summary and top-10 table', async () => {
    localStorage.setItem('foo', 'bar')
    useSettingsPopup().open('storage')
    await nextTick()
    const wrapper = mountPopup()
    const storageTab = wrapper.find('[data-test="settings-tab-storage"]')
    await storageTab.trigger('click')
    expect(wrapper.find('[data-test="settings-tab-storage"]').classes()).toContain('active')
    expect(wrapper.find('.storage-summary').exists()).toBe(true)
    expect(wrapper.find('.storage-table').exists()).toBe(true)
    wrapper.unmount()
  })

  it('close button calls the shared close() (popup can be reopened by open())', async () => {
    const popup = useSettingsPopup()
    popup.open('ai')
    await nextTick()
    const wrapper = mountPopup()
    await wrapper.find('.settings-modal__close').trigger('click')
    expect(popup.isOpen.value).toBe(false)
    wrapper.unmount()
  })
})
