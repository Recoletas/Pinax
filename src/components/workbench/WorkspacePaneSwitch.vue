<script setup>
import { nextTick, ref } from 'vue'

const props = defineProps({
  modelValue: { type: String, required: true },
  items: { type: Array, required: true },
  label: { type: String, required: true },
  breakpoint: { type: Number, default: 760 }
})

const emit = defineEmits(['update:modelValue'])
const buttons = ref([])

function select(value, index) {
  emit('update:modelValue', value)
  nextTick(() => buttons.value[index]?.focus())
}

function move(event, index) {
  const last = props.items.length - 1
  let nextIndex = index
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = index === last ? 0 : index + 1
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = index === 0 ? last : index - 1
  else if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = last
  else return
  event.preventDefault()
  select(props.items[nextIndex].value, nextIndex)
}
</script>

<template>
  <div
    class="workspace-pane-switch"
    :class="`workspace-pane-switch--${breakpoint}`"
    role="radiogroup"
    :aria-label="label"
  >
    <button
      v-for="(item, index) in items"
      :key="item.value"
      :ref="(element) => { if (element) buttons[index] = element }"
      type="button"
      role="radio"
      :aria-checked="modelValue === item.value"
      :tabindex="modelValue === item.value ? 0 : -1"
      :class="{ active: modelValue === item.value }"
      @click="select(item.value, index)"
      @keydown="move($event, index)"
    >{{ item.label }}</button>
  </div>
</template>

<style scoped>
.workspace-pane-switch {
  flex: 0 0 auto;
  display: none;
  justify-content: center;
  gap: 2px;
  padding: 6px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 14%, transparent);
  background: color-mix(in srgb, var(--archive-paper-soft) 94%, transparent);
}

button {
  min-width: 64px;
  min-height: var(--control-height-sm);
  padding: 4px 12px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--archive-ink-soft);
  cursor: pointer;
  font: inherit;
  font-size: var(--fs-sm);
  transition: color var(--motion-fast) ease, border-color var(--motion-fast) ease;
}

button.active {
  border-bottom-color: var(--accent);
  color: var(--archive-ink);
  font-weight: 700;
}

button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 62%, transparent);
  outline-offset: -2px;
}

@media (max-width: 1100px) {
  .workspace-pane-switch--1100 { display: flex; }
}

@media (max-width: 980px) {
  .workspace-pane-switch--980 { display: flex; }
}

@media (max-width: 760px) {
  .workspace-pane-switch--760 { display: flex; }
}
</style>
