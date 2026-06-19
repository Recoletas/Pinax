import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'

// kao WelcomeView's <script setup> calls useRoute() / useRouter(). Stub both
// so we can mount without spinning up a real router.
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  createRouter: () => ({}),
  createWebHashHistory: () => ({}),
}))

import KaoWelcomeView from '../views/WelcomeView.vue'
import LegacyWelcomeView from '../views/legacy/WelcomeView.vue'
import { useThemeStore, LS_VARIANT } from '../stores/themeStore.js'

// kao WelcomeView pulls these via <script setup>; mock them so we don't
// load their full DOM / asset dependency chain.
vi.mock('../components/folio/PosterStage.vue', () => ({
  default: { name: 'PosterStage', template: '<div class="poster-stage-mock"><slot /></div>' },
}))
vi.mock('../components/folio/FolioSurface.vue', () => ({
  default: { name: 'FolioSurface', template: '<div class="folio-surface-mock"><slot /></div>' },
}))
vi.mock('../components/folio/BookmarkButton.vue', () => ({
  default: {
    name: 'BookmarkButton',
    template: '<a class="bookmark-button-mock"><slot /></a>',
    props: ['to', 'label', 'index', 'variant', 'indexClass', 'labelClass', 'compact'],
  },
}))
vi.mock('../components/folio/ArchiveStrip.vue', () => ({
  default: {
    name: 'ArchiveStrip',
    template: '<div class="archive-strip-mock" />',
    props: ['items', 'image'],
  },
}))
// kao.jpg is imported as a module-side-effect URL.
vi.mock('../../docs/demo/kao.jpg', () => ({ default: 'kao-mock-url' }))

async function settle() {
  await flushPromises()
  await nextTick()
  await flushPromises()
}

describe('welcome chrome variant toggle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('kao WelcomeView chrome has variant-kao + variant-legacy buttons', async () => {
    const store = useThemeStore()
    store.initTheme()

    const wrapper = mount(KaoWelcomeView)
    await settle()

    const variantKao = wrapper.find('[data-test="variant-kao"]')
    const variantLegacy = wrapper.find('[data-test="variant-legacy"]')
    const themeToggle = wrapper.find('[data-test="theme-toggle"]')

    expect(variantKao.exists()).toBe(true)
    expect(variantLegacy.exists()).toBe(true)
    // No regression: light/dark button still there.
    expect(themeToggle.exists()).toBe(true)

    // aria-pressed contract — toggle is keyboard-/AT-discoverable.
    expect(variantKao.attributes('aria-pressed')).toBeDefined()
    expect(variantLegacy.attributes('aria-pressed')).toBeDefined()

    // Default state is kao per DEFAULT_VARIANT = 'kao'.
    expect(variantKao.classes()).toContain('is-active')
    expect(variantLegacy.classes()).not.toContain('is-active')

    wrapper.unmount()
  })

  it('kao WelcomeView clicking variant-legacy sets themeStore.variant = "legacy"', async () => {
    const store = useThemeStore()
    store.initTheme()

    const wrapper = mount(KaoWelcomeView)
    await settle()

    const variantLegacy = wrapper.find('[data-test="variant-legacy"]')
    await variantLegacy.trigger('click')
    await settle()

    expect(store.variant).toBe('legacy')
    expect(localStorage.getItem(LS_VARIANT)).toBe('legacy')
    expect(document.documentElement.classList.contains('theme-legacy')).toBe(true)
    expect(document.documentElement.classList.contains('theme-kao')).toBe(false)

    wrapper.unmount()
  })

  it('kao WelcomeView clicking variant-kao after switching to legacy restores kao', async () => {
    // Pre-seed localStorage to start in legacy so initial render is NOT
    // default-kao — exercises the "switch back" path symmetrically.
    localStorage.setItem(LS_VARIANT, 'legacy')
    const store = useThemeStore()
    store.initTheme()
    expect(store.variant).toBe('legacy')

    const wrapper = mount(KaoWelcomeView)
    await settle()

    const variantKao = wrapper.find('[data-test="variant-kao"]')
    const variantLegacy = wrapper.find('[data-test="variant-legacy"]')
    expect(variantLegacy.classes()).toContain('is-active')
    expect(variantKao.classes()).not.toContain('is-active')

    await variantKao.trigger('click')
    await settle()

    expect(store.variant).toBe('kao')
    expect(localStorage.getItem(LS_VARIANT)).toBe('kao')
    expect(document.documentElement.classList.contains('theme-kao')).toBe(true)
    expect(document.documentElement.classList.contains('theme-legacy')).toBe(false)

    wrapper.unmount()
  })

  it('legacy WelcomeView chrome ALSO has the variant toggle', async () => {
    // Mirror the kao variant for legacy too — same discoverability upgrade
    // applies to the legacy variant per the frozen-snapshot §7 exception.
    const store = useThemeStore()
    store.initTheme()
    store.setVariant('legacy')

    const wrapper = mount(LegacyWelcomeView)
    await settle()

    const variantKao = wrapper.find('[data-test="variant-kao"]')
    const variantLegacy = wrapper.find('[data-test="variant-legacy"]')

    expect(variantKao.exists()).toBe(true)
    expect(variantLegacy.exists()).toBe(true)

    // When in legacy view, the active state is legacy.
    expect(variantLegacy.classes()).toContain('is-active')
    expect(variantKao.classes()).not.toContain('is-active')

    wrapper.unmount()
  })

  it('legacy WelcomeView clicking variant-kao switches to kao', async () => {
    const store = useThemeStore()
    store.initTheme()
    store.setVariant('legacy')

    const wrapper = mount(LegacyWelcomeView)
    await settle()

    const variantKao = wrapper.find('[data-test="variant-kao"]')
    await variantKao.trigger('click')
    await settle()

    expect(store.variant).toBe('kao')

    wrapper.unmount()
  })
})
