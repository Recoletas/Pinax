/**
 * G1.4.10 R1 — useExperienceReadingPreferences 单测。
 *
 * 隔离原则: composable 同时依赖 themeStore (Pinia) 和 localStorage。
 * 这里给测试注入一个最薄 pinia + 一份内存 localStorage, 不动全局 setup,
 * 也避免污染其它测试文件 (see worldStoreSyncStructuredEntries.test.js 同一手法)。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  READING_PROFILES,
  useExperienceReadingPreferences,
} from '../composables/useExperienceReadingPreferences'
import { STORAGE_KEYS } from '../composables/useStorage'
import { useThemeStore } from '../stores/themeStore'

// ---- 极简 localStorage: useStorage.getTextItem/setTextItem 直接走全局 ----
function makeStorage() {
  const store = new Map()
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}

let storage

beforeEach(() => {
  storage = makeStorage()
  globalThis.localStorage = storage
  globalThis.sessionStorage = makeStorage()
  setActivePinia(createPinia())
})

afterEach(() => {
  storage.clear()
})

describe('useExperienceReadingPreferences', () => {
  it('default profile = standard with 17.5px / 62em / leading 1.78', () => {
    const pref = useExperienceReadingPreferences()
    expect(pref.profileName.value).toBe('standard')
    expect(pref.profile.value).toBe(READING_PROFILES.standard)
    expect(pref.profile.value.physicalFontSize).toBe(17.5)
    expect(pref.profile.value.measureEm).toBe(62)
    expect(pref.profile.value.leading).toBe(1.78)
    expect(pref.profile.value.blockGapEm).toBe(0.72)
    // cssVars 在 uiZoom 默认 0.85 下: 17.5 / 0.85 ≈ 20.588px
    expect(pref.cssVars.value['--experience-physical-font-size']).toBe('17.5px')
    expect(pref.cssVars.value['--experience-prose-size']).toBe('20.588px')
    expect(pref.cssVars.value['--experience-measure']).toBe('62em')
    expect(pref.cssVars.value['--experience-leading']).toBe('1.78')
    expect(pref.cssVars.value['--experience-block-gap']).toBe('0.72em')
    expect(pref.cssVars.value['--experience-ui-zoom']).toBe('0.85')
    expect(pref.isStandard.value).toBe(true)
  })

  it('switching to compact sets --experience-prose-size = 16.5 / uiZoom px', () => {
    const pref = useExperienceReadingPreferences()
    const themeStore = useThemeStore()
    themeStore.uiZoom = 0.85
    pref.setProfile('compact')

    expect(pref.profileName.value).toBe('compact')
    expect(pref.profile.value.physicalFontSize).toBe(16.5)
    // 16.5 / 0.85 = 19.4117647...; 保留 3 位小数 → "19.412px"
    expect(pref.cssVars.value['--experience-prose-size']).toBe('19.412px')
    expect(pref.cssVars.value['--experience-physical-font-size']).toBe('16.5px')
    expect(pref.cssVars.value['--experience-measure']).toBe('66em')
    expect(pref.cssVars.value['--experience-leading']).toBe('1.68')
    expect(pref.cssVars.value['--experience-block-gap']).toBe('0.45em')
  })

  it('switching to relaxed sets 18.5px / 56em / leading 1.92', () => {
    const pref = useExperienceReadingPreferences()
    pref.setProfile('relaxed')

    expect(pref.profileName.value).toBe('relaxed')
    expect(pref.profile.value.physicalFontSize).toBe(18.5)
    expect(pref.profile.value.measureEm).toBe(56)
    expect(pref.profile.value.leading).toBe(1.92)
    expect(pref.profile.value.blockGapEm).toBe(0.92)
    expect(pref.cssVars.value['--experience-physical-font-size']).toBe('18.5px')
    expect(pref.cssVars.value['--experience-measure']).toBe('56em')
    expect(pref.cssVars.value['--experience-leading']).toBe('1.92')
    expect(pref.cssVars.value['--experience-block-gap']).toBe('0.92em')
  })

  it('resetProfile() returns to standard', () => {
    const pref = useExperienceReadingPreferences()
    pref.setProfile('relaxed')
    expect(pref.profileName.value).toBe('relaxed')
    pref.resetProfile()
    expect(pref.profileName.value).toBe('standard')
    expect(pref.isStandard.value).toBe(true)
    expect(pref.cssVars.value['--experience-physical-font-size']).toBe('17.5px')
  })

  it('persisting: setProfile(\'compact\') reads back on next useExperienceReadingPreferences() call', async () => {
    const first = useExperienceReadingPreferences()
    first.setProfile('compact')
    // watch 是 post-flush, 等一拍确保 setTextItem 已落盘
    await new Promise((r) => setTimeout(r, 0))
    expect(storage.getItem(STORAGE_KEYS.EXPERIENCE_READING_PROFILE)).toBe('compact')

    const second = useExperienceReadingPreferences()
    expect(second.profileName.value).toBe('compact')
    expect(second.profile.value.physicalFontSize).toBe(16.5)
  })
})