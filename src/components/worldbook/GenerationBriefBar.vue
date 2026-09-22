<template>
  <div class="generation-brief-bar">
    <label :for="inputId" class="brief-label">
      <span>{{ tr('本节生成要求') }}</span>
      <span class="brief-hint">{{ tr('（可选，用于补充题材、边界和重点）') }}</span>
    </label>
    <textarea
      :id="inputId"
      class="brief-input"
      rows="2"
      :value="modelValue"
      :placeholder="tr(placeholder)"
      :aria-label="ariaLabel"
      @input="$emit('update:modelValue', $event.target.value)"
    ></textarea>
  </div>
</template>

<script setup>
import { tr } from '../../i18n/index.js'
import { computed } from 'vue'
import { getSettingField, getSettingSection } from '../../services/worldbook/settingPanelSchema'

const props = defineProps({
  modelValue: { type: String, default: '' },
  sectionKey: { type: String, required: true },
  fieldKey: { type: String, default: '' },
  placeholder: { type: String, default: '例如：近未来海港城，历史围绕旧灯塔与雾潮展开...' }
})

defineEmits(['update:modelValue'])

const inputId = computed(() => `brief-${props.sectionKey}${props.fieldKey ? `-${props.fieldKey}` : ''}`)
const ariaLabel = computed(() => props.fieldKey
  ? tr('设定项「{field}」的补充生成要求', { field: tr(getSettingField(props.sectionKey, props.fieldKey)?.label || props.fieldKey) })
  : tr('「{section}」的补充生成要求', { section: tr(getSettingSection(props.sectionKey)?.label || props.sectionKey) })
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
  flex-wrap: wrap;
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
