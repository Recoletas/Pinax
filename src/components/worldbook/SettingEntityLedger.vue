<script setup>
import { computed, ref, shallowRef, watch } from 'vue'
import { liveQuery } from 'dexie'
import WorldFactPassages from '../authoring/WorldFactPassages.vue'
import { tr } from '../../i18n'
import { worldbookEntityKey } from '../../services/project/knowledgeReadModel/identity'
import { openLedgerDb } from '../../services/memory/ledger/ledgerDb'
import { worldClaimLabel } from '../../services/memory/ledger/worldClaimLabel'
import { readWorldFacts, readWorldPerspective } from '../../services/memory/ledger/worldModelWorkspace'

const props = defineProps({ book: Object, worldbook: Object, busy: Boolean, entry: Object, scene: Object })
const emit = defineEmits(['entry', 'locate'])
const sourceId = ref('')
const view = ref('facts')
const scope = computed(() => ({ domain: 'book', bookId: props.book.id }))
const entities = computed(() => new Map(props.worldbook.entries.map(entry => [worldbookEntityKey(props.worldbook.id, entry.id), entry])))
function relatedEntries(fact) {
  const refs = [fact.subjectKey, fact.objectRef, ...(fact.eventContext?.placeRefs || []), ...(fact.eventContext?.participants || []).map(person => person.entityRef)]
  return [...new Set(refs)].filter(ref => ref !== key.value && entities.value.has(ref)).map(ref => entities.value.get(ref))
}
function locate(target) {
  emit('locate', { chapterId: target.id, nodeId: target.nodeId, start: target.start, end: target.end, term: target.matchText })
}
const opened = ref(true)
const sceneTime = ref(true)
const limit = ref(12)
const result = shallowRef(null)
const error = ref(false)
const dated = computed(() => Number.isSafeInteger(props.scene?.storyAt))
const key = computed(() => worldbookEntityKey(props.worldbook.id, props.entry.id))
const channels = { witnessed: '亲眼所见', heard: '听说', inferred: '推断', 'author-granted': '作者指定' }
const attitudes = { active: '相信', confirmed: '已证实', disputed: '存疑', disproved: '已推翻', forgotten: '已遗忘' }

watch([opened, key, () => props.book.id, () => props.entry.type,
  () => sceneTime.value && dated.value ? props.scene.storyAt : null,
  () => props.scene?.storyClock?.timelineId, () => props.scene?.storyClock?.eraId
], async ([show, entityRef, bookId, kind, storyAt, timelineId, eraId], _, cleanup) => {
  sourceId.value = ''; result.value = null; error.value = false; limit.value = 12
  if (!show) return
  let active = true, db, subscription
  cleanup(() => { active = false; subscription?.unsubscribe(); db?.close() })
  const openedDb = await openLedgerDb({ openTimeoutMs: 1500 })
  if (!active) { openedDb.db?.close(); return }
  if (!openedDb.ok) { error.value = true; return }
  db = openedDb.db
  const input = { scope: { domain: 'book', bookId }, storyAt, storyClock: timelineId ? { timelineId, eraId } : null }
  subscription = liveQuery(() => db.transaction('r', ['factVersions', 'factDecisions', 'ledgerMeta', 'worldClaims', 'knowledgeEvents', 'evidenceSnapshots'], async () => {
    const [facts, knowledge] = await Promise.all([readWorldFacts(db, { ...input, entityRef }), kind === 'character' ? readWorldPerspective(db, { ...input, actorKey: entityRef }) : null])
    const ids = [...new Set((facts.items || []).flatMap(row => row.evidenceIds || []))]
    const evidence = await db.evidenceSnapshots.bulkGet(ids)
    const sources = new Map(evidence.filter(row => row && row.scope?.bookId === bookId && entities.value.get(row.sourceId)?.type === 'source').map(row => [row.id, row]))
    return [facts, knowledge, sources]
  })).subscribe({
    next([facts, knowledge, sources]) {
      if (!active) return
      error.value = !facts.ok || (knowledge && !knowledge.ok)
      result.value = error.value ? null : { facts, knowledge, sources }
    },
    error() { if (active) { error.value = true; result.value = null } }
  })
}, { flush: 'sync', immediate: true })
</script>

<template>
  <details class="entity-ledger" :open="opened" @toggle.self="opened = $event.currentTarget.open">
    <summary>{{ tr('本书世界模型') }}</summary>
    <label v-if="dated"><input v-model="sceneTime" type="checkbox" /> {{ tr('按本章末段的故事时点') }} · {{ scene.time || scene.storyClock?.eraId }} {{ scene.storyAt }}</label>
    <p v-if="error" role="status">{{ tr('暂时无法读取本书的记录。') }}</p>
    <p v-else-if="!result" role="status">{{ tr('加载中…') }}</p>
    <template v-else>
      <nav v-if="result.knowledge" class="ledger-views" :aria-label="tr('记录类型')">
        <button type="button" :aria-pressed="view === 'facts'" @click="view = 'facts'">{{ tr('相关事实') }} <small>{{ result.facts.items.length }}</small></button>
        <button type="button" :aria-pressed="view === 'knowledge'" @click="view = 'knowledge'">{{ tr('人物见闻') }} <small>{{ result.knowledge.items.length }}</small></button>
      </nav>
      <template v-if="view === 'facts' || !result.knowledge">
      <ul v-if="result.facts.items.length"><li v-for="row in result.facts.items.slice(0, limit)" :key="row.id">
        <template v-if="row.polarity !== 'negative' && !row.literalValue && (row.subjectKey === key || row.objectRef === key)">
          <span class="fact-label">{{ row.predicate }}</span>
          <button v-if="relatedEntries(row).length === 1" type="button" class="fact-value" :disabled="busy" @click="emit('entry', relatedEntries(row)[0])">{{ row.subjectKey === key ? row.object : row.subjectLabel }} <span aria-hidden="true">›</span></button>
          <strong v-else>{{ row.subjectKey === key ? row.object : row.subjectLabel }}</strong>
        </template>
        <span v-else>{{ worldClaimLabel(row) }}</span>
        <small v-if="row.objectRef === key && row.subjectKey !== key && row.object !== (entry.name || key) && row.polarity !== 'negative' && !row.literalValue">{{ row.object }}</small>
        <small v-for="person in row.eventContext?.participants.filter(person => person.entityRef === key)" :key="person.role">{{ person.role }}</small>
        <div class="entity-actions">
          <button v-for="other in (relatedEntries(row).length === 1 && row.polarity !== 'negative' && !row.literalValue && (row.subjectKey === key || row.objectRef === key) ? [] : relatedEntries(row))" :key="other.id" type="button" :disabled="busy" @click="emit('entry', other)">{{ other.name || other.id }}</button>
          <button type="button" :aria-expanded="sourceId === row.id" @click="sourceId = sourceId === row.id ? '' : row.id">{{ tr(sourceId === row.id ? '收起出处' : '查看出处') }}</button>
        </div>
        <template v-if="sourceId === row.id">
          <blockquote v-for="source in (row.evidenceIds || []).map(id => result.sources.get(id)).filter(Boolean)" :key="source.id">
            <strong>{{ entities.get(source.sourceId)?.name }}</strong><p>{{ source.quote }}</p>
          </blockquote>
        </template>
        <WorldFactPassages v-if="sourceId === row.id && !(row.evidenceIds || []).every(id => result.sources.has(id))" :book="book" :worldbook-id="worldbook.id" :scope="scope" :fact-version-id="row.factVersionId" :disabled="busy" @locate="locate" />
      </li></ul>
      <p v-else>{{ tr('此视图没有查到相关正式事实。') }}</p>
      <p v-if="result.facts.unknownTimeCount">{{ tr('部分相关事实的日期尚无法判定。') }}</p>
      </template>
      <template v-else>
        <p v-if="result.knowledge.status === 'unknown'">{{ tr('当前记录不足以完整判断人物所知。') }}</p>
        <ul v-else-if="result.knowledge.items.length"><li v-for="row in result.knowledge.items.slice(0, limit)" :key="row.id">
          {{ worldClaimLabel(row) }} <small>{{ tr(channels[row.channel] || '渠道未登记') }}{{ row.speaker ? ' · ' + row.speaker.label : '' }} · {{ tr(attitudes[row.belief] || '未表态') }}</small>
        </li></ul>
        <p v-else>{{ tr('此时没有已记录的获知。') }}</p>
        <p v-if="result.knowledge.dateUnknown || result.knowledge.incomparable">{{ tr('有些经历日期未定或历法无法比较。') }}</p>
      </template>
      <button v-if="(view === 'knowledge' ? result.knowledge?.items.length : result.facts.items.length) > limit" type="button" @click="limit += 12">{{ tr('显示更多') }}</button>
    </template>
  </details>
</template>

<style scoped>
.entity-ledger { padding-block: 16px; border-block: 1px solid var(--hairline-soft); }
.entity-actions { display: flex; flex-wrap: wrap; gap: .4rem; margin-block: .25rem; }
summary { cursor: pointer; font-weight: 600; }
label, p, small { color: var(--text-secondary); }
label, small { display: block; margin-block-start: 4px; }
h4 { margin-block: 12px 4px; font-size: 13px; }
blockquote { margin: .5rem 0; padding-inline-start: .65rem; border-inline-start: 2px solid var(--hairline-soft); }
blockquote p { margin: .25rem 0; white-space: pre-wrap; }
ul { margin-block: 4px; padding-inline-start: 18px; }
li { margin-block: 5px; overflow-wrap: anywhere; }
button { font: inherit; color: var(--text-primary); background: transparent; border: 1px solid var(--hairline-soft); border-radius: 4px; cursor: pointer; }
.entity-ledger { font: 13px/1.65 var(--font-interface); }
.entity-ledger > summary { padding-block: 4px; font-size: 14px; color: var(--text-primary); }
.ledger-views { display: flex; gap: 16px; margin-block-start: 12px; border-bottom: 1px solid var(--hairline-soft); }
.ledger-views button { display: flex; gap: 6px; align-items: baseline; padding: 5px 1px; border: 0; border-bottom: 2px solid transparent; border-radius: 0; color: var(--text-secondary); }
.ledger-views button[aria-pressed=true] { border-bottom-color: var(--accent); color: var(--text-primary); }
.ledger-views small { font-size: 11px; }
ul { padding: 0; list-style: none; }
li { position: relative; margin: 0; padding: 10px 0; border-bottom: 1px solid var(--hairline-soft); }
.fact-label { display: block; font-size: 12px; color: var(--text-secondary); }
.fact-value, li strong { font-weight: 550; }
.fact-value, .entity-actions button { border: 0; padding: 0; background: transparent; text-align: start; }
.fact-value:hover, .entity-actions button:hover { text-decoration: underline; }
.entity-actions { margin: 2px 0 0; }
.entity-actions button { color: var(--text-muted); font-size: 12px; }
</style>
