<script setup>
import { computed } from 'vue'
import { tr } from '../../i18n'
import { worldManuscriptUnits } from '../../services/memory/ledger/worldModelWorkspace'

const props = defineProps({ book: { type: Object, required: true }, keepOriginal: Boolean, chapterLabel: { type: String, default: '出处章节' }, unitLabel: { type: String, default: '出处段落' }, emptyLabel: { type: String, default: '不关联原文' } })
const position = defineModel()
const chapter = computed(() => props.book.chapters?.find(row => row.id === position.value?.chapterId))
const units = computed(() => chapter.value ? worldManuscriptUnits(chapter.value) : [])
function chapterChanged(id) {
  position.value = id ? { chapterId: id, unitId: '' } : null
}
</script>

<template>
  <label>{{ tr(chapterLabel) }}
    <select :value="position?.chapterId || ''" @change="chapterChanged($event.target.value)">
      <option value="">{{ tr(keepOriginal && position === undefined ? '保留登记原文' : emptyLabel) }}</option>
      <option v-for="row in book.chapters" :value="row.id" :key="row.id">{{ row.title || row.id }}</option>
    </select>
  </label>
  <label v-if="chapter">{{ tr(unitLabel) }}
    <select :value="position.unitId" required @change="position = { chapterId: chapter.id, unitId: $event.target.value }">
      <option value="" disabled>{{ tr('选择段落') }}</option>
      <option v-for="(row, i) in units" :value="row.unitId" :key="row.unitId">{{ i + 1 }} · {{ row.text.slice(0, 75) }}</option>
    </select>
  </label>
  <button v-if="keepOriginal && position === undefined" type="button" @click="position = null">{{ tr('移除登记的出处') }}</button>
</template>
