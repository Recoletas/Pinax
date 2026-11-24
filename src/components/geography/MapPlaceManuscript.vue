<script setup>
import { worldClaimLabel } from '../../services/memory/ledger/worldClaimLabel.js'
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import WorldClockPicker from '../authoring/WorldClockPicker.vue'
import WorldFactPassages from '../authoring/WorldFactPassages.vue'
import { liveQuery } from 'dexie'
import { useComposableWorkspace } from '../../composables/useComposableWorkspace.js'
import { loadWritingBooks, subscribeWritingBooks } from '../../services/writing/writingBooksRepository.js'
import { settingContext } from '../../services/worldbook/settingContextModel.js'
import { settingUsage } from '../../services/worldbook/settingUsageModel.js'
import { openLedgerDb } from '../../services/memory/ledger/ledgerDb'
import { listWorldFactForks } from '../../services/memory/ledger/factLedger'
import { listWorldPlaceEvents } from '../../services/memory/ledger/worldModelWorkspace'
import { worldbookEntityKey } from '../../services/project/knowledgeReadModel/identity'

const props = defineProps({ bookId: String, worldbook: Object, entryId: String, disabled: Boolean })
const host = useComposableWorkspace()
const books = shallowRef(loadWritingBooks())
onBeforeUnmount(subscribeWritingBooks(() => { books.value = loadWritingBooks() }))
const book = computed(() => books.value.find(b => String(b.id) === props.bookId && b.worldbookId === props.worldbook?.id))
const entry = computed(() => props.worldbook?.entries?.find(e => e.id === props.entryId && e.type === 'location'))
const scenes = computed(() => settingContext({ book: book.value, entry: entry.value, worldbook: props.worldbook }).scenes)
const usage = computed(() => settingUsage(book.value, props.worldbook, entry.value))
const events = shallowRef([])
const forks = shallowRef([])
const branchId = shallowRef('')
const recordCut = shallowRef('')
const recordedSeq = computed(() => recordCut.value === '' ? null : Number(recordCut.value))
const invalidCut = computed(() => recordedSeq.value !== null && (!Number.isSafeInteger(recordedSeq.value) || recordedSeq.value < 0))
const storyDay = shallowRef('')
const storyAt = computed(() => storyDay.value === '' ? null : Number(storyDay.value))
const invalidDay = computed(() => storyAt.value !== null && !Number.isSafeInteger(storyAt.value))
const storyClock = shallowRef(null)
const calendars = shallowRef([])
const unknownCount = shallowRef(0)
const missingEra = shallowRef(false)
watch([() => branchId.value, () => book.value?.id], () => {
  recordCut.value = ''; storyDay.value = ''; storyClock.value = null; calendars.value = []
}, { flush: 'sync' })
watch([() => book.value?.id, () => props.worldbook?.id], () => { branchId.value = ''; recordCut.value = ''; forks.value = [] }, { flush: 'sync' })
const expandedEvent = shallowRef(null)
const eventError = shallowRef(false)
watch([() => book.value?.id, () => props.worldbook?.id, () => entry.value?.id, () => branchId.value, recordedSeq, storyAt, () => storyClock.value], async ([bookId, worldbookId, entryId, branch, cutoff, day, clock], _, cleanup) => {
  events.value = []
  expandedEvent.value = null
  eventError.value = false
  unknownCount.value = 0
  missingEra.value = false
  if (!bookId || !worldbookId || !entryId || invalidCut.value || invalidDay.value) return
  let active = true
  let db, subscription
  cleanup(() => { active = false; subscription?.unsubscribe(); db?.close() })
  const opened = await openLedgerDb({ openTimeoutMs: 1500 })
  if (!active) { opened.db?.close(); return }
  if (!opened.ok) { eventError.value = true; return }
  db = opened.db
  const scope = { domain: 'book', bookId }
  const placeRef = worldbookEntityKey(worldbookId, entryId)
  subscription = liveQuery(async () => {
    const available = await listWorldFactForks(db, { scope })
    if (!available.ok) throw new Error(available.reason)
    const selected = branch ? available.items.find(row => row.scope.branchId === branch)?.scope : scope
    const result = selected ? await listWorldPlaceEvents(db, { scope: selected, placeRef, recordedSeq: cutoff, storyAt: day, storyClock: clock }) : null
    return { available: available.items, result }
  }).subscribe({
    next({ available, result }) {
      if (!active) return
      forks.value = available
      if (!result) { branchId.value = ''; return }
      if (result.calendars) calendars.value = result.calendars
      missingEra.value = result.reason === 'timeline-era-invalid'
      unknownCount.value = result.unknownTimeCount || 0
      eventError.value = !result.ok; events.value = result.items || []
    },
    error() { if (active) { events.value = []; eventError.value = true } }
  })
}, { immediate: true, flush: 'sync' })
function eventParticipants(event) {
  const names = new Map((event.eventLabels || []).map(row => [row.entityRef, row.label]))
  return (event.eventContext?.participants || []).map(person => person.role + ' · ' + (names.get(person.entityRef) || person.entityRef)).join('，')
}
function eventTime(event) {
  const interval = event.validInterval
  if (!interval?.start) return '日期未定'
  const { eraId, ordinal } = interval.start
  const date = ordinal == null ? '具体时点未定' : '故事时点 ' + ordinal
  const start = interval.timelineId === 'default' && eraId === 'default' ? date : [event.calendarLabel || interval.timelineId, event.eraLabel || eraId, date].join(' · ')
  const end = interval.end
  if (!end || (!interval.eventSpan && eraId === end.eraId && end.ordinal === ordinal + 1)) return start
  const era = end.eraId === eraId ? '' : (event.endEraLabel || end.eraId) + ' · '
  return start + '，至 ' + era + '故事时点 ' + (end.ordinal ?? '未定') + ' 前'
}
function locate(hit) {
  host.openAt({ type: 'chapter', bookId: props.bookId, id: hit.chapterId, nodeId: hit.nodeId,
    start: hit.start, end: hit.end, matchText: hit.term }, 'main')
}
</script>

<template>
  <section v-if="book && entry && host" :key="entryId" class="manuscript">
    <label v-if="forks.length">事件设定版本 <select v-model="branchId" aria-label="事件设定版本">
      <option value="">作品正史</option>
      <option v-for="fork in forks" :key="fork.scope.branchId" :value="fork.scope.branchId">{{ fork.label }}</option>
    </select></label>
    <label>事件记录截至 <input v-model="recordCut" type="number" min="0" step="1" placeholder="最新记录" /></label>
    <label>事件发生的故事时点 <input v-model="storyDay" type="number" step="1" placeholder="全部日期" /></label>
    <WorldClockPicker v-if="storyDay !== ''" v-model="storyClock" :calendars="calendars" />
    <template v-if="events.length || eventError || branchId || storyDay !== '' || recordCut !== ''">
      <h4>地点关联事件</h4>
      <p v-if="invalidCut" role="status">记录序号须为大于或等于零的整数。</p>
      <p v-else-if="invalidDay" role="status">故事时点须为整数。</p>
      <p v-else-if="missingEra">该记录截面还没有所选历法或纪元。<button type="button" @click="storyClock = null">改用默认时间线</button></p>
      <p v-else-if="eventError">暂时无法读取本书的事件记录</p>
      <p v-else-if="storyDay !== '' && !events.length">此故事时点没有可确认在这里发生的事件。</p>
      <p v-else-if="!events.length">此记录截面在该地点尚无已确认的事件。</p>
      <ul v-else class="event-list"><li v-for="event in events" :key="event.id">
        <strong>{{ worldClaimLabel(event) }}</strong>
        <span>{{ eventTime(event) }}</span>
        <small v-if="event.oppositeClaimId">同次事件另有正式否定记录</small>
        <small v-if="event.eventContext?.placeRefs.includes(worldbookEntityKey(worldbook.id, entryId))">发生于此</small>
        <small v-if="event.eventContext?.participants.length">{{ eventParticipants(event) }}</small>
        <button type="button" :aria-expanded="expandedEvent === event.id" @click="expandedEvent = expandedEvent === event.id ? null : event.id">{{ expandedEvent === event.id ? '收起关联原文' : '查看关联原文' }}</button>
        <WorldFactPassages v-if="expandedEvent === event.id" :book="book" :worldbook-id="worldbook.id" :scope="event.scope" :fact-version-id="event.factVersionId" :recorded-seq="recordedSeq" :disabled="disabled" @locate="target => host.openAt(target, 'main')" />
      </li></ul>
      <p v-if="unknownCount">有 {{ unknownCount }} 条地点事件的日期未定或历法无法比较。</p>
    </template>
    <h4>发生于此</h4>
    <p v-if="!scenes.length">尚无已记录的场景</p>
    <div class="scene-list">
      <button v-for="scene in scenes" :key="scene.id" type="button" :disabled="disabled" @click="locate(scene)">
        <strong>{{ scene.chapterTitle }}</strong><span>{{ [scene.time, scene.term].filter(Boolean).join(' · ') }}</span>
      </button>
    </div>
    <details v-if="usage.hits.length"><summary>正文提及 · {{ usage.hits.length }}{{ usage.truncated ? '+' : '' }}</summary>
      <div class="scene-list"><button v-for="hit in usage.hits" :key="hit.chapterId + ':' + hit.nodeId + ':' + hit.start" type="button" :disabled="disabled" @click="locate(hit)">
        <strong>{{ hit.chapterTitle }}{{ hit.ambiguous ? ' · 同名待核对' : '' }}</strong><span>{{ hit.before }}{{ hit.term }}{{ hit.after }}</span>
      </button></div>
    </details>
  </section>
</template>

<style scoped>
.manuscript { padding-bottom: 10px; border-bottom: 1px solid var(--border); }
h4, p { margin: 0 0 6px; font-size: 12px; }
p, span { color: var(--text-secondary); }
summary { cursor: pointer; padding-block: 6px; font-size: 12px; }
.scene-list { max-height: 12rem; overflow: auto; }
.event-list { max-height: 12rem; overflow: auto; padding: 0; margin: 0 0 10px; list-style: none; }
.event-list li { display: grid; gap: 2px; padding-block: 3px; }
button { display: grid; width: 100%; gap: 2px; padding: 6px 3px; border: 0; background: transparent; color: var(--text-primary); text-align: start; font: inherit; cursor: pointer; }
button:hover { background: var(--nav-hover); }
strong, span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
</style>
