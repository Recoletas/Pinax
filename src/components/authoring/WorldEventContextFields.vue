<script setup>
import { computed } from 'vue'
import { tr } from '../../i18n'

const props = defineProps({ entities: { type: Array, required: true } })
const context = defineModel({ type: Object, required: true })
const locations = computed(() => props.entities.filter(entity => entity.type === 'location'))
function setRows(field, rows) {
  context.value = { ...context.value, [field]: rows }
}
function remove(field, index) {
  setRows(field, context.value[field].filter((_, i) => i !== index))
}
function update(field, index, row) {
  setRows(field, context.value[field].map((value, i) => i === index ? row : value))
}
</script>

<template>
  <div class="event-context">
    <div v-for="(place, i) in context.placeRefs" :key="i" class="event-row">
      <label>{{ tr('事件发生地') }}
        <select :value="place" required @change="update('placeRefs', i, $event.target.value)">
          <option value="" disabled>{{ tr('选择地点') }}</option>
          <option v-for="entry in locations" :key="entry.key" :value="entry.key">{{ entry.label }}</option>
        </select>
      </label>
      <button type="button" @click="remove('placeRefs', i)">{{ tr('移除地点') }}</button>
    </div>
    <div v-for="(person, i) in context.participants" :key="i" class="event-row">
      <label>{{ tr('事件参与者') }}
        <select :value="person.entityRef" required @change="update('participants', i, { ...person, entityRef: $event.target.value })">
          <option value="" disabled>{{ tr('选择条目') }}</option>
          <option v-for="entry in entities" :key="entry.key" :value="entry.key">{{ entry.label }}</option>
        </select>
      </label>
      <label>{{ tr('在事件中的角色') }}
        <input :value="person.role" required :placeholder="tr('例如交付人、收件人')" @input="update('participants', i, { ...person, role: $event.target.value })" />
      </label>
      <button type="button" @click="remove('participants', i)">{{ tr('移除参与者') }}</button>
    </div>
    <div class="event-actions">
      <button v-if="locations.length" type="button" @click="setRows('placeRefs', [...context.placeRefs, ''])">{{ tr('添加发生地') }}</button>
      <button v-if="entities.length" type="button" @click="setRows('participants', [...context.participants, { entityRef: '', role: '' }])">{{ tr('添加参与者') }}</button>
    </div>
  </div>
</template>

<style scoped>
.event-context { display: grid; gap: .45rem; }
.event-actions, .event-row { display: flex; flex-wrap: wrap; align-items: end; gap: .45rem; }
.event-row label { flex: 1 1 8rem; min-width: 0; }
</style>
