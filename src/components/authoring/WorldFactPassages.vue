<script setup>
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { liveQuery } from 'dexie'
import { openLedgerDb, withLedgerDb } from '../../services/memory/ledger/ledgerDb'
import { currentWorldPassageTarget, listWorldFactPassages } from '../../services/memory/ledger/worldModelWorkspace'

const props = defineProps({ book: Object, worldbookId: String, scope: Object, factVersionId: String, recordedSeq: { type: Number, default: null }, disabled: Boolean })
const emit = defineEmits(['locate'])
const rows = shallowRef([])
const loading = ref(true)
const notice = ref('')
let generation = 0
const kinds = { 'constraint-end': '创作约束终点', 'fact-source': '作者认定事实的依据', 'knowledge-source': '获知出处', 'belief-source': '态度出处', 'narrator-assertion': '叙述者断言', 'reported-speech': '人物引述', 'assertion-use': '事实依赖', 'belief-use': '人物信念', 'constraint-use': '创作约束' }
function request(book) {
  return { scope: props.scope, recordedSeq: props.recordedSeq, book, worldbookId: props.worldbookId, factVersionId: props.factVersionId }
}
watch([() => props.book, () => props.scope, () => props.worldbookId, () => props.factVersionId, () => props.recordedSeq], async (_, __, cleanup) => {
  const run = ++generation
  rows.value = []; notice.value = ''; loading.value = true
  let db, subscription
  cleanup(() => { subscription?.unsubscribe(); db?.close() })
  const opened = await openLedgerDb({ openTimeoutMs: 1500 })
  if (run !== generation) { opened.db?.close(); return }
  if (!opened.ok) { loading.value = false; notice.value = '无法读取设定原文'; return }
  db = opened.db
  const input = request(props.book)
  subscription = liveQuery(() => listWorldFactPassages(db, input)).subscribe({
    next(result) {
      if (run !== generation) return
      loading.value = false; rows.value = result.items || []; notice.value = result.ok ? '' : '设定记录已变化'
    },
    error() {
      if (run !== generation) return
      loading.value = false; rows.value = []; notice.value = '无法读取设定原文'
    }
  })
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { generation++ })
async function locate(row) {
  const run = generation
  try {
    const result = await withLedgerDb(db => listWorldFactPassages(db, request(props.book)), { openTimeoutMs: 1500 })
    if (run !== generation) return
    const current = result.items?.find(item => item.id === row.id)
    const target = currentWorldPassageTarget({ bookId: props.book.id, worldbookId: props.worldbookId }, current)
    if (target && !props.disabled) emit('locate', target)
    else notice.value = '原文已变化，请在用稿检查中核对。'
  } catch {
    if (run === generation) notice.value = '无法读取设定原文'
  }
}
</script>

<template>
  <div class="event-passages">
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-else-if="loading">正在查找关联原文…</p>
    <p v-else-if="!rows.length">此版本尚无已登记的关联原文。</p>
    <ul v-if="rows.length">
      <li v-for="row in rows" :key="row.id">
        <small>{{ row.chapterTitle || '原章节已移除' }} · {{ row.actorLabel || '' }}{{ kinds[row.kind] }}{{ row.speaker ? ' · 说话人 ' + row.speaker.label : '' }}{{ row.historical ? ' · 旧版说法' : '' }}</small>
        <button v-if="row.target" type="button" :disabled="disabled" @click="locate(row)">{{ row.quote.slice(0, 120) }}</button>
        <span v-else>{{ row.quote.slice(0, 120) }} · 原文待核对</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.event-passages { border-inline-start: 2px solid var(--border); padding-inline-start: .55rem; }
ul { list-style: none; margin: 0; padding: 0; }
li { display: grid; gap: .15rem; margin-block: .3rem; }
p, small, span { color: var(--text-secondary); font-size: 12px; margin: 0; }
button { font: inherit; text-align: start; color: var(--text-primary); background: transparent; border: 0; padding: .15rem 0; cursor: pointer; overflow-wrap: anywhere; }
button:hover { text-decoration: underline; }
</style>
