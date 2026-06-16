import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useThemeStore, DEFAULT_VARIANT, DEFAULT_COLOR_SCHEME, LS_VARIANT, LS_COLOR } from '../stores/themeStore.js'

describe('themeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('exposes default state on first construction', () => {
    const s = useThemeStore()
    expect(s.variant).toBe(DEFAULT_VARIANT)
    expect(s.colorScheme).toBe(DEFAULT_COLOR_SCHEME)
    expect(s.initialized).toBe(false)
  })

  it('initTheme() reads valid localStorage values into state', () => {
    localStorage.setItem(LS_VARIANT, 'legacy')
    localStorage.setItem(LS_COLOR, 'dark')
    const s = useThemeStore()
    s.initTheme()
    expect(s.variant).toBe('legacy')
    expect(s.colorScheme).toBe('dark')
    expect(s.initialized).toBe(true)
  })

  it('initTheme() falls back to defaults on invalid variant', () => {
    localStorage.setItem(LS_VARIANT, 'garbage')
    localStorage.setItem(LS_COLOR, 'dark')
    const s = useThemeStore()
    s.initTheme()
    expect(s.variant).toBe(DEFAULT_VARIANT)
    expect(s.colorScheme).toBe('dark')
  })

  it('initTheme() preserves existing app_theme=dark when no variant key', () => {
    localStorage.setItem(LS_COLOR, 'dark')
    const s = useThemeStore()
    s.initTheme()
    expect(s.variant).toBe(DEFAULT_VARIANT)
    expect(s.colorScheme).toBe('dark')
  })

  it('setVariant("legacy") updates state, localStorage, and <html>', () => {
    const s = useThemeStore()
    s.initTheme()
    s.setVariant('legacy')
    expect(s.variant).toBe('legacy')
    expect(localStorage.getItem(LS_VARIANT)).toBe('legacy')
    expect(document.documentElement.classList.contains('theme-legacy')).toBe(true)
    expect(document.documentElement.classList.contains('theme-kao')).toBe(false)
  })

  it('setVariant("garbage") is a no-op', () => {
    const s = useThemeStore()
    s.initTheme()
    s.setVariant('garbage')
    expect(s.variant).toBe(DEFAULT_VARIANT)
    expect(localStorage.getItem(LS_VARIANT)).toBeNull()
  })

  it('setColorScheme("dark") updates state, localStorage, and <html>', () => {
    const s = useThemeStore()
    s.initTheme()
    s.setColorScheme('dark')
    expect(s.colorScheme).toBe('dark')
    expect(localStorage.getItem(LS_COLOR)).toBe('dark')
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
    expect(document.documentElement.classList.contains('theme-light')).toBe(false)
  })

  it('toggling setVariant cleans up the previous theme-* class (no leftover)', () => {
    const s = useThemeStore()
    s.initTheme()
    s.setVariant('kao')
    expect(document.documentElement.classList.contains('theme-kao')).toBe(true)
    s.setVariant('legacy')
    expect(document.documentElement.classList.contains('theme-legacy')).toBe(true)
    expect(document.documentElement.classList.contains('theme-kao')).toBe(false)
  })

  it('setAppearance(v, s) updates both, localStorage, and <html> in one applyToHtml call', () => {
    const s = useThemeStore()
    s.initTheme()
    // Spy on applyToHtml AFTER initTheme so we only count the
    // appearance-update call, not the one inside initTheme.
    const applySpy = vi.spyOn(s, 'applyToHtml')
    s.setAppearance('legacy', 'dark')
    expect(s.variant).toBe('legacy')
    expect(s.colorScheme).toBe('dark')
    expect(localStorage.getItem(LS_VARIANT)).toBe('legacy')
    expect(localStorage.getItem(LS_COLOR)).toBe('dark')
    expect(document.documentElement.classList.contains('theme-legacy')).toBe(true)
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
    // Old path fired setVariant then setColorScheme = 2 applyToHtml.
    // New atomic action must fire exactly once per click.
    expect(applySpy).toHaveBeenCalledTimes(1)
    applySpy.mockRestore()
  })

  it('setAppearance(v, s) rejects invalid values without mutating state', () => {
    const s = useThemeStore()
    s.initTheme()
    const beforeVariant = s.variant
    const beforeColor = s.colorScheme
    s.setAppearance('garbage', 'dark')
    expect(s.variant).toBe(beforeVariant)
    expect(s.colorScheme).toBe(beforeColor)
    s.setAppearance('kao', 'neon')
    expect(s.variant).toBe(beforeVariant)
    expect(s.colorScheme).toBe(beforeColor)
  })
})
