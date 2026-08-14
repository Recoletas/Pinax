/**
 * 故事生成质量第二阶段（Q1）—— 叙事展开度 (紧凑/标准/展开) 的单一 owner。
 *
 * 只影响生成目标长度与 token 预算，不改阅读排版（那归 useExperienceReadingPreferences）。
 * 持久化键 EXPERIENCE_NARRATIVE_EXPANSION，镜像 reading profile 的读/写/归一化。
 */
import { ref, computed, watch } from 'vue'
import { getTextItem, setTextItem, STORAGE_KEYS } from './useStorage.js'

export const NARRATIVE_EXPANSION_LEVELS = Object.freeze({
  compact: Object.freeze({ key: 'compact', label: '简短', factor: 0.65 }),
  standard: Object.freeze({ key: 'standard', label: '标准', factor: 1 }),
  expanded: Object.freeze({ key: 'expanded', label: '充分', factor: 1.35 }),
})

const STORAGE_KEY = STORAGE_KEYS.EXPERIENCE_NARRATIVE_EXPANSION
const DEFAULT_LEVEL = 'standard'
const VALID_KEYS = Object.freeze(Object.keys(NARRATIVE_EXPANSION_LEVELS))

function normalize(raw) {
  return typeof raw === 'string' && VALID_KEYS.includes(raw) ? raw : DEFAULT_LEVEL
}

export function useExperienceNarrativeExpansion() {
  const levelName = ref(normalize(getTextItem(STORAGE_KEY)))

  const level = computed(() => NARRATIVE_EXPANSION_LEVELS[levelName.value])
  const factor = computed(() => level.value.factor)

  watch(levelName, (next) => {
    const normalized = normalize(next)
    if (normalized !== next) {
      levelName.value = normalized
      return
    }
    setTextItem(STORAGE_KEY, normalized)
  })

  function setLevel(name) {
    levelName.value = normalize(name)
  }

  function resetLevel() {
    levelName.value = DEFAULT_LEVEL
  }

  return {
    levelName,
    level,
    factor,
    levels: NARRATIVE_EXPANSION_LEVELS,
    setLevel,
    resetLevel,
    isStandard: computed(() => levelName.value === DEFAULT_LEVEL),
  }
}

export default { useExperienceNarrativeExpansion }
