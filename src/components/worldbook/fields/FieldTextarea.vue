<template>
  <textarea
    :id="inputId"
    class="field-textarea"
    :rows="rows"
    :placeholder="placeholder"
    :value="modelValue"
    :maxlength="maxLength"
    :aria-required="ariaRequired ? 'true' : 'false'"
    :aria-invalid="ariaInvalid ? 'true' : 'false'"
    :aria-label="ariaLabel"
    @input="$emit('update:modelValue', $event.target.value)"
  ></textarea>
</template>

<script setup>
defineProps({
  modelValue: { type: String, default: '' },
  inputId: { type: String, required: true },
  rows: { type: Number, default: 4 },
  placeholder: { type: String, default: '' },
  maxLength: { type: Number, default: 2000 },
  ariaRequired: { type: Boolean, default: false },
  ariaInvalid: { type: Boolean, default: false },
  ariaLabel: { type: String, default: undefined }
})
defineEmits(['update:modelValue'])
</script>

<style scoped>
.field-textarea {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
  color: var(--text-primary);
  padding: 10px;
  font-size: 13px;
  line-height: 1.58;
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.field-textarea:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 62%, var(--border));
  background: var(--bg-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 10%, transparent);
}

@media (forced-colors: active) {
  .field-textarea:focus {
    outline: 3px solid Highlight;
  }
}
</style>
