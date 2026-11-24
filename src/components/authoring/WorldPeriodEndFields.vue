<script setup>
import { computed } from 'vue'
import { tr } from '../../i18n'

const props = defineProps({ calendar: Object, eraId: String })
const value = defineModel()
const unknown = computed({
  get: () => value.value?.kind === 'unknown',
  set: checked => { value.value = checked ? { kind: 'unknown' } : null }
})
function setDay(event) {
  const day = event.target.value
  value.value = day === '' ? { kind: 'unknown' } : { kind: 'unknown', by: { eraId: value.value?.by?.eraId || props.eraId || 'default', ordinal: Number(day) } }
}
</script>

<template>
  <label><span><input v-model="unknown" type="checkbox" /> {{ tr('只确认起点，结束日期不确定') }}</span></label>
  <div v-if="unknown" class="world-fields">
    <label>{{ tr('最迟何时已结束（可留空）') }}<input type="number" step="1" :value="value.by?.ordinal ?? ''" @input="setDay" /></label>
    <label v-if="value.by && calendar?.eras.length > 1">{{ tr('最迟结束的纪元') }}
      <select :value="value.by.eraId" @change="value = { kind: 'unknown', by: { ...value.by, eraId: $event.target.value } }">
        <option v-for="era in calendar.eras" :key="era.id" :value="era.id">{{ era.label }}</option>
      </select>
    </label>
  </div>
</template>
