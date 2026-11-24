<script setup>
import { ref, watch } from 'vue'
import { tr } from '../../i18n'

const props = defineProps({ type: { type: String, required: true }, initial: Object })
const emit = defineEmits(['change'])
const number = ref(props.initial?.value ?? '')
const unit = ref(props.initial?.unit ?? '')
const truth = ref(props.initial?.value === true)
watch([number, unit, truth], () => {
  if (props.type === 'boolean') emit('change', { type: 'boolean', value: truth.value })
  else {
    const parsed = number.value === '' ? NaN : Number(number.value)
    emit('change', Number.isFinite(parsed) && Math.abs(parsed) <= Number.MAX_SAFE_INTEGER
      ? { type: 'number', value: parsed, ...(unit.value.trim() ? { unit: unit.value.trim() } : {}) } : null)
  }
}, { immediate: true })
</script>

<template>
  <template v-if="type === 'number'">
    <label>{{ tr('数值') }}<input v-model="number" type="number" step="any" required /></label>
    <label>{{ tr('单位（可留空）') }}<input v-model="unit" :placeholder="tr('例如岁、枚')" /></label>
  </template>
  <label v-else>{{ tr('布尔值') }}
    <select v-model="truth"><option :value="true">{{ tr('是') }}</option><option :value="false">{{ tr('否') }}</option></select>
  </label>
</template>
