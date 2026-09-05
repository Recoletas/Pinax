<script setup>
defineProps({
  notice: { type: Object, default: null }
})
const emit = defineEmits(['undo'])
</script>

<template>
  <p v-if="notice?.text" class="authoring-transient-notice" role="status">
    <span>{{ notice.text }}</span>
    <button
      v-if="notice.canUndo"
      type="button"
      class="authoring-transient-notice__undo"
      @click="emit('undo')"
    >撤销</button>
  </p>
</template>

<style scoped>
.authoring-transient-notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 0 0 6px;
  padding: 4px 2px;
  color: var(--text-secondary);
  font-size: 12px;
}

.authoring-transient-notice__undo {
  appearance: none;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

.authoring-transient-notice span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.authoring-transient-notice__undo:hover {
  color: var(--accent-primary);
}

.authoring-transient-notice__undo:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}
</style>
