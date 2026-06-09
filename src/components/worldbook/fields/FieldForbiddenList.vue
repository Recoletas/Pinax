<template>
  <ul class="forbidden-list" @click="focusInput">
    <li v-for="(token, i) in tokens" :key="`${token}-${i}`" class="forbidden-item">
      <span class="forbidden-icon" aria-hidden="true">⛔</span>
      <span class="forbidden-text">{{ token }}</span>
      <button
        type="button"
        class="forbidden-remove"
        :aria-label="`移除 ${token}`"
        @click.stop="remove(i)"
      >×</button>
    </li>
    <li class="forbidden-input-row">
      <input
        :id="inputId"
        ref="inputEl"
        v-model="pending"
        type="text"
        class="forbidden-pending"
        :placeholder="tokens.length ? '' : placeholder"
        :aria-required="ariaRequired ? 'true' : 'false'"
        :aria-invalid="ariaInvalid ? 'true' : 'false'"
        :aria-label="ariaLabel"
        @input="onInput"
        @keydown="onKeydown"
        @blur="onBlur"
      />
    </li>
  </ul>
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
.forbidden-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 42px;
  border: 1px solid color-mix(in srgb, var(--danger) 38%, var(--border));
  border-radius: 10px;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--danger) 14%, transparent) 0 3px, transparent 3px),
    color-mix(in srgb, var(--danger) 5%, var(--bg-primary));
  color: var(--text-primary);
  padding: 9px 10px 9px 13px;
  cursor: text;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.forbidden-list:focus-within {
  outline: none;
  border-color: color-mix(in srgb, var(--danger) 64%, var(--border));
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--danger) 18%, transparent) 0 3px, transparent 3px),
    color-mix(in srgb, var(--danger) 7%, var(--bg-primary));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--danger) 11%, transparent);
}

@media (forced-colors: active) {
  .forbidden-list:focus-within {
    outline: 3px solid Highlight;
  }
}

.forbidden-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  line-height: 1.5;
  padding: 6px 7px;
  border: 1px solid color-mix(in srgb, var(--danger) 18%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-secondary) 56%, transparent);
}

.forbidden-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  color: var(--danger);
  font-size: 10px;
  line-height: 1;
}

.forbidden-text {
  flex: 1;
  white-space: pre-wrap;
  word-break: break-word;
  color: color-mix(in srgb, var(--danger) 72%, var(--text-primary));
}

.forbidden-remove {
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

.forbidden-remove:hover {
  border-color: color-mix(in srgb, var(--danger) 24%, transparent);
  background: color-mix(in srgb, var(--danger) 13%, transparent);
  color: var(--danger);
}

.forbidden-input-row {
  list-style: none;
}

.forbidden-pending {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  padding: 3px 0 1px;
  font-family: inherit;
}

.forbidden-pending::placeholder {
  color: var(--text-muted);
}
</style>
