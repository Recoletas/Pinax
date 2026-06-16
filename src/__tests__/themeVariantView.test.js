import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'

// mock the imports ThemeVariantView resolves to. Two notes:
//   (1) Mock paths are relative to THIS file (src/__tests__/), so use one
//       ".." not two — both files end up pointing at the same module URL.
//   (2) `__esModule: true` is required so Vue's defineAsyncComponent
//       unwraps the `.default` export (real Vite-imported ES modules have
//       this; plain objects do not).
const makeMock = (name, text) => ({
  __esModule: true,
  default: { name, render: () => h('div', text) },
})

vi.mock('../views/WelcomeView.vue', () => makeMock('WelcomeKao', 'kao welcome'))
vi.mock('../views/legacy/WelcomeView.vue', () => makeMock('WelcomeLegacy', 'legacy welcome'))
vi.mock('../pages/OpeningPage.vue', () => makeMock('OpeningKao', 'kao opening'))
vi.mock('../pages/legacy/OpeningPage.vue', () => makeMock('OpeningLegacy', 'legacy opening'))
vi.mock('../pages/Experience.vue', () => makeMock('ExperienceKao', 'kao experience'))
vi.mock('../pages/legacy/Experience.vue', () => makeMock('ExperienceLegacy', 'legacy experience'))

import ThemeVariantView from '../components/theme/ThemeVariantView.vue'
import { useThemeStore } from '../stores/themeStore.js'

// defineAsyncComponent resolves on a microtask, then Vue schedules another
// render tick. flushPromises() alone leaves the inner component unrendered.
async function settle() {
  await flushPromises()
  await nextTick()
  await flushPromises()
}

function factory(props) {
  return mount(ThemeVariantView, { props })
}

describe('ThemeVariantView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // themeStore.initTheme() reads localStorage; clear so a previous test's
    // setVariant('legacy') doesn't leak into the next test's "default kao"
    // assumption.
    localStorage.clear()
    // themeStore.applyToHtml() mutates document.documentElement.classList;
    // reset so a prior test (in another file) that left theme-legacy
    // theme-dark on <html> doesn't bleed into this file's expectations.
    document.documentElement.className = ''
  })

  it('resolves welcome/opening/experience in both variants', async () => {
    const s = useThemeStore()
    s.initTheme()

    // /opening in legacy mode aliases to legacy/Experience.vue (pre-kao had
    // no standalone /opening route — the opening UI lived inside /experience).
    const expectedText = (variant, view) =>
      (view === 'opening' && variant === 'legacy') ? 'legacy experience' : `${variant} ${view}`

    for (const view of ['welcome', 'opening', 'experience']) {
      for (const variant of ['kao', 'legacy']) {
        s.setVariant(variant)
        const wrapper = factory({ view })
        await settle()
        expect(wrapper.text()).toMatch(new RegExp(expectedText(variant, view)))
        wrapper.unmount()
      }
    }
  })

  it('unknown view falls back to a placeholder', async () => {
    const s = useThemeStore()
    s.initTheme()
    const wrapper = factory({ view: 'unknown-route' })
    await settle()
    expect(wrapper.text()).toMatch(/unknown-route/i)
    wrapper.unmount()
  })

  it('switching themeStore.variant changes the rendered component', async () => {
    const s = useThemeStore()
    s.initTheme()
    const wrapper = factory({ view: 'welcome' })
    await settle()
    expect(wrapper.text()).toMatch(/kao welcome/)

    s.setVariant('legacy')
    await settle()
    expect(wrapper.text()).toMatch(/legacy welcome/)
    wrapper.unmount()
  })

  it('only one variant renders at a time (no dual-mount)', async () => {
    // Locks in the `:key="${view}-${themeStore.variant}"` contract in
    // ThemeVariantView.vue. The contract: when the variant flips, the old
    // component must unmount and the new one must mount — never both at once.
    // If the `:key` binding were removed, both components would render
    // simultaneously and this test would fail.
    const s = useThemeStore()
    s.initTheme()
    s.setVariant('kao')
    const wrapper = factory({ view: 'welcome' })
    await settle()

    // After the initial render: only kao is present, legacy is not.
    expect(wrapper.findAllComponents({ name: 'WelcomeKao' }).length).toBe(1)
    expect(wrapper.findAllComponents({ name: 'WelcomeLegacy' }).length).toBe(0)

    // Flip to legacy: only legacy should be present, kao should be unmounted.
    s.setVariant('legacy')
    await settle()
    const kaoAfter = wrapper.findAllComponents({ name: 'WelcomeKao' })
    const legacyAfter = wrapper.findAllComponents({ name: 'WelcomeLegacy' })
    expect(kaoAfter.length).toBe(0)
    expect(legacyAfter.length).toBe(1)
    wrapper.unmount()
  })
})
