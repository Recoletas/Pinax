<script setup>
import { computed } from 'vue'
import { useThemeStore } from '../../stores/themeStore.js'

const themeStore = useThemeStore()

const OPTIONS = [
  { variant: 'kao', colorScheme: 'light', label: '主题1 · 亮色', testId: 'appearance-kao-light' },
  { variant: 'kao', colorScheme: 'dark', label: '主题1 · 暗色', testId: 'appearance-kao-dark' },
  { variant: 'legacy', colorScheme: 'light', label: '主题2 · 亮色', testId: 'appearance-legacy-light' },
  { variant: 'legacy', colorScheme: 'dark', label: '主题2 · 暗色', testId: 'appearance-legacy-dark' },
]

// W5 UX sweep: a corrupt/out-of-range theme value (e.g. "darkk" from
// older version or devtools) made `current` undefined and ALL 4 radios
// looked unselected — visually disorienting with no recovery hint.
// Default to OPTIONS[0] when no match, so at least one radio is always
// visually checked. The recovery message stays in the store's devtools
// / console; the radio is the recovery point for the user.
const current = computed(() =>
  OPTIONS.find((o) => o.variant === themeStore.variant && o.colorScheme === themeStore.colorScheme)
    || OPTIONS[0]
)

// Phase F (revised): UI 缩放档位 — 默认 85%, 不要太激进
const ZOOM_OPTIONS = [
  { value: 1, label: '100%', testId: 'ui-zoom-100' },
  { value: 0.95, label: '95%', testId: 'ui-zoom-95' },
  { value: 0.9, label: '90%', testId: 'ui-zoom-90' },
  { value: 0.85, label: '85%', testId: 'ui-zoom-85' }
]
const currentZoom = computed(() => {
  return ZOOM_OPTIONS.find((o) => o.value === themeStore.uiZoom) || ZOOM_OPTIONS[3]
})

function pick(option) {
  themeStore.setAppearance(option.variant, option.colorScheme)
}

function pickZoom(option) {
  themeStore.setUiZoom(option.value)
}
</script>

<template>
  <div class="appearance-controls" data-test="appearance-controls">
    <fieldset class="appearance-controls__group">
      <legend class="appearance-controls__legend">外观</legend>
      <label
        v-for="opt in OPTIONS"
        :key="opt.testId"
        class="appearance-controls__option"
        :data-test="opt.testId"
        :class="{ 'is-active': current.testId === opt.testId }"
      >
        <input
          type="radio"
          name="appearance"
          :value="opt.testId"
          :checked="current.testId === opt.testId"
          @change="pick(opt)"
        />
        <span>{{ opt.label }}</span>
      </label>
    </fieldset>

    <fieldset class="appearance-controls__group">
      <legend class="appearance-controls__legend">缩放</legend>
      <label
        v-for="opt in ZOOM_OPTIONS"
        :key="opt.testId"
        class="appearance-controls__option"
        :data-test="opt.testId"
        :class="{ 'is-active': currentZoom.testId === opt.testId }"
      >
        <input
          type="radio"
          name="ui-zoom"
          :value="opt.testId"
          :checked="currentZoom.testId === opt.testId"
          @change="pickZoom(opt)"
        />
        <span>{{ opt.label }}</span>
      </label>
    </fieldset>
  </div>
</template>

<style scoped>
.appearance-controls {
  border: 0;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.appearance-controls__group {
  border: 0;
  padding: 0;
  margin: 0;
}

.appearance-controls__legend {
  font-size: var(--fs-sm, 12px);
  color: var(--text-secondary, #5d5247);
  margin-bottom: 6px;
}

.appearance-controls__option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  cursor: pointer;
}
</style>