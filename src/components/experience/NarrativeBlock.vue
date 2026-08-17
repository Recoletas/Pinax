<script setup>
// U4：只消费 tone/组属性输出 class 与 data；正文结构不增加气泡容器。
defineProps({
  block: { type: Object, required: true },
  showSpeaker: { type: Boolean, default: false },
  speakerTone: { type: String, default: 'neutral' },
  speakerGroupStart: { type: Boolean, default: false },
  speakerGroupEnd: { type: Boolean, default: false },
  renderContent: { type: Function, required: true }
})
</script>

<template>
  <div
    class="narrative-block"
    :class="[
      `narrative-block--${block.kind}`,
      `narrative-tone--${speakerTone}`,
      {
        'narrative-block--speaker-start': showSpeaker,
        'narrative-block--group-start': speakerGroupStart,
        'narrative-block--group-end': speakerGroupEnd
      }
    ]"
    :data-speaker-source="block.speakerSource || undefined"
    :data-speaker-tone="speakerTone !== 'neutral' ? speakerTone : undefined"
  >
    <span v-if="showSpeaker" class="narrative-block__speaker">{{ block.speaker }}</span>
    <span class="narrative-block__text" v-html="renderContent(block)"></span>
  </div>
</template>
