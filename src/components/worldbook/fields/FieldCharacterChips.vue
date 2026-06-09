<template>
  <div class="chip-input" @click="focusInput">
    <span v-for="(token, i) in tokens" :key="`${token}-${i}`" class="chip chip-character">
      <span class="chip-dot" aria-hidden="true">·</span>
      <span class="chip-text">{{ token }}</span>
      <button
        type="button"
        class="chip-remove"
        :aria-label="`移除 ${token}`"
        @click.stop="remove(i)"
      >×</button>
    </span>
    <input
      :id="inputId"
      ref="inputEl"
      v-model="pending"
      type="text"
      class="chip-pending"
      :placeholder="tokens.length ? '' : placeholder"
      :aria-required="ariaRequired ? 'true' : 'false'"
      :aria-invalid="ariaInvalid ? 'true' : 'false'"
      :aria-label="ariaLabel"
      @input="onInput"
      @keydown="onKeydown"
      @blur="onBlur"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useChipInput } from '../../../composables/useChipInput'

const props = defineProps({
  modelValue: { type: String, default: '' },
  inputId: { type: String, required: true },
  placeholder: { type: String, default: '' },
  delimiter: { type: Array, default: () => ['\n', ',', '，', ';', '；', '、'] },
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
.chip-input {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-height: 42px;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 10px;
  background:
    radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent) 7%, transparent), transparent 38%),
    color-mix(in srgb, var(--bg-primary) 88%, transparent);
  color: var(--text-primary);
  padding: 7px 8px;
  cursor: text;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.chip-input:focus-within {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 62%, var(--border));
  background: var(--bg-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 10%, transparent);
}

@media (forced-colors: active) {
  .chip-input:focus-within {
    outline: 3px solid Highlight;
  }
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: color-mix(in srgb, var(--accent) 11%, var(--bg-secondary));
  border: 1px solid color-mix(in srgb, var(--accent) 32%, var(--border));
  border-radius: 999px;
  padding: 3px 8px 3px 7px;
  font-size: 12px;
  line-height: 1.4;
  box-shadow: 0 1px 0 color-mix(in srgb, #ffffff 12%, transparent) inset;
}

.chip-dot {
  color: var(--accent);
  font-weight: 700;
}

.chip-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.chip-remove {
  width: 17px;
  height: 17px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--bg-primary) 54%, transparent);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  border-radius: 50%;
}

.chip-remove:hover {
  border-color: color-mix(in srgb, var(--accent) 26%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}

.chip-pending {
  flex: 1;
  min-width: 80px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  padding: 3px 0;
  font-family: inherit;
}

.chip-pending::placeholder {
  color: var(--text-muted);
}
</style>
