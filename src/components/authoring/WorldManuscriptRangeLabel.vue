<script setup>
import { tr } from '../../i18n'
import { worldManuscriptUnits } from '../../services/memory/ledger/worldModelWorkspace'
const props = defineProps({ book: Object, edition: Object, row: Object })
function label(anchor) {
  const chapter = props.edition
    ? props.edition.chapters.find(item => item.chapterId === anchor.chapterId)
    : props.book.chapters.find(item => item.id === anchor.chapterId)
  if (!chapter) return tr('原章节已移除')
  const units = props.edition ? chapter.units : worldManuscriptUnits(chapter)
  const index = units.findIndex(unit => unit.unitId === anchor.unitId)
  return (chapter.title || anchor.chapterId) + ' · ' + (index < 0 ? tr('原段落已移除') : tr('第 {count} 段', { count: index + 1 }))
}
</script>
<template><small>{{ tr('约束范围') }} · {{ label(row.rangeStart) }} — {{ label(row.rangeEnd) }}</small></template>
