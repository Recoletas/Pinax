<template>
  <ol class="rule-list" @click="focusInput">
    <li v-for="(token, i) in tokens" :key="`${token}-${i}`" class="rule-item">
      <span class="rule-index" aria-hidden="true">{{ i + 1 }}.</span>
      <span class="rule-text">{{ token }}</span>
      <button
        type="button"
        class="rule-remove"
        :aria-label="`移除 ${token}`"
        @click.stop="remove(i)"
      >×</button>
    </li>
    <li class="rule-input-row">
      <input
        :id="inputId"
        ref="inputEl"
        v-model="pending"
        type="text"
        class="rule-pending"
        :placeholder="tokens.length ? '' : placeholder"
        :aria-required="ariaRequired ? 'true' : 'false'"
        :aria-invalid="ariaInvalid ? 'true' : 'false'"
        :aria-label="ariaLabel"
        @input="onInput"
        @keydown="onKeydown"
        @blur="onBlur"
      />
    </li>
  </ol>
</template>

<script setup>
import { ref } from 'vue'
import { useChipInput } from '../../../composables/useChipInput'

const props = defineProps({
  modelValue: { type: String, default: '' },
  inputId: { type: String, required: true },
  placeholder: { type: String, default: '' },
  delimiter: { type: Array, default: () => ['\n'] },
  parseMode: { type: String, default: 'firstSeen' },
  ariaRequired: { type: Boolean, default: false },
  ariaInvalid: { type: Boolean, default: false },
  ariaLabel: { type: String, default: undefined }
})
const emit = defineEmits(['update:modelValue'])

const inputEl = ref(null)
const { tokens, pending, onInput, onKeydown, onBlur, remove } = useChipInput(props, emit)

function focusInput() {
  inputEl.value?.focus()
}
</script>

<style scoped>
.rule-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 42px;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 10px;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--accent-amber, var(--accent)) 10%, transparent) 0 3px, transparent 3px),
    color-mix(in srgb, var(--bg-primary) 88%, transparent);
  color: var(--text-primary);
  padding: 9px 10px 9px 13px;
  cursor: text;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.rule-list:focus-within {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 62%, var(--border));
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--accent-amber, var(--accent)) 16%, transparent) 0 3px, transparent 3px),
    var(--bg-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 10%, transparent);
}

@media (forced-colors: active) {
  .rule-list:focus-within {
    outline: 3px solid Highlight;
  }
}

.rule-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  line-height: 1.5;
  padding: 5px 7px;
  border: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-secondary) 58%, transparent);
}

.rule-index {
  min-width: 22px;
  color: color-mix(in srgb, var(--accent-amber, var(--accent)) 80%, var(--text-secondary));
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.rule-text {
  flex: 1;
  white-space: pre-wrap;
  word-break: break-word;
}

.rule-remove {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  border-radius: 50%;
  flex-shrink: 0;
}

.rule-remove:hover {
  border-color: color-mix(in srgb, var(--danger) 22%, transparent);
  background: color-mix(in srgb, var(--danger) 9%, transparent);
  color: var(--danger);
}

.rule-input-row {
  list-style: none;
}

.rule-pending {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  padding: 3px 0 1px;
  font-family: inherit;
}

.rule-pending::placeholder {
  color: var(--text-muted);
}
</style>
