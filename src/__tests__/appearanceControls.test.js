import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import AppearanceControls from '../components/theme/AppearanceControls.vue'
import { useThemeStore } from '../stores/themeStore.js'

describe('AppearanceControls click behavior', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    document.documentElement.className = ''
  })

  // For each option, start from the OPPOSITE variant+scheme so the click
  // is always a real radio state change. setValue() on an already-checked
  // radio does not fire `change` (real browser behavior), so this avoids
  // a no-op click for the kao-light default case.
  it.each([
    {
      testId: 'appearance-kao-light',
      startVariant: 'legacy',
      startScheme: 'dark',
      expectedVariant: 'kao',
      expectedScheme: 'light',
    },
    {
      testId: 'appearance-kao-dark',
      startVariant: 'kao',
      startScheme: 'light',
      expectedVariant: 'kao',
      expectedScheme: 'dark',
    },
    {
      testId: 'appearance-legacy-light',
      startVariant: 'legacy',
      startScheme: 'dark',
      expectedVariant: 'legacy',
      expectedScheme: 'light',
    },
    {
      testId: 'appearance-legacy-dark',
      startVariant: 'kao',
      startScheme: 'light',
      expectedVariant: 'legacy',
      expectedScheme: 'dark',
    },
  ])(
    'clicking $testId (from $startVariant/$startScheme) sets variant=$expectedVariant colorScheme=$expectedScheme',
    async ({ testId, startVariant, startScheme, expectedVariant, expectedScheme }) => {
      const store = useThemeStore()
      // Pre-seed localStorage with the OPPOSITE so initTheme() reads it.
      localStorage.setItem('app_theme_variant', startVariant)
      localStorage.setItem('app_theme', startScheme)
      store.initTheme()
      expect(store.variant).toBe(startVariant)
      expect(store.colorScheme).toBe(startScheme)

      const wrapper = mount(AppearanceControls)

      const radio = wrapper.find(`[data-test="${testId}"] input[type="radio"]`)
      expect(radio.exists()).toBe(true)
      await radio.setValue()

      expect(store.variant).toBe(expectedVariant)
      expect(store.colorScheme).toBe(expectedScheme)
      expect(localStorage.getItem('app_theme_variant')).toBe(expectedVariant)
      expect(localStorage.getItem('app_theme')).toBe(expectedScheme)
      wrapper.unmount()
    }
  )

  it('only one radio is :checked at a time', async () => {
    const store = useThemeStore()
    store.initTheme()
    const wrapper = mount(AppearanceControls)

    const radios = wrapper.findAll('input[type="radio"]')
    expect(radios.length).toBe(4)

    await wrapper.find('[data-test="appearance-legacy-dark"] input[type="radio"]').setValue()

    const checked = radios.filter((r) => r.element.checked)
    expect(checked.length).toBe(1)
    expect(checked[0].element.value).toBe('appearance-legacy-dark')
    wrapper.unmount()
  })

  it('labels the legacy variant as 经典, not Legacy', () => {
    const store = useThemeStore()
    store.initTheme()
    const wrapper = mount(AppearanceControls)

    expect(wrapper.text()).toContain('经典 · 亮色')
    expect(wrapper.text()).toContain('经典 · 暗色')
    expect(wrapper.text()).not.toContain('Legacy ·')

    wrapper.unmount()
  })
})
