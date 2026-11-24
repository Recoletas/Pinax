<script setup>
import WorldClockPicker from './WorldClockPicker.vue'
import WorldKnowledgeSourceFields from './WorldKnowledgeSourceFields.vue'
import { ref } from 'vue'
import { tr } from '../../i18n'
import { sceneStoryAt } from '../../services/agents/authoring/authoringSceneAnchors.js'

const props = defineProps({
  events: { type: Array, required: true },
  channels: { type: Object, required: true },
  beliefs: { type: Object, required: true },
  book: { type: Object, required: true },
  calendars: { type: Array, default: () => [] },
  speakers: { type: Array, required: true },
  editable: Boolean
})
const emit = defineEmits(['correct', 'withdraw'])
const editing = ref('')
const removing = ref('')
const point = ref('')
const clock = ref(null)
function clockLabel(value) {
  const calendar = props.calendars.find(row => row.id === value.timelineId)
  return [calendar?.label || value.timelineId, calendar?.eras.find(row => row.id === value.eraId)?.label || value.eraId].join(' · ')
}
const choice = ref('')
const speakerKey = ref('')
const position = ref()
function edit(event) {
  removing.value = ''
  speakerKey.value = event.speaker?.entityRef ?? ''
  position.value = undefined
  clock.value = event.storyClock ?? null
  editing.value = event.id
  point.value = String(event.storyAt ?? '')
  choice.value = event.kind === 'known' ? event.channel : event.belief
}
function save(event) {
  if (!props.editable || editing.value !== event.id) return
  const storyAt = sceneStoryAt(point.value)
  if (point.value !== '' && storyAt == null) return
  emit('correct', { supersedesEventId: event.id, factVersionId: event.factVersionId, sourceRef: event.sourceRef,
    ...(choice.value === 'heard' && speakerKey.value !== (event.speaker?.entityRef ?? '') ? { speakerKey: speakerKey.value } : {}),
    ...(position.value !== undefined ? { originPosition: position.value } : {}),
    ...(clock.value ? { storyClock: clock.value } : {}), kind: event.kind, storyAt, channel: event.kind === 'known' ? choice.value : event.channel,
    belief: event.kind === 'known' ? null : choice.value })
}
</script>

<template>
  <details>
    <summary>{{ tr('获知与态度记录') }} ({{ events.length }})</summary>
    <ol>
      <li v-for="event in events" :key="event.id">
        <span v-if="event.storyClock">{{ clockLabel(event.storyClock) }} · </span>
        {{ event.storyAt == null ? tr('日期未定') : tr('故事序号') + ' ' + event.storyAt }} ·
        {{ tr(event.kind === 'known' ? channels[event.channel] : beliefs[event.belief]) }}
        <span v-if="event.speaker"> · {{ event.speaker.label }}</span>
        <blockquote v-if="event.passage?.quote">{{ event.passage.quote }}</blockquote>
        <span v-if="event.sourceRef"> · {{ event.sourceRef }}</span>
        <button v-if="editable && editing !== event.id" type="button" @click="edit(event)">{{ tr('更正此条记录') }}</button>
        <button v-if="editable && removing !== event.id" type="button" @click="removing = event.id; editing = ''">{{ tr('撤下此条记录') }}</button>
        <div v-if="editable && removing === event.id" class="world-fields">
          <button type="button" @click="emit('withdraw', event.id)">{{ tr('确认撤下此条经历') }}</button>
          <button type="button" @click="removing = ''">{{ tr('取消') }}</button>
        </div>
        <form v-if="editable && editing === event.id" class="world-form" @submit.prevent="save(event)">
          <WorldClockPicker v-model="clock" :calendars="calendars" />
          <label>{{ tr('发生的故事时点') }}<input v-model="point" type="number" step="1" /></label>
          <label>{{ tr(event.kind === 'known' ? '获知途径' : '人物态度') }}
            <select v-model="choice"><option v-for="(name, key) in (event.kind === 'known' ? channels : beliefs)" :key="key" :value="key">{{ tr(name) }}</option></select>
          </label>
          <WorldKnowledgeSourceFields v-model:speaker-key="speakerKey" v-model:position="position" :book="book"
            :speakers="speakers" :heard="event.kind === 'known' && choice === 'heard'" :original="event" />
          <button type="submit">{{ tr('保存更正') }}</button>
          <button type="button" @click="editing = ''">{{ tr('取消') }}</button>
        </form>
      </li>
    </ol>
  </details>
</template>
