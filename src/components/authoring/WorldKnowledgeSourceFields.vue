<script setup>
import { computed } from 'vue'
import { tr } from '../../i18n'
import WorldPassageSourceFields from './WorldPassageSourceFields.vue'

const props = defineProps({
  book: { type: Object, required: true },
  speakers: { type: Array, required: true },
  heard: Boolean,
  original: { type: Object, default: null }
})
const speakerKey = defineModel('speakerKey')
const position = defineModel('position')
const missingSpeaker = computed(() => props.original?.speaker && !props.speakers.some(row => row.key === props.original.speaker.entityRef))
</script>

<template>
  <label v-if="heard">{{ tr('听谁说的') }}
    <select v-model="speakerKey">
      <option value="">{{ tr('消息来源未注明') }}</option>
      <option v-if="missingSpeaker" :value="original.speaker.entityRef">{{ original.speaker.label }}</option>
      <option v-for="person in speakers" :value="person.key" :key="person.key">{{ person.label }}</option>
    </select>
  </label>
  <WorldPassageSourceFields v-model="position" :book="book" :keep-original="Boolean(original?.passage)" />
</template>
