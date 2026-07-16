<template>
  <MediaGenerationDrawer v-bind="$attrs" />
</template>

<script setup>
import MediaGenerationDrawer from './media/MediaGenerationDrawer.vue'

defineOptions({ inheritAttrs: false })
</script>
