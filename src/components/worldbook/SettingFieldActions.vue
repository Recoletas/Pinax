<template>
  <div class="setting-field-actions" :class="{ 'has-state': working || hasDraft }">
    <button
      type="button"
      class="action-btn"
      :disabled="working"
      :aria-label="generateAriaLabel"
      @click="$emit('generate')"
    >
      <WorkbenchIcon name="sparkles" :size="15" />
      <span>{{ working ? tr('生成中…') : tr('生成草稿') }}</span>
    </button>
  </div>
</template>

<script setup>
import { tr } from '../../i18n/index.js'
import { computed } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'

const props = defineProps({
  fieldLabel: { type: String, required: true },
  working: { type: Boolean, default: false },
  hasDraft: { type: Boolean, default: false }
})

defineEmits(['generate'])

const generateAriaLabel = computed(() => tr('为设定项「{field}」生成 AI 草稿', { field: tr(props.fieldLabel) }))
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
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 10px;
  border: 1px solid var(--archive-paper-strong);
  border-radius: 6px;
  background: var(--archive-paper-soft);
  color: var(--archive-ink-soft);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.action-btn:hover {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--archive-paper-strong));
  background: color-mix(in srgb, var(--accent) 6%, var(--archive-paper-soft));
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
