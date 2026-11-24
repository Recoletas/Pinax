<script setup>
import { computed } from 'vue'
import { tr } from '../../i18n'

const props = defineProps({ calendars: { type: Array, required: true } })
const clock = defineModel()
const calendar = computed(() => props.calendars.find(row => row.id === (clock.value?.timelineId || 'default')))
function selectCalendar(id) {
  const chosen = props.calendars.find(row => row.id === id)
  if (chosen) clock.value = { timelineId: id, eraId: chosen.eras[0].id }
}
</script>

<template>
  <div v-if="calendars.length > 1" class="world-fields">
    <label>{{ tr('使用历法') }}<select :aria-label="tr('使用历法')" :value="clock?.timelineId || 'default'" @change="selectCalendar($event.target.value)">
      <option v-for="row in calendars" :key="row.id" :value="row.id">{{ row.label }}</option>
    </select></label>
    <label v-if="calendar && calendar.id !== 'default'">{{ tr('纪元') }}<select :aria-label="tr('纪元')" :value="clock?.eraId"
      @change="clock = { timelineId: calendar.id, eraId: $event.target.value }">
      <option v-for="era in calendar.eras" :key="era.id" :value="era.id">{{ era.label }}</option>
    </select></label>
  </div>
</template>
