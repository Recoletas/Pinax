<template>
  <div class="setting-field-actions" :class="{ 'has-state': working || hasDraft }">
    <button
      type="button"
      class="action-btn"
      :disabled="working"
      :aria-label="generateAriaLabel"
      @click="$emit('generate')"
    >
      {{ working ? '生成中…' : 'AI 生成' }}
    </button>
    <button
      v-if="modelValue"
      type="button"
      class="action-btn"
      :aria-label="convertAriaLabel"
      @click="$emit('convert-entry')"
    >
      转条目
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  fieldLabel: { type: String, required: true },
  modelValue: { type: String, default: '' },
  working: { type: Boolean, default: false },
  hasDraft: { type: Boolean, default: false }
})

defineEmits(['generate', 'convert-entry'])

const generateAriaLabel = computed(() => `为「${props.fieldLabel}」生成 AI 草稿`)
const convertAriaLabel = computed(() => `将「${props.fieldLabel}」转为世界书条目`)
</script>

<style scoped>
.setting-field-actions {
  display: flex;
  gap: 5px;
  opacity: 1;
  transition: opacity 0.15s;
}

.setting-field-actions:hover,
.setting-field-actions:focus-within,
.setting-field-actions.has-state {
  opacity: 1;
}

.action-btn {
  height: 27px;
  padding: 0 9px;
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-primary) 70%, transparent);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.action-btn:hover {
  border-color: color-mix(in srgb, var(--accent) 36%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface-raised));
  color: var(--accent);
}

.action-btn:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.action-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
