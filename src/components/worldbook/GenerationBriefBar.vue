<template>
  <div class="generation-brief-bar">
    <label :for="inputId" class="brief-label">
      <span>用户 brief</span>
      <span class="brief-hint">（可选，给 AI 的额外提示）</span>
    </label>
    <textarea
      :id="inputId"
      class="brief-input"
      rows="2"
      :value="modelValue"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      @input="$emit('update:modelValue', $event.target.value)"
    ></textarea>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  sectionKey: { type: String, required: true },
  fieldKey: { type: String, default: '' },
  placeholder: { type: String, default: '给 AI 的额外提示：风格、长度、强调点...' }
})

defineEmits(['update:modelValue'])

const inputId = computed(() => `brief-${props.sectionKey}${props.fieldKey ? `-${props.fieldKey}` : ''}`)
const ariaLabel = computed(() => props.fieldKey
  ? `字段「${props.fieldKey}」生成 AI 草稿时的用户 brief`
  : `分区「${props.sectionKey}」批量生成 AI 草稿时的用户 brief`
)
</script>

<style scoped>
.generation-brief-bar {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
  border-radius: 12px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--accent) 7%, var(--surface-raised)), color-mix(in srgb, var(--surface-raised) 92%, transparent));
}

.brief-label {
  display: flex;
  gap: 6px;
  align-items: baseline;
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 700;
}

.brief-hint {
  font-weight: normal;
  opacity: 0.7;
}

.brief-input {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--bg-primary) 86%, transparent);
  color: var(--text-primary);
  padding: 8px 9px;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  min-height: 52px;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.brief-input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 62%, var(--border));
  background: var(--bg-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 10%, transparent);
}

@media (forced-colors: active) {
  .brief-input:focus {
    outline: 3px solid Highlight;
  }
}
</style>
