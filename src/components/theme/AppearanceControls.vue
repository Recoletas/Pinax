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

function pick(option) {
  themeStore.setAppearance(option.variant, option.colorScheme)
}
</script>

<template>
  <fieldset class="appearance-controls" data-test="appearance-controls">
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
</template>

<style scoped>
.appearance-controls {
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
