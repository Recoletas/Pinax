<template>
  <div class="setting-field-actions" :class="{ 'has-state': working || hasDraft }">
    <button
      type="button"
      class="action-btn"
      :disabled="working"
      :aria-label="generateAriaLabel"
      @click="$emit('generate')"
    >
      <WorkbenchIcon name="sparkles" :size="13" />
      <span>{{ working ? '生成中…' : '生成草稿' }}</span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'

const props = defineProps({
  fieldLabel: { type: String, required: true },
  working: { type: Boolean, default: false },
  hasDraft: { type: Boolean, default: false }
})

defineEmits(['generate'])

const generateAriaLabel = computed(() => `为设定项「${props.fieldLabel}」生成 AI 草稿`)
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
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 3px;
  border: 0;
  border-bottom: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--archive-ink-soft);
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.action-btn:hover {
  border-bottom-color: color-mix(in srgb, var(--accent) 52%, transparent);
  background: transparent;
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
