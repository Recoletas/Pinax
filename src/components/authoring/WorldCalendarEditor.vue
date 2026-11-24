<script setup>
import { computed, ref } from 'vue'
import { tr } from '../../i18n'
import { randomUUID } from '../../../shared/randomId.js'

const props = defineProps({ calendars: { type: Array, required: true }, busy: Boolean })
const emit = defineEmits(['save'])
const existing = computed(() => props.calendars.filter(row => row.id !== 'default'))
const revisionId = ref(null)
const calendarId = ref('')
const name = ref('')
const eras = ref([])
const ready = computed(() => name.value.trim() && eras.value.length && eras.value.every(row => row.label.trim()))
function start(id) {
  const row = existing.value.find(row => row.id === id)
  calendarId.value = row?.id ?? randomUUID()
  revisionId.value = row?.revisionId ?? null
  name.value = row?.label ?? ''
  eras.value = row ? row.eras.map(({ id, label }) => ({ id, label })) : [{ id: randomUUID(), label: '' }]
}
function shift(index, step) {
  const destination = index + step
  if (destination < 0 || destination >= eras.value.length) return
  const [era] = eras.value.splice(index, 1)
  eras.value.splice(destination, 0, era)
}
function submit() {
  if (!ready.value || props.busy) return
  emit('save', { expectedRevisionId: revisionId.value, calendar: {
    id: calendarId.value, label: name.value.trim(), eras: eras.value.map(({ id, label }, order) => ({ id, label: label.trim(), order }))
  } })
}
</script>

<template>
  <div class="world-form">
    <div class="world-actions">
      <button type="button" @click="start()">{{ tr('新建历法') }}</button>
      <button v-for="row in existing" :key="row.id" type="button" @click="start(row.id)">{{ row.label }}</button>
    </div>
    <form v-if="calendarId" class="world-form" @submit.prevent="submit">
      <label>{{ tr('历法名称') }}<input v-model="name" required /></label>
      <div v-for="(era, i) in eras" :key="era.id" class="world-fields">
        <label>{{ tr('纪元名称') }}<input v-model="era.label" required /></label>
        <div class="world-actions">
          <button type="button" :disabled="!i" @click="shift(i, -1)">{{ tr('提前') }}</button>
          <button type="button" :disabled="i === eras.length - 1" @click="shift(i, 1)">{{ tr('推后') }}</button>
          <button type="button" :disabled="eras.length < 2" @click="eras.splice(i, 1)">{{ tr('移除纪元') }}</button>
        </div>
      </div>
      <div class="world-actions">
        <button type="button" @click="eras.push({ id: randomUUID(), label: '' })">{{ tr('添加纪元') }}</button>
        <button type="submit" :disabled="busy || !ready">{{ tr('保存历法') }}</button>
      </div>
    </form>
  </div>
</template>
