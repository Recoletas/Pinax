/**
 * G1.4.10 R1 — 体验页阅读偏好 (字号/行长/行距/段距) 的单一 owner。
 *
 * 替换 Experience.vue 里 lines 510–550 的 inline `readingProfileVars` computed。
 * 冻结值 (来自 R0/R1 sign-off):
 *   - standard: 17.5px / 62em measure / leading 1.78 / blockGap 0.72em
 *   - compact:  16.5px / 66em measure / leading 1.68 / blockGap 0.45em
 *   - relaxed:  18.5px / 56em measure / leading 1.92 / blockGap 0.92em
 *
 * 全局 UI 缩放 (uiZoom, 主题壳写入 body.style.zoom) 会把正文连同容器一起缩到
 * zoom×100vh。要让用户感知的物理字号仍是 `physicalFontSize`, CSS 端必须按
 * `physicalFontSize / uiZoom` 反补偿 (见 themeStore.applyToHtml + useViewportHeight
 * 同一公式)。`cssVars` 同时输出物理值 (`--experience-physical-font-size`)
 * 和 CSS 应用值 (`--experience-prose-size`), 便于审计与打印/截图取物理值。
 *
 * 持久化键沿用 STORAGE_KEYS.EXPERIENCE_READING_PROFILE (旧 inline 版本已写入),
 * 读路径不变 → 现存用户选择不会因本切换重置。
 */
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useThemeStore } from '../stores/themeStore.js'
import { getTextItem, setTextItem, STORAGE_KEYS } from './useStorage.js'

export const READING_PROFILES = Object.freeze({
  compact: Object.freeze({
    key: 'compact',
    label: '紧凑',
    physicalFontSize: 16.5,
    measureEm: 66,
    leading: 1.68,
    blockGapEm: 0.45,
  }),
  standard: Object.freeze({
    key: 'standard',
    label: '标准',
    physicalFontSize: 17.5,
    measureEm: 62,
    leading: 1.78,
    blockGapEm: 0.72,
  }),
  relaxed: Object.freeze({
    key: 'relaxed',
    label: '舒展',
    physicalFontSize: 18.5,
    measureEm: 56,
    leading: 1.92,
    blockGapEm: 0.92,
  }),
})

const STORAGE_KEY = STORAGE_KEYS.EXPERIENCE_READING_PROFILE
const DEFAULT_PROFILE = 'standard'
const VALID_KEYS = Object.freeze(Object.keys(READING_PROFILES))

function normalize(raw) {
  return typeof raw === 'string' && VALID_KEYS.includes(raw) ? raw : DEFAULT_PROFILE
}

export function useExperienceReadingPreferences() {
  const themeStore = useThemeStore()
  const { uiZoom } = storeToRefs(themeStore)

  // 读旧 inline 版本写入的 'experience_reading_profile_v1' 字符串,
  // 不可识别值 (旧值 'default' 等) 静默回落到 standard。
  const profileName = ref(normalize(getTextItem(STORAGE_KEY)))

  const profile = computed(() => READING_PROFILES[profileName.value])

  // 写回到 useStorage 的 getTextItem/setTextItem (与 useViewportHeight 同款
  // safe try/catch 包裹)。未知值不打回原值也不写盘, 直接 fallback。
  watch(profileName, (next) => {
    const normalized = normalize(next)
    if (normalized !== next) {
      profileName.value = normalized
      return
    }
    setTextItem(STORAGE_KEY, normalized)
  })

  // CSS 变量: 物理字号 (审计/打印) + CSS 应用字号 (反补偿 uiZoom) + 几何
  const cssVars = computed(() => {
    const p = profile.value
    const zoom = Number(uiZoom.value) > 0 ? Number(uiZoom.value) : 1
    const cssSize = (p.physicalFontSize / zoom).toFixed(3)
    return {
      '--experience-physical-font-size': `${p.physicalFontSize}px`,
      '--experience-prose-size': `${cssSize}px`,
      '--experience-leading': String(p.leading),
      '--experience-measure': `${p.measureEm}em`,
      '--experience-block-gap': `${p.blockGapEm}em`,
      '--experience-ui-zoom': String(zoom),
    }
  })

  function setProfile(name) {
    profileName.value = normalize(name)
  }

  function resetProfile() {
    profileName.value = DEFAULT_PROFILE
  }

  return {
    profileName,
    profile,
    cssVars,
    profiles: READING_PROFILES,
    setProfile,
    resetProfile,
    isStandard: computed(() => profileName.value === DEFAULT_PROFILE),
  }
}