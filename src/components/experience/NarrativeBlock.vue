<script setup>
defineProps({
  block: { type: Object, required: true },
  showSpeaker: { type: Boolean, default: false },
  renderContent: { type: Function, required: true }
})
</script>

<template>
  <div
    class="narrative-block"
    :class="[`narrative-block--${block.kind}`, { 'narrative-block--speaker-start': showSpeaker }]"
    :data-speaker-source="block.speakerSource || undefined"
  >
    <span v-if="showSpeaker" class="narrative-block__speaker">{{ block.speaker }}</span>
    <span class="narrative-block__text" v-html="renderContent(block)"></span>
  </div>
</template>
