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
