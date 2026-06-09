<template>
  <div class="tag-input" @click="focusInput">
    <span v-for="(token, i) in tokens" :key="`${token}-${i}`" class="tag tag-style">
      <span class="tag-hash" aria-hidden="true">#</span>
      <span class="tag-text">{{ token }}</span>
      <button
        type="button"
        class="tag-remove"
        :aria-label="`移除 ${token}`"
        @click.stop="remove(i)"
      >×</button>
    </span>
    <input
      :id="inputId"
      ref="inputEl"
      v-model="pending"
      type="text"
      class="tag-pending"
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
  delimiter: { type: Array, default: () => ['，', ',', '、', ' ', '\n'] },
  parseMode: { type: String, default: 'multiDelimiter' },
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
.tag-input {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
  min-height: 42px;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 10px;
  background:
    radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent-teal, var(--accent)) 8%, transparent), transparent 42%),
    color-mix(in srgb, var(--bg-primary) 88%, transparent);
  color: var(--text-primary);
  padding: 7px 8px;
  cursor: text;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.tag-input:focus-within {
  outline: none;
  border-color: color-mix(in srgb, var(--accent-teal, var(--accent)) 56%, var(--border));
  background: var(--bg-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-teal, var(--accent)) 10%, transparent);
}

@media (forced-colors: active) {
  .tag-input:focus-within {
    outline: 3px solid Highlight;
  }
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: color-mix(in srgb, var(--accent-teal, var(--accent)) 9%, var(--bg-secondary));
  border: 1px solid color-mix(in srgb, var(--accent-teal, var(--accent)) 26%, var(--border));
  border-radius: 7px;
  padding: 3px 7px 3px 5px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.tag-hash {
  color: color-mix(in srgb, var(--accent-teal, var(--accent)) 82%, var(--text-secondary));
  font-weight: 700;
}

.tag-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.tag-remove {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--bg-primary) 46%, transparent);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  border-radius: 50%;
}

.tag-remove:hover {
  border-color: color-mix(in srgb, var(--accent-teal, var(--accent)) 24%, transparent);
  background: color-mix(in srgb, var(--accent-teal, var(--accent)) 10%, transparent);
  color: var(--accent-teal, var(--accent));
}

.tag-pending {
  flex: 1;
  min-width: 80px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  padding: 3px 0;
  font-family: inherit;
}

.tag-pending::placeholder {
  color: var(--text-muted);
}
</style>
