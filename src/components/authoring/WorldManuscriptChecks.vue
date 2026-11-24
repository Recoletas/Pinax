<script setup>
import WorldManuscriptRangeLabel from './WorldManuscriptRangeLabel.vue'
import WorldDisclosurePosition from './WorldDisclosurePosition.vue'
import { worldClaimLabel } from '../../services/memory/ledger/worldClaimLabel.js'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { tr } from '../../i18n'
import { withLedgerDb } from '../../services/memory/ledger/ledgerDb'
import { listWorldAnchorIssues, listWorldBeliefUseIssues, previewWorldFactChange } from '../../services/memory/ledger/worldModelWorkspace'

const props = defineProps({
  scope: { type: Object, required: true }, book: { type: Object, required: true },
  statements: { type: Array, required: true }, revision: Number
})
const emit = defineEmits(['archive', 'locate', 'retire', 'move'])
const mode = ref('')
const facts = computed(() => props.statements.filter(item => item.factVersionId))
const factVersionId = ref('')
const rows = shallowRef([])
const reading = ref(false)
const error = ref('')
let generation = 0
function toggle(value) { mode.value = mode.value === value ? '' : value }
function chapterName(id) {
  const index = props.book.chapters.findIndex(ch => ch.id === id)
  if (index < 0) return tr('原章节已移除')
  return props.book.chapters[index].title || tr('第 {count} 章', { count: index + 1 })
}
watch([mode, factVersionId, () => props.revision, () => props.book], async () => {
  const run = ++generation
  rows.value = []
  error.value = ''
  reading.value = false
  if (!mode.value) return
  const impact = mode.value === 'impact'
  if (impact && !facts.value.some(row => row.factVersionId === factVersionId.value)) {
    factVersionId.value = ''
    return
  }
  reading.value = true
  try {
    const query = { impact: previewWorldFactChange, beliefs: listWorldBeliefUseIssues, issues: listWorldAnchorIssues }[mode.value]
    const input = { scope: props.scope, book: props.book, factVersionId: factVersionId.value }
    const response = await withLedgerDb(db => query(db, input), { openTimeoutMs: 1500 })
    if (run !== generation) return
    if (!response.ok) throw new Error(response.detail || response.reason || tr('读取失败'))
    rows.value = response.items
  } catch (cause) {
    if (run === generation) error.value = cause.message
  } finally {
    if (run === generation) reading.value = false
  }
})
onBeforeUnmount(() => { generation++ })
</script>

<template>
  <div class="world-checks">
    <div class="checks-actions">
      <button type="button" :aria-expanded="mode === 'impact'" @click="toggle('impact')">{{ tr('预览改设定的影响') }}</button>
      <button type="button" :aria-expanded="mode === 'beliefs'" @click="toggle('beliefs')">{{ tr('检查人物行动依据') }}</button>
      <button type="button" :aria-expanded="mode === 'issues'" @click="toggle('issues')">{{ tr('失效的稿面关联') }}</button>
    </div>
    <template v-if="mode">
      <label v-if="mode === 'impact'">{{ tr('准备更改的事实') }}
        <select v-model="factVersionId"><option value="">{{ tr('选择正式事实') }}</option>
          <option v-for="row in facts" :key="row.factVersionId" :value="row.factVersionId">{{ worldClaimLabel(row) }}</option>
        </select>
      </label>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-else-if="reading">{{ tr('加载中…') }}</p>
      <ul v-else-if="rows.length" :aria-label="tr({ impact: '受影响的段落', beliefs: '人物行动待核对', issues: '失效的稿面关联' }[mode])">
        <li v-for="row in rows" :key="row.id">
          <span>{{ chapterName(row.chapterId) }} · {{ row.quote?.slice(0, 120) || row.unitId }}</span>
          <WorldManuscriptRangeLabel v-if="row.rangeEnd" :row="row" :book="book" />
          <template v-if="mode === 'impact'">
            <small>{{ tr(row.kind === 'assertion-use' ? '叙述依赖事实' : '创作约束') }} · {{ tr(row.needsReview ? '设定已变化，待核对' : '已登记') }}</small>
            <button v-if="book.chapters.some(ch => ch.id === row.chapterId)" type="button" @click="emit('locate', row)">{{ tr('定位段落') }}</button>
          </template>
          <template v-else-if="mode === 'beliefs'">
            <small>{{ row.beliefUse.actorLabel }} · {{ tr('故事序号') }} {{ row.beliefUse.storyAt }} ·
              {{ tr({ incomparable: '历法未能对齐', 'date-unknown': '认知变化的日期待核对', unaware: '当时尚未知情', forgotten: '当时已经遗忘', 'knowledge-changed': '消息来源或态度已变化' }[row.knowledgeIssue]) }}</small>
            <button type="button" @click="emit('locate', row)">{{ tr('定位段落') }}</button>
            <button type="button" @click="emit('retire', row)">{{ tr('撤下这条行动依据') }}</button>
          </template>
          <template v-else>
            <small>{{ worldClaimLabel(row) }} · {{ tr(['narrator-assertion', 'reported-speech'].includes(row.kind) ? '读者揭示' : '稿面依赖') }}</small>
            <small v-if="row.speaker">{{ tr('说话人') }} · {{ row.speaker.label }}</small>
            <WorldDisclosurePosition v-if="['narrator-assertion', 'reported-speech'].includes(row.kind)" :book="book" :row="row" @move="input => emit('move', input)" />
            <button type="button" @click="emit('archive', row)">{{ tr('撤下旧关联') }}</button>
          </template>
        </li>
      </ul>
      <p v-else-if="mode === 'issues'">{{ tr('没有失效的稿面关联。') }}</p>
      <p v-else-if="mode === 'beliefs'">{{ tr('已绑定人物与时点的行动依据均无待核对项。') }}</p>
      <p v-else-if="factVersionId">{{ tr('本书尚无依赖这一事实版本的段落。') }}</p>
    </template>
  </div>
</template>

<style scoped>
.world-checks { display: grid; gap: .4rem; min-width: 0; }
.checks-actions { display: flex; flex-wrap: wrap; gap: .4rem; }
.world-checks ul { list-style: none; padding: 0; margin: 0; }
.world-checks li { display: grid; gap: .25rem; padding: .45rem 0; overflow-wrap: anywhere; border-bottom: 1px solid var(--border); }
.world-checks small, .world-checks p { color: var(--text-secondary); margin: 0; }
</style>
