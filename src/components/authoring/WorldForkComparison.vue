<script setup>
import { ref, shallowRef, watch } from 'vue'
import { liveQuery } from 'dexie'
import { tr } from '../../i18n'
import { randomUUID } from '../../../shared/randomId.js'
import { adoptWorldForkFact } from '../../services/memory/ledger/factLedger'
import { loadWritingBooksSnapshot } from '../../services/writing/writingBooksRepository'
import { openLedgerDb, withLedgerDb } from '../../services/memory/ledger/ledgerDb'
import { readWorldFacts, previewWorldFactChange } from '../../services/memory/ledger/worldModelWorkspace'
import { worldClaimLabel } from '../../services/memory/ledger/worldClaimLabel'
import { compareWorldFactFork } from '@pinax/core/memory/ledger/worldForkComparison'
import WorldClockPicker from './WorldClockPicker.vue'

const props = defineProps({ scope: { type: Object, required: true } })
const day = ref('')
const clock = ref(null)
const result = shallowRef(null)
const calendars = shallowRef([])
const error = ref('')
const review = shallowRef(null)
const impact = shallowRef([])
const pending = ref(false)
const message = ref('')
let reviewId = 0
function cancel() { reviewId++; review.value = null; impact.value = []; pending.value = false }
async function begin(row, baseline) {
  cancel()
  const id = reviewId
  message.value = ''
  review.value = { row, commandId: randomUUID() }
  if (!baseline) return
  pending.value = true
  try {
    const book = loadWritingBooksSnapshot().find(book => book.id === props.scope.bookId)
    const result = await withLedgerDb(db => previewWorldFactChange(db, { scope: { domain: 'book', bookId: props.scope.bookId }, book, factVersionId: baseline.factVersionId }))
    if (id !== reviewId) return
    if (!result.ok) { cancel(); message.value = tr('正史已变化，请回到作品正史核对。'); return }
    impact.value = result.items
  } catch { if (id === reviewId) { cancel(); message.value = tr('无法读取正史用稿依赖。') } }
  finally { if (id === reviewId) pending.value = false }
}
async function adopt() {
  if (!review.value || pending.value) return
  const id = reviewId
  const { row, commandId } = review.value
  pending.value = true
  try {
    const saved = await withLedgerDb(db => adoptWorldForkFact(db, { scope: props.scope, commandId, factVersionId: row.factVersionId }))
    if (id !== reviewId) return
    const reasons = { 'fork-parent-changed': '分叉之后这条正史已有改动，请回到作品正史核对。', 'fact-version-changed': '试写版本已变化，请重新选择。',
      'fork-calendar-mismatch': '两边的历法或纪元顺序不同，请先核对。', 'no-change': '这条事实与正史相同。' }
    message.value = saved.ok ? tr('已采纳到作品正史，保留了分支版本出处。') : tr(reasons[saved.reason] || saved.reason)
    if (saved.ok) cancel()
  } catch { if (id === reviewId) message.value = tr('采纳失败，可以重试。') }
  finally { if (id === reviewId) pending.value = false }
}
watch([() => props.scope, day, clock], () => { cancel(); message.value = '' })
const sides = [{ rows: 'baseline', clocks: 'baselineClocks', label: '分叉时' }, { rows: 'branch', clocks: 'branchClocks', label: '试写分支' }]
const kinds = { added: '新增', removed: '移除', changed: '更改' }
function period(interval, clocks) {
  if (!interval) return tr('日期未定')
  const cal = clocks.find(row => row.id === interval.timelineId)
  function point(value) {
    if (!value) return tr('未知')
    const era = cal?.eras.find(row => row.id === value.eraId)
    return [cal?.label || interval.timelineId, era?.label || value.eraId, value.ordinal ?? tr('序号未定')].join(' · ')
  }
  if (interval.endBy) return tr('起于 {start}，最迟在 {end} 时已结束，具体终点未定', { start: point(interval.start), end: point(interval.endBy) })
  return [tr('起于 {point}', { point: point(interval.start) }), interval.endSemantic === 'exclusive' ?
    tr('止于 {point} 之前', { point: point(interval.end) }) : tr(interval.endSemantic === 'open' ? '持续有效' : '终点未知')].join('，')
}
watch([() => props.scope, day, clock], async ([scope, value, storyClock], _, cleanup) => {
  let active = true
  let db, subscription
  cleanup(() => { active = false; subscription?.unsubscribe(); db?.close() })
  result.value = null; error.value = ''
  const storyAt = value === '' ? null : Number(value)
  if (storyAt !== null && !Number.isSafeInteger(storyAt)) { error.value = tr('请填写整数故事序号。'); return }
  const opened = await openLedgerDb({ openTimeoutMs: 1500 })
  if (!active) { opened.db?.close(); return }
  if (!opened.ok) { error.value = tr('暂时无法读取分支对照。'); return }
  db = opened.db
  subscription = liveQuery(() => compareWorldFactFork(db, { scope, storyAt, storyClock }, readWorldFacts)).subscribe({
    next(data) {
      if (!active) return
      if (data.ok) { result.value = data; calendars.value = data.branchClocks; error.value = '' }
      else error.value = data.reason
    },
    error() { if (active) error.value = tr('暂时无法读取分支对照。') }
  })
}, { immediate: true })
</script>

<template>
  <section :aria-label="tr('分叉点对照')" class="comparison">
    <WorldClockPicker v-model="clock" :calendars="calendars" />
    <label>{{ tr('对照故事时点') }} <input v-model="day" type="number" step="1" :placeholder="tr('留空查看最近状态')" /></label>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!result">{{ tr('读取中…') }}</p>
    <template v-else>
      <p v-if="result.baselineUnknown || result.branchUnknown">{{ tr('日期不足以判定的事实版本：分叉时 {base} 条，分支 {branch} 条。', { base: result.baselineUnknown, branch: result.branchUnknown }) }}</p>
      <p v-if="!result.items.length">{{ tr('此视图与分叉时的正式事实一致。') }}</p>
      <article v-for="change in result.items" :key="change.factKey">
        <strong>{{ tr(kinds[change.kind]) }}</strong>
        <div v-for="side in sides" :key="side.rows">
          <span>{{ tr(side.label) }}</span>
          <span v-if="!change[side.rows].length">{{ tr('未查到成立的版本') }}</span>
          <p v-for="row in change[side.rows]" :key="row.factVersionId">
            {{ worldClaimLabel(row) }} <small>{{ period(row.validInterval, result[side.clocks]) }}</small>
            <small v-if="side.rows === 'branch' && result.adopted.includes(row.factVersionId)">{{ tr('此版本曾采纳到正史') }}</small>
            <button v-else-if="side.rows === 'branch' && !row.supersedesKind && review?.row.factVersionId !== row.factVersionId"
              type="button" @click="begin(row, change.baseline[0])">{{ tr('核对并采纳到正史') }}</button>
          </p>
        </div>
        <div v-if="review && change.branch.some(row => row.factVersionId === review.row.factVersionId)">
          <p>{{ tr('将选中的事实版本写入作品正史。') }} {{ worldClaimLabel(review.row) }}</p>
          <p v-for="use in impact" :key="use.id">{{ tr('依赖此设定的原文') }} · {{ use.quote }}</p>
          <button type="button" :disabled="pending" @click="adopt">{{ tr('确认采纳此版本') }}</button>
          <button type="button" :disabled="pending" @click="cancel">{{ tr('取消') }}</button>
        </div>
      </article>
    </template>
  </section>
</template>

<style scoped>
.comparison { margin-block: .75rem; }
article { padding-block: .6rem; border-block-start: 1px solid var(--border); }
article div { display: flex; flex-wrap: wrap; gap: .5rem; align-items: baseline; }
article p { margin: 0; overflow-wrap: anywhere; }
small, article div > span { color: var(--text-secondary); }
</style>
