<script setup>
import { computed, ref } from 'vue'
import { worldManuscriptUnits } from '../../services/memory/ledger/worldModelWorkspace'
import { tr } from '../../i18n'

const props = defineProps({ book: { type: Object, required: true }, row: { type: Object, required: true }, busy: Boolean })
const emit = defineEmits(['move'])
const open = ref(false)
const chapterId = ref('')
const unitId = ref('')
const units = computed(() => {
  const chapter = props.book.chapters.find(ch => ch.id === chapterId.value)
  return chapter ? worldManuscriptUnits(chapter) : []
})
const destination = computed(() => units.value.find(row => row.unitId === unitId.value))
</script>

<template>
  <button v-if="!open" type="button" @click="open = true">{{ tr('重新定位揭示') }}</button>
  <form v-else class="world-form" @submit.prevent="destination && emit('move', { disclosureId: row.id, book, chapterId, unitId })">
    <p>{{ tr('原句') }} · {{ row.quote }}</p>
    <label>{{ tr('揭示的新章节') }}<select v-model="chapterId" required @change="unitId = ''">
      <option value="">{{ tr('选择章节') }}</option>
      <option v-for="(chapter, i) in book.chapters" :key="chapter.id" :value="chapter.id">{{ chapter.title || tr('第 {count} 章', { count: i + 1 }) }}</option>
    </select></label>
    <label>{{ tr('揭示的新段落') }}<select v-model="unitId" required>
      <option value="">{{ tr('选择段落') }}</option>
      <option v-for="(unit, i) in units" :key="unit.unitId" :value="unit.unitId">{{ i + 1 }} · {{ unit.text.slice(0, 80) }}</option>
    </select></label>
    <p v-if="destination">{{ destination.text }}</p>
    <button type="submit" :disabled="busy || !destination">{{ tr('确认揭示的新位置') }}</button>
    <button type="button" @click="open = false">{{ tr('取消') }}</button>
  </form>
</template>
