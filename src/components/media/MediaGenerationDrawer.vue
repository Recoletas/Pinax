<template>
  <ImageGenerationWorkbench v-bind="$attrs" />
</template>

<script setup>
import ImageGenerationWorkbench from './ImageGenerationWorkbench.vue'

defineOptions({ inheritAttrs: false })
</script>
