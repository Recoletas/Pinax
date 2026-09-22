<script setup>
import { tr } from '../../i18n/index.js'

defineProps({
  notice: { type: Object, default: null }
})
const emit = defineEmits(['review'])
</script>

<template>
  <p v-if="notice?.text" class="authoring-memory-notice" role="status" aria-live="polite">
    <span>{{ tr(notice.text) }}</span>
    <button
      v-if="notice.reviewable"
      type="button"
      class="authoring-memory-notice__review"
      @click="emit('review')"
    >{{ tr('查看') }}</button>
  </p>
</template>

<style scoped>
.authoring-memory-notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  color: var(--text-secondary);
  font-size: 12px;
}

.authoring-memory-notice__review {
  appearance: none;
  min-height: 44px;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--accent-primary);
  cursor: pointer;
  font-size: 12px;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

.authoring-memory-notice span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.authoring-memory-notice__review:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}
</style>
