<template>
  <article class="setting-field-card">
    <div class="field-head">
      <h3>{{ field.label }}</h3>
      <div class="field-actions">
        <button class="text-btn-sm" :disabled="working" @click="$emit('generate', payload)">
          {{ working ? '生成中...' : 'AI 生成' }}
        </button>
        <button class="text-btn-sm" v-if="modelValue" @click="$emit('convert-entry', payload)">转条目</button>
      </div>
    </div>

    <textarea
      class="text-area"
      rows="4"
      :placeholder="`填写${field.label}`"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
      @blur="$emit('save', payload)"
    ></textarea>
  </article>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  section: { type: Object, required: true },
  field: { type: Object, required: true },
  modelValue: { type: String, default: '' },
  working: { type: Boolean, default: false }
})

defineEmits(['update:modelValue', 'save', 'generate', 'convert-entry'])

const payload = computed(() => ({
  sectionKey: props.section.key,
  fieldKey: props.field.key
}))
</script>

<style scoped>
.setting-field-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.field-head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.field-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.setting-field-card:hover .field-actions {
  opacity: 1;
}

.text-btn-sm {
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.text-btn-sm:hover {
  background: var(--surface-raised);
  color: var(--text-primary);
}

.text-btn-sm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.text-area {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 8px;
  font-size: 13px;
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
}

.text-area:focus {
  outline: none;
  border-color: var(--accent);
}
</style>
