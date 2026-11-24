<script setup>
import { worldClaimLabel } from '../../services/memory/ledger/worldClaimLabel.js'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { tr } from '../../i18n'
import { randomUUID } from '../../../shared/randomId.js'
import { loadWritingBooksSnapshot } from '../../services/writing/writingBooksRepository'
import { readWorldbookSnapshot } from '../../stores/worldStore'
import { useWorldManuscriptEditions } from '../../composables/useWorldManuscriptEditions.js'
import { worldbookEntityKey } from '../../services/project/knowledgeReadModel/identity'
import { withLedgerDb } from '../../services/memory/ledger/ledgerDb'
import {
  listWorldStatements, listWorldCalendars, defineWorldCalendar, saveWorldStatement, saveWorldOpposite, reviseWorldPeriodEnd, closeWorldPeriod, readWorldFacts, readWorldPerspective, inheritWorldCharacter, withdrawWorldKnowledge, saveWorldKnowledge, confirmWorldClaim, correctWorldEvent, correctWorldDate,
  readWorldReader, listWorldUses, relocateWorldDisclosure, withdrawWorldDisclosure, changeWorldDisclosureSpeaker, saveWorldManuscriptLink, reviewWorldUse, retireWorldBeliefUse, archiveWorldAnchor, worldManuscriptUnits
} from '../../services/memory/ledger/worldModelWorkspace'
import { resolveActiveSceneAnchor } from '../../services/agents/authoring/authoringSceneAnchors.js'
import WorldCalendarEditor from './WorldCalendarEditor.vue'
import WorldClockPicker from './WorldClockPicker.vue'
import WorldEventContextFields from './WorldEventContextFields.vue'
import WorldPeriodEndFields from './WorldPeriodEndFields.vue'
import WorldPassageSourceFields from './WorldPassageSourceFields.vue'
import WorldKnowledgeSourceFields from './WorldKnowledgeSourceFields.vue'
import WorldKnowledgeHistory from './WorldKnowledgeHistory.vue'
import WorldStatementForm from './WorldStatementForm.vue'
import WorldDisclosurePosition from './WorldDisclosurePosition.vue'
import WorldManuscriptRangeLabel from './WorldManuscriptRangeLabel.vue'
import WorldManuscriptChecks from './WorldManuscriptChecks.vue'

const props = defineProps({ scope: { type: Object, required: true } })
const tabs = { statements: '世界陈述', character: '人物所知', reader: '读者已知', uses: '用稿检查' }
const channels = { witnessed: '亲眼所见', heard: '听说', inferred: '推断', 'author-granted': '作者指定' }
const beliefs = { active: '相信', confirmed: '已证实', disputed: '存疑', disproved: '已推翻', forgotten: '已遗忘' }
const disclosureKinds = { 'narrator-assertion': '叙述者断言', 'reported-speech': '引述他人说法' }
const useKinds = { 'assertion-use': '叙述依赖事实', 'belief-use': '人物依据信念行动', 'constraint-use': '创作约束' }
const failureLabels = {
  'fork-actor-used': '此人物已有分支经历，保留现有记录。',
  'fork-actor-empty': '分叉时正史还没有登记此人物的经历。',
  'fork-calendar-mismatch': '分支历法与分叉时的纪元顺序不同，无法继承这段经历。',
  'calendar-revision-changed': '这套历法已在别处修改，请刷新后重选。',
  'calendar-fact-conflict': '有正式事实使用了待移除的纪元，或其区间会因换序而倒置。请先核对相应事实。',
  'claim-literal-invalid': '请核对陈述的数值、单位或布尔值。',
  'timeline-mismatch': '起点与终点必须使用同一套历法。',
  'story-interval-invalid': '结束时点必须晚于开始时点。',
  'story-interval-conflict': '这个开始时点会覆盖已登记的另一段状态。请核对上一段的起止时间。',
  'event-start-required': '请先登记事件的开始时点。',
  'story-time-invalid': '请填写可表示的整数故事序号。',
  'timeline-era-invalid': '所选纪元不在这套历法中，请刷新后重选。',
  'disclosure-position-exists': '同一条揭示已在目标段落登记，请核对说话人和原句。',
  'disclosure-changed': '这条揭示已经更改，请刷新后重新选择。',
  'disclosure-speaker-exists': '该人物在同一段的这条引述已经登记。',
  'claim-already-exists': '相反说法已登记，可在本书陈述中查看。',
  'claim-already-adjudicated': '这条说法已经登记过正式事实，请刷新后查看事实记录。',
  'claim-not-found': '本书找不到这条说法，请刷新后重新选择。',
  'event-context-invalid': '请为每位参与者填写条目及事件角色，并选定发生地。',
  'no-change': '内容与当前记录相同。',
  'head-conflict': '事实已在别处更改，请刷新并重新选择陈述。',
  'worldbook-binding-changed': '条目已移除或本书已更换世界书，请刷新并重新选择。',
  'worldbook-entity-changed': '条目已移除或本书已更换世界书，请刷新并重新选择。',
  'calendar-scene-conflict': '已登记的手稿场景仍使用这个纪元，请先核对场景时间。',
  'calendar-knowledge-conflict': '这一调整会移除正在使用的纪元，或使人物先改变态度后获知消息。',
  'belief-use-date-unknown': '获知、改变态度或遗忘的日期待核对，无法确认这段行动的依据。',
  'belief-use-incomparable': '这个人物对此说法的记录跨越了无法换算的历法，请核对日期。',
  'belief-use-unavailable': '这个人物在所选时点尚未获知这条说法，或已将它遗忘。',
  'belief-use-invalid': '请选择行动人物并填写整数故事时点。',
  'knowledge-speaker-invalid': '请选取与听者不同的人物作为消息来源。',
  'knowledge-event-changed': '这条认知记录已变化，请刷新后重新核对。',
  'knowledge-dependent-attitude': '这次修改会让一条态度记录失去当时的获知依据，请先核对那条态度记录。',
  'knowledge-not-yet-acquired': '请先登记这个人物在该故事时点或更早获知此说法。',
  'manuscript-range-invalid': '约束终点必须是本书中晚于起点的段落。',
  'manuscript-changed': '稿面位置已变化，请刷新后重新核对原文。',
  'fact-version-changed': '事实已在别处更改，请刷新并重新选择陈述。',
  'manuscript-use-changed': '这条用稿依赖已在别处更改，请刷新后核对。',
  'manuscript-link-changed': '这条用稿依赖已在别处更改，请刷新后核对。',
  'confirmed-fact-required': '此方式需要选择当前成立的正式事实。'
}
const tab = ref('statements')
const book = shallowRef(null)
const entries = shallowRef([])
const statements = shallowRef([])
const projection = shallowRef([])
const selectedClaim = ref('')
const actorId = ref('')
const chapterId = ref('')
const unitId = ref('')
const queryTime = ref('')
const recordCut = ref('')
const learnedAt = ref('')
const knowledgeKind = ref('known')
const channel = ref('heard')
const speakerKey = ref('')
const originPosition = ref(null)
const belief = ref('')
const disclosureKind = ref('narrator-assertion')
const disclosureSpeaker = ref('')
const withdrawingId = ref('')
const editingSpeakerId = ref('')
const correctedSpeaker = ref('')
const useKind = ref('assertion-use')
const rangeEndPosition = ref(null)
const actionActorKey = ref('')
const actionTime = ref('')
const reviewingId = ref('')
const replacementId = ref('')
const writing = ref(false)
const loadingStatements = ref(true)
const revision = ref(0)
const loading = ref(false)
const openedForm = ref(false)
const factsOpen = ref(false)
const confirmingId = ref('')
const confirmationPosition = ref(null)
const confirmationTime = ref('')
const confirmationClock = ref(null)
const queryClock = ref(null)
const characterClock = ref(null)
const actionClock = ref(null)
const learnedClock = ref(null)
const incomparable = ref(false)
const dateUnknown = ref(false)
const calendars = shallowRef([])
const calendarEditorOpen = ref(false)
function chooseConfirmation(id) {
  editEvent(null)
  confirmingId.value = id
  confirmationPosition.value = null; confirmationTime.value = ''; confirmationClock.value = null
}
const editingEvent = shallowRef(null)
const eventContext = ref(null)
const editingDate = ref('')
const ending = ref(false)
const editingPeriod = ref('')
const changedPeriod = ref(null)
function editPeriod(row) {
  editEvent(null)
  editingPeriod.value = row.id
  const end = row.validInterval
  changedPeriod.value = end?.endSemantic === 'unknown' ? { kind: 'unknown', ...(end.endBy ? { by: end.endBy } : {}) } : null
}
const correctedDay = ref('')
const correctedClock = ref(null)
function editDate(row, editEnd = false) {
  editEvent(null)
  editingDate.value = row.id
  ending.value = editEnd
  const point = editEnd ? row.validInterval?.end : row.validInterval?.start
  const eraId = point?.eraId ?? row.validInterval?.start?.eraId ?? row.validInterval?.end?.eraId
  correctedDay.value = String(point?.ordinal ?? '')
  correctedClock.value = eraId ? { timelineId: row.validInterval.timelineId, eraId } : null
}
function saveDate(row) {
  return write(ending.value ? closeWorldPeriod : correctWorldDate, { factKey: row.factKey, expectedHead: row.factVersionId, subjectKey: row.subjectKey,
    storyAt: toNumber(correctedDay.value), storyClock: correctedClock.value })
}
function editEvent(row) {
  editingPeriod.value = ''
  editingDate.value = ''
  confirmingId.value = ''
  editingEvent.value = row
  eventContext.value = row?.eventContext || { placeRefs: [], participants: [] }
}
function saveEvent() {
  const row = editingEvent.value
  if (!row) return
  return write(correctWorldEvent, { expectedHead: row.factVersionId, factKey: row.factKey, subjectKey: row.subjectKey,
    object: row.object, eventContext: eventContext.value })
}
const unknownTimeCount = ref(0)
const error = ref('')
const queryError = ref('')
const feedback = ref('')
const stale = ref(false)
let alive = true
let listGeneration = 0
let readGeneration = 0
let lastAttempt = null

const characters = computed(() => entries.value.filter(entry => entry.type === 'character'))
const speakers = computed(() => characters.value.filter(row => row.id !== actorId.value))
const actor = computed(() => characters.value.find(entry => entry.id === actorId.value))
const runLedger = action => withLedgerDb(action, { openTimeoutMs: 1500 })
const { editions, editionId, edition, editionError } = useWorldManuscriptEditions({
  tab, revision, getScope: () => props.scope, runLedger,
  clearPosition(seq) {
    chapterId.value = ''; unitId.value = ''; openedForm.value = false
    recordCut.value = seq == null ? '' : String(seq)
  }
})
const selectableChapters = computed(() => editionId.value
  ? (edition.value?.chapters || []).map(row => ({ ...row, id: row.chapterId })) : book.value?.chapters || [])
const chapter = computed(() => selectableChapters.value.find(item => item.id === chapterId.value))
const units = computed(() => editionId.value ? chapter.value?.units || [] : chapter.value ? worldManuscriptUnits(chapter.value) : [])
const unit = computed(() => units.value.find(item => item.unitId === unitId.value))
const passageViewpoint = computed(() => {
  if (!unit.value || !book.value?.worldbookId) return null
  const { anchor } = resolveActiveSceneAnchor({ anchors: chapter.value.sceneAnchors, unitOrder: units.value.map(row => row.unitId),
    activeUnitId: unit.value.unitId, worldbookId: book.value.worldbookId })
  if (!Number.isSafeInteger(anchor?.time?.storyAt) || !characters.value.some(row => row.id === anchor.viewpointCharacterId)) return null
  return { actor: anchor.viewpointCharacterId, time: anchor.time.storyAt, clock: anchor.time.storyClock ?? null, worldbookId: anchor.worldbookId }
})
function readPassageViewpoint() {
  const shown = passageViewpoint.value
  if (!shown) return
  loadBook()
  const live = passageViewpoint.value
  if (!live || live.worldbookId !== shown.worldbookId || live.actor !== shown.actor || live.time !== shown.time || JSON.stringify(live.clock) !== JSON.stringify(shown.clock)) {
    feedback.value = tr('场景已变化，请重新核对视角人物和故事序号。')
    return
  }
  actorId.value = live.actor
  characterClock.value = live.clock
  queryTime.value = String(live.time)
  switchTab('character')
}
const selected = computed(() => statements.value.find(item => item.id === selectedClaim.value))
const manuscriptTab = computed(() => tab.value === 'reader' || tab.value === 'uses')
const readyToQuery = computed(() => {
  if (tab.value === 'statements') return factsOpen.value
  return tab.value === 'character' ? Boolean(actor.value) : manuscriptTab.value && Boolean(unit.value)
})
const isInteger = value => value === '' || Number.isSafeInteger(Number(value))
const toNumber = value => value === '' ? null : Number(value)
const entryLabels = computed(() => new Map(entries.value.map(entry => [entry.key, entry.label])))
function claimLabel(row) {
  const recordedNames = new Map((row.eventLabels || []).map(entry => [entry.entityRef, entry.label]))
  const name = key => recordedNames.get(key) || entryLabels.value.get(key) || key
  return [worldClaimLabel(row),
    ...(row.eventContext?.placeRefs || []).map(key => tr('发生地') + ' ' + name(key)),
    ...(row.eventContext?.participants || []).map(person => person.role + ' ' + name(person.entityRef))
  ].filter(Boolean).join(' · ')
}
const claimAuthority = row => tr(row.authority === 'historical' ? '已更正或撤回的事实' : row.factVersionId ? '正式事实' : '传闻或待证说法')
const validRecordCut = computed(() => isInteger(recordCut.value) && (recordCut.value === '' || Number(recordCut.value) >= 0))
const validCut = computed(() => validRecordCut.value && (manuscriptTab.value || isInteger(queryTime.value)))
const requiresFact = kind => kind === 'narrator-assertion' || kind === 'assertion-use'
const manuscriptKind = computed(() => tab.value === 'reader' ? disclosureKind.value : useKind.value)
const invalidLink = computed(() => manuscriptTab.value && requiresFact(manuscriptKind.value) && !selected.value?.factVersionId)


function loadBook() {
  book.value = loadWritingBooksSnapshot().find(item => item.id === props.scope.bookId) || null
  const library = book.value?.worldbookId ? readWorldbookSnapshot(book.value.worldbookId) : null
  const rows = library?.entries || []
  const names = new Map()
  for (const row of rows) names.set(row.name, (names.get(row.name) || 0) + 1)
  entries.value = rows.map(row => ({
    id: row.id, type: row.type, name: row.name || row.id,
    key: worldbookEntityKey(book.value.worldbookId, row.id),
    label: names.get(row.name) > 1 ? (row.name || tr('未命名')) + ' · ' + row.id : row.name || row.id
  }))
}

function assertOk(result) {
  if (!result?.ok) throw new Error(failureLabels[result?.reason] ? tr(failureLabels[result.reason]) : result?.detail || result?.reason || tr('读取失败'))
  return result
}

async function refresh() {
  const gen = ++listGeneration
  error.value = ''
  loadingStatements.value = true
  try {
    loadBook()
    if (!book.value) { statements.value = []; return }
    const [result, clocks] = await runLedger(db => Promise.all([listWorldStatements(db, { scope: props.scope }), listWorldCalendars(db, { scope: props.scope })]))
    assertOk(result); assertOk(clocks)
    if (!alive || gen !== listGeneration) return
    calendars.value = clocks.items
    statements.value = result.items
    revision.value++
    if (!selected.value) selectedClaim.value = ''
    await readProjection()
  } catch (cause) {
    if (alive && gen === listGeneration) { error.value = cause.message; statements.value = []; projection.value = [] }
  } finally {
    if (alive && gen === listGeneration) loadingStatements.value = false
  }
}

async function readProjection() {
  withdrawingId.value = ''
  const gen = ++readGeneration
  projection.value = []
  queryError.value = ''
  incomparable.value = false
  dateUnknown.value = false
  stale.value = false
  loading.value = false
  unknownTimeCount.value = 0
  if (!readyToQuery.value || !validCut.value) return
  const at = tab.value
  const inputs = { scope: props.scope, book: book.value, chapterId: chapterId.value, unitId: unitId.value,
    ...(at === 'statements' ? { storyClock: queryClock.value } : at === 'character' ? { storyClock: characterClock.value } : {}),
    ...(manuscriptTab.value && editionId.value ? { editionId: editionId.value } : {}),
    actorKey: actor.value?.key, storyAt: toNumber(queryTime.value),
    ...(recordCut.value !== '' ? { recordedSeq: Number(recordCut.value) } : {}) }
  const query = { statements: readWorldFacts, character: readWorldPerspective, reader: readWorldReader, uses: listWorldUses }[at]
  loading.value = true
  try {
    const result = assertOk(await runLedger(db => query(db, inputs)))
    if (!alive || gen !== readGeneration) return
    incomparable.value = result.incomparable === true
    dateUnknown.value = result.dateUnknown === true
    stale.value = result.status === 'unknown'
    projection.value = result.items
    unknownTimeCount.value = result.unknownTimeCount || 0
  } catch (cause) {
    if (alive && gen === readGeneration) queryError.value = cause.message
  } finally {
    if (alive && gen === readGeneration) loading.value = false
  }
}

async function write(action, input) {
  if (writing.value || !book.value) return
  const expectedWorldbookId = book.value.worldbookId || null
  const { book: manuscript, ...fields } = input
  const fingerprint = JSON.stringify([fields, manuscript && unit.value?.text, input.originPosition && manuscript?.chapters?.find(ch => ch.id === input.originPosition.chapterId)?.updatedAt])
  if (lastAttempt?.action !== action || lastAttempt.fingerprint !== fingerprint) lastAttempt = { action, fingerprint, commandId: randomUUID() }
  const payload = { ...input, scope: props.scope, expectedWorldbookId, commandId: lastAttempt.commandId }
  const before = tab.value
  writing.value = true
  error.value = ''; feedback.value = ''
  try {
    const result = await runLedger(db => alive ? action(db, payload) : null)
    if (!alive) return
    assertOk(result)
    lastAttempt = null
    if (before === 'reader') { editingSpeakerId.value = ''; disclosureSpeaker.value = '' }
    if (before === 'character') { speakerKey.value = ''; originPosition.value = null }
    if (action === defineWorldCalendar) calendarEditorOpen.value = false
    if (before === 'statements') { openedForm.value = false; editEvent(null) }
    feedback.value = tr('已保存')
    await refresh()
    if (alive && before === 'statements' && result.result?.claimId) selectedClaim.value = result.result.claimId
  } catch (cause) {
    if (alive) error.value = cause.message
  } finally {
    if (alive) writing.value = false
  }
}

function saveKnowledge() {
  if (!selected.value || !actor.value || !isInteger(learnedAt.value)) return
  return write(saveWorldKnowledge, { claimId: selected.value.id, actorKey: actor.value.key, actorLabel: actor.value.name,
    book: book.value, originPosition: originPosition.value, ...(learnedClock.value ? { storyClock: learnedClock.value } : {}),
    ...(knowledgeKind.value === 'known' && channel.value === 'heard' ? { speakerKey: speakerKey.value } : {}),
    kind: knowledgeKind.value, channel: channel.value, belief: knowledgeKind.value === 'known' ? null : belief.value, storyAt: toNumber(learnedAt.value) })
}
function chooseUse(id) {
  reviewingId.value = id
  replacementId.value = ''
}
function locateUse(row) {
  chapterId.value = row.chapterId
  unitId.value = units.value.some(item => item.unitId === row.unitId) ? row.unitId : ''
  feedback.value = unitId.value ? '' : tr('稿面位置已变化，请刷新后重新核对原文。')
}
function confirmUse(row) {
  const replacement = statements.value.find(item => item.id === replacementId.value && item.authority !== 'historical')
  if (!unit.value || !replacement || row.id !== reviewingId.value || !row.needsReview) return
  return write(reviewWorldUse, { useId: row.id, book: book.value, chapterId: row.rangeStart?.chapterId || chapterId.value, unitId: row.rangeStart?.unitId || unitId.value,
    ...(row.rangeEnd ? { rangeEndPosition: { chapterId: row.rangeEnd.chapterId, unitId: row.rangeEnd.unitId } } : {}), kind: row.kind, claimId: replacement.id, factVersionId: replacement.factVersionId || null })
}
function saveLink() {
  if (!selected.value || !unit.value || invalidLink.value) return
  const beliefUse = manuscriptKind.value === 'belief-use' && actionActorKey.value
    ? { actorKey: actionActorKey.value, storyAt: toNumber(actionTime.value), ...(actionClock.value ? { storyClock: actionClock.value } : {}) } : null
  return write(saveWorldManuscriptLink, { ...(manuscriptKind.value === 'constraint-use' && rangeEndPosition.value ? { rangeEndPosition: rangeEndPosition.value } : {}), ...(manuscriptKind.value === 'reported-speech' ? { disclosureSpeakerKey: disclosureSpeaker.value } : {}), ...(beliefUse ? { beliefUse } : {}), claimId: selected.value.id, factVersionId: selected.value.factVersionId || null,
    book: book.value, chapterId: chapterId.value, unitId: unitId.value, kind: manuscriptKind.value })
}
function switchTab(key) {
  if (key === tab.value) return
  editEvent(null)
  editingSpeakerId.value = ''; disclosureSpeaker.value = ''
  tab.value = key
  openedForm.value = false
  error.value = ''; feedback.value = ''
}
watch(actorId, () => { speakerKey.value = ''; originPosition.value = null })
watch([chapterId, unitId], () => { actionActorKey.value = ''; actionTime.value = '' })
watch(chapterId, () => { unitId.value = '' }, { flush: 'sync' })
watch([openedForm, characterClock], () => { if (tab.value === 'character') learnedClock.value = characterClock.value })
watch(knowledgeKind, value => { belief.value = value === 'belief' ? 'active' : '' })
watch([tab, chapterId, unitId, useKind], () => { chooseUse(''); rangeEndPosition.value = null })
watch([tab, actorId, chapterId, unitId, queryTime, recordCut, factsOpen, queryClock, characterClock, editionId, edition], readProjection)
onMounted(refresh)
onBeforeUnmount(() => { alive = false; listGeneration++; readGeneration++ })
defineExpose({ refresh })
</script>

<template>
  <section class="world-model" data-test="world-model" :aria-label="tr('小说世界模型')">
    <div v-if="error" role="alert">{{ error }}</div>
    <template v-if="book">
      <nav class="world-tabs" :aria-label="tr('世界模型视图')">
        <button v-for="(label, key) in tabs" :key="key" type="button" :aria-pressed="tab === key"
          :disabled="writing" @click="switchTab(key)">{{ tr(label) }}</button>
      </nav>
      <fieldset :disabled="writing">
        <template v-if="tab === 'statements'">
          <div class="world-actions">
            <button type="button" :aria-expanded="openedForm" @click="openedForm = !openedForm">{{ openedForm ? tr('收起') : tr('添加陈述') }}</button>
            <button type="button" :aria-expanded="calendarEditorOpen" @click="calendarEditorOpen = !calendarEditorOpen">{{ tr('作品历法') }}</button>
            <button type="button" :aria-expanded="factsOpen" @click="factsOpen = !factsOpen">{{ factsOpen ? tr('收起事实回看') : tr('回看正式事实') }}</button>
          </div>
          <WorldCalendarEditor v-if="calendarEditorOpen" :calendars="calendars" :busy="writing" @save="input => write(defineWorldCalendar, input)" />
          <WorldStatementForm v-if="openedForm" :calendars="calendars" :book="book" :entities="entries" :busy="writing" @save="input => write(saveWorldStatement, input)" />
          <template v-if="factsOpen">
            <WorldClockPicker v-model="queryClock" :calendars="calendars" />
            <div class="world-fields">
              <label>{{ tr('回看故事时点') }}<input v-model="queryTime" type="number" step="1" :placeholder="tr('留空查看最近状态')" /></label>
              <label>{{ tr('回看记录序号') }}<input v-model="recordCut" type="number" min="0" step="1" :placeholder="tr('留空使用最新记录')" /></label>
            </div>
            <p v-if="!validCut" role="alert">{{ tr('请填写有效的整数时点和非负记录序号。') }}</p>
            <p v-else-if="queryError" role="alert">{{ queryError }}</p>
            <p v-else-if="loading" class="hint">{{ tr('加载中…') }}</p>
            <ul v-else-if="projection.length" class="world-results" :aria-label="tr('此时成立的事实')"><li v-for="row in projection" :key="row.id">{{ claimLabel(row) }} <small v-if="row.oppositeClaimId">{{ tr('同一时点另有相反的正式事实') }}</small></li></ul>
            <p v-else class="hint">{{ tr('此时没有可确认的正式事实。') }}</p>
            <p v-if="unknownTimeCount" class="hint">{{ tr('{count} 条事实缺少可判定的故事时点。', { count: unknownTimeCount }) }}</p>
          </template>
          <ul v-else-if="statements.length" class="world-results" :aria-label="tr('本书陈述')">
            <li v-for="row in statements" :key="row.id">{{ claimLabel(row) }} <small>{{ claimAuthority(row) }} · {{ tr('记录 {seq}', { seq: row.recordedSeq }) }}</small>
              <button type="button" @click="write(saveWorldOpposite, { claimId: row.id })">{{ tr('登记相反说法为传闻') }}</button>
              <button v-if="row.authority === 'rumor' && confirmingId !== row.id" type="button" @click="chooseConfirmation(row.id)">{{ tr('证实这条说法') }}</button>
              <form v-if="confirmingId === row.id" class="world-form" @submit.prevent="write(confirmWorldClaim, { claimId: row.id, ...(confirmationPosition ? { book, factPosition: confirmationPosition } : {}), storyAt: toNumber(confirmationTime), ...(confirmationTime !== '' && confirmationClock ? { storyClock: confirmationClock } : {}) })">
                <WorldClockPicker v-model="confirmationClock" :calendars="calendars" />
                <label>{{ tr('事实成立的故事时点（未知可留空）') }}<input v-model="confirmationTime" type="number" step="1" /></label>
                <WorldPassageSourceFields v-model="confirmationPosition" :book="book" />
                <button type="submit" :disabled="!isInteger(confirmationTime)">{{ tr('确认为正式事实') }}</button>
                <button type="button" @click="chooseConfirmation('')">{{ tr('取消') }}</button>
              </form>
              <button v-if="row.authority === 'fact' && editingDate !== row.id" type="button" @click="editDate(row)">{{ tr('更正故事日期') }}</button>
              <button v-if="row.authority === 'fact' && (row.kind !== 'event' || Number.isSafeInteger(row.validInterval?.start?.ordinal)) && editingDate !== row.id" type="button" @click="editDate(row, true)">{{ tr(row.kind === 'event' && !row.validInterval?.eventSpan ? '设定事件结束日期' : row.validInterval?.end ? '更正结束日期' : '登记结束日期') }}</button>
              <small v-if="row.validInterval?.end && (row.kind !== 'event' || row.validInterval.eventSpan)">{{ tr('自 {era} 第 {day} 起结束', { era: calendars.find(c => c.id === row.validInterval.timelineId)?.eras.find(e => e.id === row.validInterval.end.eraId)?.label || row.validInterval.end.eraId, day: row.validInterval.end.ordinal ?? '？' }) }}</small>
              <small v-if="row.validInterval?.endSemantic === 'unknown'">{{ tr('结束日期未定') }}
                <template v-if="row.validInterval.endBy"> · {{ tr('最迟在 {era} 第 {day} 时已结束', { era: calendars.find(c => c.id === row.validInterval.timelineId)?.eras.find(e => e.id === row.validInterval.endBy.eraId)?.label || row.validInterval.endBy.eraId, day: row.validInterval.endBy.ordinal }) }}</template>
              </small>
              <button v-if="row.authority === 'fact' && row.kind !== 'event' && row.validInterval?.start && editingPeriod !== row.id" type="button" @click="editPeriod(row)">{{ tr('更正持续情况') }}</button>
              <form v-if="editingPeriod === row.id" class="world-form" @submit.prevent="write(reviseWorldPeriodEnd, { factKey: row.factKey, expectedHead: row.factVersionId, periodEnd: changedPeriod || { kind: 'open' } })">
                <WorldPeriodEndFields v-model="changedPeriod" :calendar="calendars.find(c => c.id === row.validInterval.timelineId)" :era-id="row.validInterval.start.eraId" />
                <p v-if="!changedPeriod">{{ tr('自登记起点持续有效，直到后续状态或明确的终点。') }}</p>
                <button type="submit" :disabled="writing">{{ tr('保存持续情况') }}</button>
                <button type="button" @click="editingPeriod = ''">{{ tr('取消') }}</button>
              </form>
              <form v-if="editingDate === row.id" class="world-form" @submit.prevent="saveDate(row)">
                <WorldClockPicker v-model="correctedClock" :calendars="calendars" />
                <label>{{ tr(ending ? '从哪个故事序号起不再成立' : '更正后的故事序号') }}<input v-model="correctedDay" type="number" step="1" required /></label>
                <button type="submit" :disabled="correctedDay === '' || !isInteger(correctedDay)">{{ tr('保存日期') }}</button>
                <button type="button" @click="editEvent(null)">{{ tr('取消') }}</button>
              </form>
              <button v-if="row.authority === 'fact' && row.kind === 'event' && editingEvent?.id !== row.id" type="button" @click="editEvent(row)">{{ tr('更正事件地点与参与者') }}</button>
              <form v-if="editingEvent?.id === row.id" class="world-form" @submit.prevent="saveEvent">
                <WorldEventContextFields v-model="eventContext" :entities="entries" />
                <button type="submit">{{ tr('保存更正') }}</button>
                <button type="button" @click="editEvent(null)">{{ tr('取消') }}</button>
              </form>
            </li>
          </ul>
          <p v-else-if="loadingStatements" class="hint">{{ tr('加载中…') }}</p>
          <p v-else-if="!error" class="hint">{{ tr('本书还没有登记世界陈述。') }}</p>
        </template>
        <template v-else>
          <WorldClockPicker v-if="tab === 'character'" v-model="characterClock" :calendars="calendars" />
          <div v-if="tab === 'character'" class="world-fields">
            <label>{{ tr('视角人物') }}
              <select v-model="actorId"><option value="">{{ tr('选择人物') }}</option><option v-for="entry in characters" :key="entry.id" :value="entry.id">{{ entry.label }}</option></select>
            </label>
            <button v-if="actor && scope.domain === 'session' && recordCut === ''" type="button" :disabled="writing"
              @click="write(inheritWorldCharacter, { actorKey: actor.key })">{{ tr('从分叉点继承此人物经历') }}</button>
            <label>{{ tr('回看故事时点') }}<input v-model="queryTime" type="number" step="1" :placeholder="tr('留空查看最近状态')" /></label>
          </div>
          <div v-else class="world-fields">
            <label v-if="editions.length">{{ tr('阅读的稿面版本') }}
              <select v-model="editionId"><option value="">{{ tr('当前稿面') }}</option>
                <option v-for="item in editions" :key="item.id" :value="item.id">{{ tr('登记 {seq} · {count} 章', { seq: item.recordedSeq, count: item.chapters }) }}</option>
              </select>
            </label>
            <label>{{ tr('手稿章节') }}
              <select v-model="chapterId"><option value="">{{ tr('选择章节') }}</option><option v-for="(ch, i) in selectableChapters" :value="ch.id" :key="ch.id">{{ ch.title || tr('第 {count} 章', { count: i + 1 }) }}</option></select>
            </label>
            <label>{{ tab === 'reader' ? tr('读到的段落') : tr('使用位置') }}
              <select v-model="unitId" :disabled="!units.length"><option value="">{{ tr('选择段落') }}</option>
                <option v-for="(row, i) in units" :key="row.unitId" :value="row.unitId">{{ row.text ? (i + 1) + ' · ' + row.text.slice(0, 58) : tr('第 {count} 段', { count: i + 1 }) }}</option>
              </select>
            </label>
          </div>
          <p v-if="tab === 'reader' && editionError" role="alert">{{ editionError }}</p>
          <button v-if="manuscriptTab && passageViewpoint" type="button" @click="readPassageViewpoint">{{ tr('查看此段视角人物当时所知') }}</button>
          <p v-if="tab === 'character' && !characters.length" class="hint">{{ tr('请先在本书绑定的世界书中建立人物条目。') }}</p>
          <p v-if="manuscriptTab && chapter && !units.length" class="hint">{{ tr('本章尚无可定位的正文段落。') }}</p>
          <WorldManuscriptChecks @move="input => write(relocateWorldDisclosure, input)" @retire="row => write(retireWorldBeliefUse, { book, useId: row.id })" v-if="tab === 'uses' && !editionId && recordCut === ''" :scope="scope" :book="book" :statements="statements"
            :revision="revision" @locate="locateUse"
            @archive="row => write(archiveWorldAnchor, { book, linkId: row.id, kind: row.kind })" />
          <template v-if="readyToQuery">
            <label>{{ tr('回看记录序号') }}<input v-model="recordCut" type="number" min="0" step="1" :placeholder="tr('留空使用最新记录')" /></label>
            <p v-if="!validCut" role="alert">{{ tr('请填写有效的整数时点和非负记录序号。') }}</p>
            <p v-else-if="queryError" role="alert">{{ queryError }}</p>
            <p v-else-if="loading" class="hint">{{ tr('加载中…') }}</p>
            <p v-else-if="stale" role="status">{{ tr(manuscriptTab ? '稿面位置已变化，请刷新后重新核对原文。' : '当前记录不足以完整判断人物所知。') }}</p>
            <ul v-else-if="projection.length" class="world-results" data-test="world-projection">
              <li v-for="(row, i) in projection" :key="row.id || i">{{ claimLabel(row) }}
                <small v-if="tab === 'character'">{{ channels[row.channel] ? tr(channels[row.channel]) : '' }} · {{ tr(beliefs[row.belief] || '未表态') }}</small>
                <WorldKnowledgeHistory v-if="tab === 'character' && row.history?.length"
                   :calendars="calendars" :events="row.history" :book="book" :speakers="speakers" :channels="channels" :beliefs="beliefs" :editable="recordCut === ''"
                  @withdraw="eventId => write(withdrawWorldKnowledge, { eventId, claimId: row.id, actorKey: actor.key })"
                  @correct="change => write(saveWorldKnowledge, { ...change, book, claimId: row.id, actorKey: actor.key, actorLabel: actor.name })" />
                <small v-if="tab === 'reader'">{{ tr(disclosureKinds[row.disclosureKind] || '已揭示') }}</small>
                <small v-if="tab === 'reader' && row.speaker">{{ tr('说话人') }} · {{ row.speaker.label }}</small>
                <template v-if="tab === 'reader' && row.disclosureKind === 'reported-speech' && !editionId && recordCut === ''">
                  <button v-if="editingSpeakerId !== row.id" type="button" @click="editingSpeakerId = row.id; correctedSpeaker = row.speaker?.entityRef || ''">{{ tr('更正说话人') }}</button>
                  <form v-else class="world-form" @submit.prevent="write(changeWorldDisclosureSpeaker, { book, disclosureId: row.id, disclosureSpeakerKey: correctedSpeaker })">
                    <label>{{ tr('更正后的说话人') }}<select v-model="correctedSpeaker" :aria-label="tr('更正后的说话人')">
                      <option value="">{{ tr('未指明') }}</option>
                      <option v-for="person in characters" :key="person.key" :value="person.key">{{ person.label }}</option>
                    </select></label>
                    <button type="submit">{{ tr('保存说话人') }}</button>
                    <button type="button" @click="editingSpeakerId = ''">{{ tr('取消') }}</button>
                  </form>
                </template>
                <template v-if="tab === 'reader' && !editionId && recordCut === ''">
                  <WorldDisclosurePosition :book="book" :row="row" :busy="writing" @move="input => write(relocateWorldDisclosure, input)" />
                  <button v-if="withdrawingId !== row.id" type="button" @click="withdrawingId = row.id">{{ tr('撤下这条揭示') }}</button>
                  <div v-else class="world-form">
                    <p>{{ book.chapters.find(ch => ch.id === row.chapterId)?.title }} · {{ row.quote }}</p>
                    <button type="button" :disabled="writing" @click="write(withdrawWorldDisclosure, { book, disclosureId: row.id })">{{ tr('确认撤下揭示') }}</button>
                    <button type="button" @click="withdrawingId = ''">{{ tr('取消') }}</button>
                  </div>
                </template>
                <small v-if="tab === 'uses'">{{ tr(useKinds[row.kind] || '稿面依赖') }} · {{ row.needsReview ? tr('设定已变化，待核对') : tr('已登记') }}</small>
                <WorldManuscriptRangeLabel v-if="row.rangeEnd" :book="book" :edition="edition" :row="row" />
                <small v-if="row.beliefUse">{{ row.beliefUse.actorLabel }} · {{ tr('故事序号') }} {{ row.beliefUse.storyAt }} · {{ tr(beliefs[row.beliefUse.basis.belief] || '未表态') }}</small>
                <template v-if="tab === 'uses' && !editionId && recordCut === '' && row.needsReview">
                  <button v-if="reviewingId !== row.id" type="button" @click="chooseUse(row.id)">{{ tr('核对这条依赖') }}</button>
                  <form v-else class="world-form" @submit.prevent="confirmUse(row)">
                    <label>{{ tr('核对后采用的陈述') }}<select v-model="replacementId" required>
                      <option value="">{{ tr('选择陈述') }}</option>
                      <option v-for="item in statements.filter(item => item.authority !== 'historical' && (!requiresFact(row.kind) || item.factVersionId))" :key="item.id" :value="item.id">{{ claimLabel(item) }} · {{ claimAuthority(item) }}</option>
                    </select></label>
                    <button type="submit" :disabled="!replacementId">{{ tr('确认此段依赖所选陈述') }}</button>
                  </form>
                </template>
              </li>
            </ul>
            <p v-else class="hint">{{ tr(tab === 'character' ? '此时没有已记录的获知。' : tab === 'reader' ? '读到这里尚无已确认的揭示。' : '这段正文尚无已登记的设定依赖。') }}</p>
            <p v-if="tab === 'character' && dateUnknown" class="hint">{{ tr('有些经历未登记故事日期，无法判断此时人物是否知情或持何种态度。') }}</p>
            <p v-if="tab === 'character' && incomparable" class="hint">{{ tr('部分经历采用另一套历法，尚无法判定与此时点的先后。') }}</p>
            <button v-if="!editionId && recordCut === ''" type="button" :aria-expanded="openedForm" @click="openedForm = !openedForm">
              {{ openedForm ? tr('收起') : tr(tab === 'character' ? '记录人物认知' : tab === 'reader' ? '在此段登记揭示' : '登记用稿依赖') }}
            </button>
            <form v-if="!editionId && recordCut === '' && openedForm && statements.length" class="world-form" @submit.prevent="tab === 'character' ? saveKnowledge() : saveLink()">
              <label>{{ tr('所指陈述') }}<select v-model="selectedClaim" required><option value="">{{ tr('选择陈述') }}</option>
                <option v-for="row in statements" :key="row.id" :value="row.id">{{ claimLabel(row) }} · {{ claimAuthority(row) }}</option>
              </select></label>
              <template v-if="tab === 'character'">
                <WorldClockPicker v-model="learnedClock" :calendars="calendars" />
                <div class="world-fields">
                  <label>{{ tr('认知变化') }}<select v-model="knowledgeKind"><option value="known">{{ tr('获知说法') }}</option><option value="belief">{{ tr('改变态度') }}</option></select></label>
                  <label>{{ tr('发生的故事时点') }}<input v-model="learnedAt" type="number" step="1" :placeholder="tr('未知可留空')" /></label>
                </div>
                <div class="world-fields">
                  <label v-if="knowledgeKind === 'known'">{{ tr('获知途径') }}<select v-model="channel"><option v-for="(name, key) in channels" :key="key" :value="key">{{ tr(name) }}</option></select></label>
                  <label v-else>{{ tr('人物态度') }}<select v-model="belief"><option v-for="(name, key) in beliefs" :key="key" :value="key">{{ tr(name) }}</option></select></label>
                </div>
                <WorldKnowledgeSourceFields v-model:speaker-key="speakerKey" v-model:position="originPosition"
                  :book="book" :speakers="speakers" :heard="knowledgeKind === 'known' && channel === 'heard'" />
              </template>
              <label v-else-if="tab === 'reader'">{{ tr('揭示方式') }}<select v-model="disclosureKind"><option v-for="(name, key) in disclosureKinds" :value="key" :key="key">{{ tr(name) }}</option></select></label>
              <label v-else>{{ tr('用稿方式') }}<select v-model="useKind"><option v-for="(name, key) in useKinds" :value="key" :key="key">{{ tr(name) }}</option></select></label>
              <label v-if="tab === 'reader' && disclosureKind === 'reported-speech'">{{ tr('说话人') }}<select v-model="disclosureSpeaker" :aria-label="tr('说话人')">
                <option value="">{{ tr('未指明') }}</option>
                <option v-for="person in characters" :key="person.key" :value="person.key">{{ person.label }}</option>
              </select></label>
              <WorldPassageSourceFields v-if="tab === 'uses' && useKind === 'constraint-use'" v-model="rangeEndPosition" :book="book"
                chapter-label="约束结束章节" unit-label="约束结束段落（含）" empty-label="只约束当前段落" />
              <div v-if="tab === 'uses' && useKind === 'belief-use'" class="world-fields">
                <label>{{ tr('行动人物') }}<select v-model="actionActorKey">
                  <option value="">{{ tr('仅登记说法，人物未指定') }}</option>
                  <option v-for="person in characters" :key="person.key" :value="person.key">{{ person.label }}</option>
                </select></label>
                <WorldClockPicker v-if="actionActorKey" v-model="actionClock" :calendars="calendars" />
                <label v-if="actionActorKey">{{ tr('行动时的故事序号') }}<input v-model="actionTime" type="number" step="1" required /></label>
              </div>
              <small v-if="selected && invalidLink">{{ tr('此方式需要选择当前成立的正式事实。') }}</small>
              <button type="submit" :disabled="!selected || invalidLink || (tab === 'character' && !isInteger(learnedAt))">{{ tr('保存记录') }}</button>
            </form>
            <p v-else-if="openedForm && !loadingStatements && !error" class="hint">{{ tr('请先在「世界陈述」中登记一条事实或传闻。') }}</p>
          </template>
        </template>
      </fieldset>
      <p v-if="feedback" role="status">{{ feedback }}</p>
    </template>
    <p v-else-if="loadingStatements" class="hint">{{ tr('加载中…') }}</p>
    <p v-else-if="!error" class="hint">{{ tr('无法读取所选作品。') }}</p>
  </section>
</template>

<style scoped>
.world-model { display: grid; gap: .65rem; min-width: 0; }
.world-actions { display: flex; flex-wrap: wrap; gap: .4rem; }
.world-tabs { display: flex; flex-wrap: wrap; gap: .25rem; border-bottom: 1px solid var(--border); }
.world-model button { cursor: pointer; }
.world-tabs button { padding: .4rem .55rem; border: 0; background: transparent; color: var(--text-secondary); }
.world-tabs button[aria-pressed="true"] { background: var(--bg-hover); color: var(--text-primary); }
.world-model fieldset { display: grid; gap: .7rem; margin: 0; padding: 0; min-width: 0; border: 0; }
.world-model :deep(.world-form) { display: grid; gap: .7rem; margin: 0; }
.world-model :deep(.world-fields) { display: flex; flex-wrap: wrap; gap: .65rem; }
.world-model :deep(.world-fields > label) { flex: 1 1 11rem; }
.world-model :deep(label) { display: grid; gap: .2rem; min-width: 0; }
.world-model :deep(input), .world-model :deep(select), .world-model :deep(button) { font: inherit; border-radius: 3px; }
.world-model :deep(input), .world-model :deep(select), .world-model :deep(button:not([aria-pressed])) {
  box-sizing: border-box; min-width: 0; max-width: 100%; padding: .4rem .55rem;
  border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary);
}
.world-model :deep(button:not([aria-pressed])) { justify-self: start; }
.world-model :deep(button:disabled) { opacity: .55; cursor: default; }
.world-results { margin: 0; padding: 0; list-style: none; }
.world-results li { display: grid; padding: .45rem 0; overflow-wrap: anywhere; border-bottom: 1px solid var(--border); }
.world-model .hint, .world-results small { color: var(--text-secondary); }
.world-model p { margin: 0; }
</style>
