<script setup>
defineProps({
  notice: { type: Object, default: null }
})
const emit = defineEmits(['review'])
</script>

<template>
  <p v-if="notice?.text" class="authoring-memory-notice" role="status" aria-live="polite">
    <span>{{ notice.text }}</span>
    <button
      type="button"
      class="authoring-memory-notice__review"
      @click="emit('review')"
    >查看</button>
  </p>
</template>
