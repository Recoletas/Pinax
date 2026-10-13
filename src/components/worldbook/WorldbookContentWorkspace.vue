<script setup>
import { computed, nextTick, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { tr } from '../../i18n/index.js'
import { useWorldStore, worldbookEntryEditFingerprint } from '../../stores/worldStore.js'
import { buildGraph, entryCatDirOf, buildRelationChips, CAT_DIRS } from '../../services/worldbook/entryBrowserModel.js'
import { isMachineLedgerEntry } from '../../services/worldbook/entryTableColumns.js'
import { applyRelationRows, relationRowsFromEntry } from '../../services/worldbook/entryRelations.js'
import { renameEntryKeys } from '../../services/worldbook/entryProfileTemplates.js'
import { readEntryPanelDraft, saveEntryPanelDraft, clearEntryPanelDraft } from '../../services/worldbook/entryPanelDraft.js'
import { useWorldbookKnowledgeSearch } from '../../composables/useWorldbookKnowledgeSearch.js'
import EntryProfileEditor from './EntryProfileEditor.vue'
import StructuredSettingsWorkspace from './StructuredSettingsWorkspace.vue'
import EntryDataTable from '../knowledge/EntryDataTable.vue'
import ForeshadowLedgerTable from '../knowledge/ForeshadowLedgerTable.vue'
import GraphCanvas from './GraphCanvas.vue'

const props = defineProps({ worldbook: { type: Object, required: true }, compact: Boolean, focusEntry: Boolean, entryRequestId: { type: String, default: '' }, bookId: { type: String, default: '' }, initialEntryId: { type: String, default: '' }, initialMode: { type: String, default: 'detail' }, initialCategory: { type: String, default: '' }, reload: { type: Function, default: null } })
const emit = defineEmits(['navigation'])
const store = useWorldStore()
const category = ref(props.initialCategory)
const mode = ref(props.initialMode)
const selectedId = ref(props.initialEntryId)
const query = ref('')
const browseAll = ref(false)
const focusedDetail = computed(() => props.focusEntry && !browseAll.value && mode.value === 'detail')
const notice = ref('')
const pendingRelation = ref(null)
const relationTarget = ref('')
const busy = ref(false)
const draft = reactive({ id: '', worldbookId: '', name: '', content: '', fingerprint: '' })
const baseEditor = ref(null)
const table = ref(null)
const ledger = ref(null)
const bodyInput = ref(null)
const profileEditor = ref(null)
const profileOpen = ref(false)
const profileSaving = ref(false)
const profileDraft = ref(null)
const profileBaseline = ref('')
const retainedProfile = ref(null)
function profileChanged(value, scope) {
  if (scope?.entryId !== draft.id || scope?.scopeKey !== draft.worldbookId) return
  profileDraft.value = value
  if (!value && draft.id) clearEntryPanelDraft(draft.worldbookId, draft.id, 'workspace-profile')
  if (value && draft.id) saveEntryPanelDraft(draft.worldbookId, draft.id, 'workspace-profile', { baseline: profileBaseline.value, draft: value })
}
async function saveProfile(value) {
  if (busy.value || composing || !current.value || value.entryId !== draft.id || value.scopeKey !== draft.worldbookId) return
  const worldbookId = draft.worldbookId, entryId = draft.id
  if (worldbookEntryEditFingerprint(current.value) !== profileBaseline.value) { notice.value = tr('设定已有新版本，属性输入已保留。请载入最新内容后再整理。'); return }
  if (!await save()) return
  if (draft.worldbookId !== worldbookId || draft.id !== entryId) return
  busy.value = true; profileSaving.value = true
  try {
    const saved = await store.updateEntry(worldbookId, entryId, { profile: value.profile, ...(value.overwrite ? { content: value.content } : {}) }, { expectedFingerprint: draft.fingerprint })
    if (draft.worldbookId !== worldbookId || draft.id !== entryId) return
    draft.fingerprint = worldbookEntryEditFingerprint(saved)
    if (value.overwrite) draft.content = saved.content
    profileBaseline.value = draft.fingerprint
    profileDraft.value = null; retainedProfile.value = null
    profileEditor.value?.markSaved()
    clearEntryPanelDraft(worldbookId, entryId, 'workspace-profile')
    notice.value = ''; nextTick(resizeBody)
  } catch (error) { notice.value = String(error.message || error) }
  finally { busy.value = false; profileSaving.value = false }
}
let composing = false
let pendingSave = null
const entries = computed(() => (props.worldbook.entries || []).filter(entry => !isMachineLedgerEntry(entry)))
const categories = computed(() => [...new Set([...CAT_DIRS.filter(item => item !== '资料'), ...entries.value.map(entryCatDirOf)])])
const knowledge = useWorldbookKnowledgeSearch({ bookId: () => props.bookId, worldbook: () => props.worldbook, query, category })
const { searching, result: searchResult, error: searchError, hitIds, relatedIds, missingCount } = knowledge
const visible = computed(() => {
  if (searchResult.value) {
    const byId = new Map(entries.value.map(entry => [String(entry.id), entry]))
    return [...knowledge.visibleIds.value].map(id => byId.get(id)).filter(Boolean)
  }
  return entries.value.filter(entry => (!category.value || entryCatDirOf(entry) === category.value) && (!query.value || `${entry.name || ''}\n${entry.content || ''}`.toLocaleLowerCase().includes(query.value.toLocaleLowerCase())))
})
const current = computed(() => entries.value.find(entry => entry.id === selectedId.value))
const dirty = computed(() => Boolean(draft.id && (draft.name !== String(current.value?.name || '') || draft.content !== String(current.value?.content || ''))))
const graph = computed(() => buildGraph(props.worldbook))
const visibleIds = computed(() => new Set(visible.value.map(entry => entry.id)))
const highlightedIds = computed(() => searchResult.value ? hitIds.value : new Set(selectedId.value ? [selectedId.value] : []))
const searchErrorText = computed(() => {
  const code = searchError.value?.code
  if (code === 'NO_PROJECT_CONTEXT') return tr('这部作品尚未关联本地项目，仍可直接查找设定。')
  if (code === 'WORLD_CHANGED') return tr('设定已更新，请重新检索关联。')
  if (code === 'STALE_INDEX') return tr('本地索引与当前设定不同步，请同步后重新检索。')
  return searchError.value?.message || tr('关联检索暂不可用，仍可直接查找设定。')
})
const chips = computed(() => current.value ? buildRelationChips(current.value, entries.value).filter(chip => chip.resolved) : [])
const effectiveMode = computed(() => props.compact && mode.value === 'table' ? 'detail' : mode.value)

function loadDraft(entry) {
  if (draft.id !== (entry?.id || '') || draft.worldbookId !== props.worldbook.id) {
    const retained = entry && readEntryPanelDraft(props.worldbook.id, entry.id, 'workspace-profile')
    retainedProfile.value = retained?.draft || null
    profileDraft.value = retained?.draft || null
    profileBaseline.value = retained?.baseline || (entry ? worldbookEntryEditFingerprint(entry) : '')
    profileOpen.value = Boolean(retained)
  } else if (!profileDraft.value && !profileEditor.value?.hasPending?.()) profileBaseline.value = entry ? worldbookEntryEditFingerprint(entry) : ''
  draft.id = entry?.id || ''
  draft.worldbookId = props.worldbook.id
  draft.name = String(entry?.name || '')
  draft.content = String(entry?.content || '')
  draft.fingerprint = entry ? worldbookEntryEditFingerprint(entry) : ''
  const retained = entry && readEntryPanelDraft(props.worldbook.id, entry.id, 'workspace')
  if (retained?.draft) {
    draft.name = retained.draft.name; draft.content = retained.draft.content; draft.fingerprint = retained.baseline
    if (retained.baseline !== worldbookEntryEditFingerprint(entry)) notice.value = tr('条目已有新版本，保留了上次输入。')
  }
  nextTick(resizeBody)
}
function resizeBody() {
  const node = bodyInput.value
  if (!node) return
  node.style.height = 'auto'
  node.style.height = `${Math.max(180, node.scrollHeight)}px`
}
async function save() {
  if (pendingSave) return pendingSave
  if (composing) return false
  if (!dirty.value) return true
  if (!draft.name.trim()) { notice.value = tr('请填写名称，输入已保留。'); return false }
  const entry = current.value
  if (!entry || entry.id !== draft.id || props.worldbook.id !== draft.worldbookId) { notice.value = tr('条目已失效，输入已保留。'); return false }
  const target = { ...draft }
  busy.value = true
  pendingSave = (async () => {
    try {
      const saved = await store.updateEntry(target.worldbookId, target.id, { name: target.name.trim(), content: target.content, keys: renameEntryKeys({ keys: entry.keys, previousName: entry.name, nextName: target.name.trim() }) }, { expectedFingerprint: target.fingerprint })
      // Keep edits typed while an earlier save was in flight.
      if (draft.id === target.id && draft.worldbookId === target.worldbookId) {
        if (profileBaseline.value === target.fingerprint) profileBaseline.value = worldbookEntryEditFingerprint(saved)
        draft.fingerprint = worldbookEntryEditFingerprint(saved)
        if (draft.name === target.name) draft.name = saved.name
        if (draft.name === saved.name && draft.content === target.content) clearEntryPanelDraft(target.worldbookId, target.id, 'workspace')
        else saveEntryPanelDraft(target.worldbookId, target.id, 'workspace', { baseline: draft.fingerprint, draft: { name: draft.name, content: draft.content } })
      }
      notice.value = ''
      return true
    } catch (error) { notice.value = String(error?.message || tr('保存失败，输入已保留。')); return false }
    finally { busy.value = false; pendingSave = null }
  })()
  return pendingSave
}
async function flushAll() {
  if (busy.value && !pendingSave) return false
  if (profileDraft.value || profileEditor.value?.hasPending?.()) { notice.value = tr('属性修改尚未保存，请先保存属性或取消修改。'); profileOpen.value = true; return false }
  if (pendingRelation.value) { notice.value = tr('请先确认或取消这条关联。'); return false }
  if (composing) { notice.value = tr('请先完成输入。'); return false }
  const guards = await Promise.all([table.value?.flushAll?.() ?? true, ledger.value?.flushAll?.() ?? true, baseEditor.value?.flushAll?.() ?? true])
  if (!guards.every(Boolean)) { notice.value = tr('请先保存或取消当前表格中的修改。'); return false }
  if (!await save()) return false
  return dirty.value ? save() : true
}
async function selectEntry(entry, event) {
  const scope = { bookId: props.bookId, worldbookId: props.worldbook.id }
  const focusTarget = event?.currentTarget
  if (!entry || !await flushAll()) { emit('navigation', { entryId: selectedId.value, settingsView: mode.value, settingsCategory: category.value }); return false }
  if (scope.bookId !== props.bookId || scope.worldbookId !== props.worldbook.id) return false
  const target = entries.value.find(item => item.id === entry.id)
  if (!target) { notice.value = tr('条目已失效，输入已保留。'); return false }
  selectedId.value = target.id
  loadDraft(target)
  if (props.compact) mode.value = 'detail'
  if (focusTarget) nextTick(() => { if (focusTarget.isConnected) focusTarget.focus({ preventScroll: true }) })
  return true
}
async function searchRelations(event) {
  if (event?.isComposing || event?.keyCode === 229 || !query.value.trim() || searching.value) return
  event?.preventDefault()
  const scope = { bookId: props.bookId, worldbookId: props.worldbook.id, query: query.value, category: category.value }
  if (!await flushAll()) return
  if (scope.bookId !== props.bookId || scope.worldbookId !== props.worldbook.id || scope.query !== query.value || scope.category !== category.value) return
  await knowledge.run()
}
async function chooseCategory(value) {
  if (!await flushAll()) return
  category.value = value
  query.value = ''
  if (['base', 'foreshadow'].includes(value)) return
  if (!visible.value.some(entry => entry.id === selectedId.value)) {
    selectedId.value = visible.value[0]?.id || ''
    loadDraft(current.value)
  }
}
async function chooseMode(value) {
  if (await flushAll()) { mode.value = value; nextTick(resizeBody) }
}
async function proposeRelation({ fromId, toId }) {
  if (!await flushAll()) return
  const from = entries.value.find(entry => entry.id === fromId)
  const to = entries.value.find(entry => entry.id === toId)
  if (!from || !to || from.id === to.id) return
  pendingRelation.value = { from: JSON.parse(JSON.stringify(from)), toId: to.id, toName: to.name, worldbookId: props.worldbook.id }
}
async function confirmRelation() {
  const pending = pendingRelation.value
  if (!pending || busy.value || props.worldbook.id !== pending.worldbookId) return
  if (!entries.value.some(entry => entry.id === pending.toId)) { notice.value = tr('关联对象已不存在，请取消这次关联。'); return }
  busy.value = true
  try {
    const rows = relationRowsFromEntry(pending.from)
    if (!rows.some(row => row.to === pending.toId)) rows.push({ to: pending.toId, type: '', stance: '', covert: false, weight: 2, src: 'declared' })
    await store.updateEntry(pending.worldbookId, pending.from.id, applyRelationRows(pending.from, rows), { expectedFingerprint: worldbookEntryEditFingerprint(pending.from) })
    pendingRelation.value = null; relationTarget.value = ''; notice.value = ''
    if (current.value?.id === pending.from.id && !dirty.value) loadDraft(current.value)
  } catch (error) { notice.value = String(error.message || error) }
  finally { busy.value = false }
}
async function addEntry() {
  if (!await flushAll() || busy.value) return
  const worldbookId = props.worldbook.id
  busy.value = true
  try {
    const type = { '人物': 'character', '地理': 'location', '势力': 'organization', '编年': 'event' }[category.value] || 'general'
    const entry = await store.addEntry(worldbookId, { name: type === 'character' ? tr('新人物') : tr('新设定'), type, content: '', keys: [], ...(category.value ? { cat: category.value } : {}) })
    if (props.worldbook.id !== worldbookId) return
    selectedId.value = entry.id
    mode.value = 'detail'
    loadDraft(entry)
    nextTick(() => document.querySelector('.worldbook-content-workspace input[data-test="setting-entry-name"]')?.focus())
  } catch (error) { notice.value = String(error.message || error) }
  finally { busy.value = false }
}
watch(() => props.worldbook.id, () => {
  category.value = props.initialCategory; mode.value = props.initialMode; selectedId.value = props.initialEntryId || entries.value[0]?.id || ''; query.value = ''; notice.value = ''; loadDraft(current.value)
}, { immediate: true })
watch(() => props.entryRequestId, async id => {
  if (!id) return
  const target = entries.value.find(entry => entry.id === props.initialEntryId)
  if (target && await selectEntry(target)) { browseAll.value = false; category.value = ''; mode.value = 'detail'; query.value = ''; nextTick(resizeBody) }
})
watch(() => props.initialEntryId, id => { browseAll.value = false; if (id && id !== selectedId.value) void selectEntry(entries.value.find(entry => entry.id === id)) })
watch(() => current.value, (entry, previous) => {
  if (!entry) { if (!draft.id) loadDraft(null); return }
  if (entry.id === draft.id && draft.name === String(previous?.name || '') && draft.content === String(previous?.content || '')) loadDraft(entry)
})
watch([selectedId, mode, category], () => emit('navigation', { entryId: selectedId.value, settingsView: mode.value, settingsCategory: category.value }))
watch(() => [draft.name, draft.content], () => {
  if (draft.id && dirty.value) saveEntryPanelDraft(draft.worldbookId, draft.id, 'workspace', { baseline: draft.fingerprint, draft: { name: draft.name, content: draft.content } })
}, { flush: 'post' })
async function refreshFromStorage() {
  await props.reload?.()
  loadDraft(current.value); notice.value = ''
}
async function cancelProfile() {
  if (busy.value || !window.confirm(tr('放弃未保存的属性修改？正文保持不变。'))) return
  clearEntryPanelDraft(draft.worldbookId, draft.id, 'workspace-profile')
  retainedProfile.value = null; profileDraft.value = null
  profileBaseline.value = current.value ? worldbookEntryEditFingerprint(current.value) : ''
  await nextTick(); profileEditor.value?.reset()
  notice.value = ''
}
async function reloadEntry() {
  if (busy.value || !window.confirm(tr('载入最新内容会替换当前输入，是否继续？'))) return
  clearEntryPanelDraft(draft.worldbookId, draft.id, 'workspace')
  clearEntryPanelDraft(draft.worldbookId, draft.id, 'workspace-profile')
  retainedProfile.value = null; profileDraft.value = null
  await props.reload?.()
  loadDraft(current.value); notice.value = ''
  await nextTick(); profileEditor.value?.reset()
}
function beforeUnload(event) {
  if (!profileDraft.value && !profileEditor.value?.hasPending?.() && !dirty.value && !busy.value && !table.value?.hasPending?.() && !ledger.value?.hasPending?.() && !pendingRelation.value) return
  event.preventDefault(); event.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
defineExpose({ flushAll })
</script>

<template>
  <section class="worldbook-content-workspace" :class="{ 'is-compact': compact, 'is-focused-detail': focusedDetail }" data-test="worldbook-content-workspace">
    <nav class="setting-content-directory" :aria-label="tr('设定目录')">
      <button type="button" :class="{ active: category === '' }" @click="chooseCategory('')">{{ tr('全部设定') }}<span>{{ entries.length }}</span></button>
      <button v-for="item in categories" :key="item" type="button" :class="{ active: category === item }" @click="chooseCategory(item)">{{ tr({ '地理': '地点', '编年': '历史', '设定': '世界规则' }[item] || item) }}<span>{{ entries.filter(entry => entryCatDirOf(entry) === item).length }}</span></button>
      <div class="setting-directory-secondary">
        <button type="button" :class="{ active: category === 'foreshadow' }" @click="chooseCategory('foreshadow')">{{ tr('伏笔') }}</button>
        <button type="button" :class="{ active: category === 'base' }" @click="chooseCategory('base')">{{ tr('创作基调') }}</button>
      </div>
    </nav>
    <main class="setting-content-main">
      <div v-if="pendingRelation" class="setting-relation-confirm" role="status"><span>{{ pendingRelation.from.name }} → {{ pendingRelation.toName }}</span><button type="button" :disabled="busy" @click="confirmRelation">{{ tr('添加关联') }}</button><button type="button" :disabled="busy" @click="pendingRelation = null; notice = ''">{{ tr('取消') }}</button></div>
      <p v-if="notice" class="setting-save-notice" role="alert">{{ notice }}<button v-if="dirty" type="button" @click="save">{{ tr('重试保存') }}</button><button v-if="(dirty || profileDraft) && reload" type="button" @click="reloadEntry">{{ tr('载入最新') }}</button></p>
      <StructuredSettingsWorkspace v-show="category === 'base'" ref="baseEditor" :worldbook="worldbook" :compact="compact" embedded />
      <ForeshadowLedgerTable v-show="category === 'foreshadow'" ref="ledger" :worldbook="worldbook" @reload="refreshFromStorage" />
      <div v-show="!['base', 'foreshadow'].includes(category)" class="setting-entity-workspace">
        <header class="setting-content-toolbar">
          <button v-if="focusedDetail" type="button" @click="browseAll = true">{{ tr('浏览设定') }}</button>
          <div v-if="!focusedDetail" class="setting-search">
            <input v-model="query" type="search" :placeholder="tr('查找设定…')" :aria-label="tr('查找设定')" @keydown.enter="searchRelations" />
            <button type="button" class="setting-search-go" :disabled="searching || busy || !query.trim()" :title="tr('检索本书设定及相关人物、地点与事件')" @click="searchRelations">{{ tr('检索关联') }}</button>
          </div>
          <div v-if="!compact" class="setting-view-switch" :aria-label="tr('设定查看方式')">
            <button v-for="item in [{ id: 'detail', title: '详情' }, { id: 'table', title: '表格' }, { id: 'graph', title: '关系图' }]" :key="item.id" type="button" :aria-pressed="mode === item.id" :class="{ active: mode === item.id }" @click="chooseMode(item.id)">{{ tr(item.title) }}</button>
          </div>
          <button type="button" class="setting-add" :disabled="busy" @click="addEntry">{{ tr('新建') }}</button>
        </header>
        <div v-if="searching || searchResult || searchError" class="setting-search-status" :class="{ 'is-error': searchError }" :role="searchError ? 'alert' : 'status'" data-test="setting-search-status">
          <span v-if="searching">{{ tr('正在检索关联…') }}</span>
          <span v-else-if="searchError">{{ searchErrorText }}</span>
          <template v-else>
            <span>{{ tr('找到 {hits} 项，关联 {related} 项', { hits: hitIds.size, related: relatedIds.size }) }}</span>
            <span v-if="missingCount">{{ tr('有 {count} 项不在当前设定中，请同步后重新检索。', { count: missingCount }) }}</span>
          </template>
          <button type="button" @click="knowledge.reset">{{ searching ? tr('取消') : tr('返回筛选') }}</button>
        </div>
        <div v-show="effectiveMode === 'detail'" class="setting-details-layout">
          <nav class="setting-entry-list" :aria-label="tr('设定条目')">
            <!-- Let the guarded selection save before changing focus; blur notices can otherwise move the clicked row. -->
            <button v-for="entry in visible" :key="entry.id" type="button" :class="{ active: entry.id === selectedId }" :aria-current="entry.id === selectedId ? 'true' : undefined" @pointerdown.prevent @click="selectEntry(entry, $event)"><span>{{ entry.name || tr('未命名条目') }}</span><small v-if="relatedIds.has(String(entry.id))">{{ tr('关联') }}</small></button>
            <p v-if="!visible.length">{{ tr('暂无匹配设定') }}</p>
          </nav>
          <article v-if="draft.id" class="setting-entry-document">
            <input v-model="draft.name" :readonly="profileSaving" data-test="setting-entry-name" class="setting-entry-title" :aria-label="tr('设定名称')" @blur="save" @keydown.enter.prevent="save" @compositionstart="composing = true" @compositionend="composing = false" />
            <textarea ref="bodyInput" v-model="draft.content" :readonly="profileSaving" data-test="setting-entry-content" :aria-label="tr('设定正文')" :placeholder="tr('写下这项设定…')" @input="resizeBody" @blur="save" @keydown.ctrl.s.prevent="save" @keydown.meta.s.prevent="save" @compositionstart="composing = true" @compositionend="composing = false"></textarea>
            <details :open="profileOpen" class="setting-entry-properties" @toggle="profileOpen = $event.target.open">
              <summary>{{ tr('属性与模板') }}<small v-if="profileDraft"> · {{ tr('未保存') }}</small></summary>
              <EntryProfileEditor v-if="current" v-show="profileOpen" :key="`${worldbook.id}:${draft.id}`" ref="profileEditor" :entry="current" :content="draft.content" :initial-profile="retainedProfile" :scope-key="worldbook.id" :saving="busy" compact-fields @change="profileChanged" @save="saveProfile" />
              <button v-if="profileDraft" type="button" @click="cancelProfile">{{ tr('取消属性修改') }}</button>
            </details>
            <footer class="setting-related"><span>{{ tr('相关设定') }}</span><button v-for="chip in chips" :key="chip.ref" type="button" @pointerdown.prevent @click="selectEntry(chip.entry, $event)">{{ chip.entry.title }}</button><select v-model="relationTarget" :aria-label="tr('关联设定')"><option value="">{{ tr('选择关联对象') }}</option><option v-for="entry in entries.filter(item => item.id !== selectedId)" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select><button v-if="relationTarget" type="button" @click="proposeRelation({ fromId: selectedId, toId: relationTarget })">{{ tr('关联') }}</button></footer>
            <span v-if="busy" class="setting-save-state" role="status">{{ tr('保存中…') }}</span>
          </article>
          <div v-else class="setting-empty"><h2>{{ tr('还没有设定') }}</h2><p>{{ tr('新建人物或世界设定，也可以在创作基调里自由整理想法。') }}</p><button type="button" @click="addEntry">{{ tr('新建设定') }}</button></div>
        </div>
        <EntryDataTable v-show="effectiveMode === 'table'" ref="table" :worldbook="worldbook" scope="all" :filters="searchResult ? {} : { cat: category, q: query }" :visible-ids="searchResult ? visibleIds : null" :selected-id="selectedId" embedded @reload="refreshFromStorage" @select="selectEntry" @open="async entry => { if (await selectEntry(entry)) await chooseMode('detail') }" />
        <aside v-if="effectiveMode === 'graph' && current" class="setting-graph-selection">
          <strong>{{ current.name }}</strong><span>{{ current.content || tr('尚未填写内容') }}</span><button type="button" @click="chooseMode('detail')">{{ tr('编辑设定') }}</button>
        </aside>
        <GraphCanvas v-show="effectiveMode === 'graph'" :graph="graph" :visible-ids="visibleIds" :highlight-ids="highlightedIds" :cat="category" @update:cat="chooseCategory" @select="selectEntry" @create-edge="proposeRelation" />
      </div>
    </main>
  </section>
</template>
<style scoped>
.worldbook-content-workspace.is-focused-detail { grid-template-columns: minmax(0, 1fr); }
.is-focused-detail .setting-content-directory, .is-focused-detail .setting-entry-list { display: none; }
.is-focused-detail .setting-details-layout { grid-template-columns: minmax(0, 1fr); }
.is-focused-detail .setting-content-toolbar { justify-content: flex-end; }
.is-focused-detail .setting-content-toolbar > button:first-child { margin-right: auto; }
.setting-entry-properties { margin-top: 24px; border-top: 1px solid var(--hairline-soft); padding-top: 12px; }
.setting-entry-properties summary { color: var(--text-secondary); font-size: 13px; cursor: pointer; }
.setting-entry-properties > button { margin-top: 8px; border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; }
.setting-entry-properties :deep(.entry-profile-editor) { border-top: 0; }
.worldbook-content-workspace { display: grid; grid-template-columns: 176px minmax(0, 1fr); min-height: 560px; height: 100%; color: var(--text-primary); background: var(--surface-workbench); }
.setting-content-directory { padding: 22px 12px; border-right: 1px solid var(--hairline-soft); }
.setting-content-directory button, .setting-entry-list button { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 10px 12px; border: 0; border-radius: 4px; background: transparent; color: var(--text-secondary); font: inherit; text-align: left; cursor: pointer; }
.setting-content-directory button.active, .setting-entry-list button.active { background: color-mix(in srgb, var(--accent) 19%, transparent); color: var(--text-primary); font-weight: 600; }
.setting-content-directory span { color: var(--text-muted); font-size: 12px; font-weight: 400; }
.setting-directory-secondary { margin-top: 24px; padding-top: 14px; border-top: 1px solid var(--hairline-soft); }
.setting-content-main { min-width: 0; min-height: 0; }
.setting-entity-workspace { display: flex; flex-direction: column; min-height: 560px; height: 100%; }
.setting-content-toolbar { display: flex; align-items: center; gap: 16px; padding: 18px 24px; border-bottom: 1px solid var(--hairline-soft); }
.setting-content-toolbar input { flex: 1; min-width: 80px; border: 0; background: transparent; color: var(--text-primary); font: inherit; outline-offset: 4px; }
.setting-search { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.setting-search input { width: 0; }
.setting-search .setting-search-go { flex-shrink: 0; color: var(--accent); }
.setting-search-go:disabled { color: var(--text-muted); cursor: default; }
.setting-search-status { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 14px; padding: 10px 24px; border-bottom: 1px solid var(--hairline-soft); color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
.setting-search-status button { margin-left: auto; flex-shrink: 0; border: 0; padding: 4px 0; background: transparent; color: var(--accent); font: inherit; cursor: pointer; }
.setting-search-status.is-error { color: var(--text-primary); }
.setting-entry-list button { gap: 8px; }
.setting-entry-list button span { min-width: 0; overflow-wrap: anywhere; }
.setting-entry-list small { flex-shrink: 0; color: var(--text-muted); font-size: 11px; font-weight: 400; }
.setting-view-switch { display: flex; gap: 4px; }
.setting-content-toolbar button, .setting-related button, .setting-save-notice button, .setting-empty button { border: 0; border-radius: 4px; padding: 7px 10px; background: transparent; color: var(--text-secondary); font: inherit; cursor: pointer; }
.setting-view-switch button.active { background: var(--bg-secondary); color: var(--text-primary); }
.setting-content-toolbar .setting-add { color: var(--accent); }
.setting-details-layout { display: grid; grid-template-columns: 170px minmax(0, 1fr); flex: 1; min-height: 0; }
.setting-entry-list { padding: 18px 12px; border-right: 1px solid var(--hairline-soft); overflow: auto; }
.setting-entry-list p { color: var(--text-muted); font-size: 13px; }
.setting-entry-document { padding: 36px clamp(24px, 5vw, 64px); min-width: 0; overflow: auto; }
.setting-entry-title { display: block; width: 100%; border: 0; background: transparent; color: var(--text-primary); font: 600 25px/1.5 var(--font-sans); margin-bottom: 24px; }
.setting-entry-document textarea { width: 100%; min-height: 180px; resize: none; overflow: hidden; border: 0; background: transparent; color: var(--text-primary); font: 16px/1.9 var(--font-sans); }
.setting-entry-document input:focus, .setting-entry-document textarea:focus { outline: none; }
.setting-entry-document input:focus-visible, .setting-entry-document textarea:focus-visible { outline: 1px solid var(--accent); outline-offset: 6px; }
.setting-related { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; border-top: 1px solid var(--hairline-soft); margin-top: 32px; padding-top: 14px; font-size: 13px; }
.setting-related select { max-width: 180px; padding: 6px 8px; color: var(--text-secondary); background: transparent; border: 0; font: inherit; }
.setting-relation-confirm { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 12px 24px; background: var(--bg-secondary); }
.setting-relation-confirm button { color: var(--accent); border: 0; background: transparent; padding: 6px 8px; font: inherit; cursor: pointer; }
.setting-related span, .setting-save-state { color: var(--text-muted); }
.setting-save-notice { margin: 0; padding: 12px 24px; color: var(--text-primary); background: var(--bg-secondary); }
.setting-empty { padding: 40px 32px; }
.setting-empty h2 { font-size: 20px; }
.setting-empty p { max-width: 340px; line-height: 1.8; color: var(--text-muted); }
.setting-content-main :deep(.entry-data-table), .setting-content-main :deep(.flt), .setting-content-main :deep(.graph-canvas) { border: 0; border-radius: 0; background: transparent; min-height: 420px; }
.setting-content-main :deep(.edt-toolbar) { padding: 10px 18px; border-bottom: 1px solid var(--hairline-soft); }
.setting-content-main :deep(.edt-title), .setting-content-main :deep(.edt-filter), .setting-content-main :deep(.edt-axis), .setting-content-main :deep([data-test="edt-add-character"]) { display: none; }
.setting-graph-selection { display: flex; align-items: center; gap: 14px; padding: 14px 24px; border-bottom: 1px solid var(--hairline-soft); font-size: 13px; }
.setting-graph-selection span { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--text-muted); }
.setting-graph-selection button { border: 0; background: transparent; color: var(--accent); font: inherit; cursor: pointer; flex-shrink: 0; }
.is-compact { display: flex; flex-direction: column; min-height: 100%; }
.is-compact .setting-content-directory { display: flex; gap: 4px; overflow: auto; padding: 12px; border-right: 0; border-bottom: 1px solid var(--hairline-soft); }
.is-compact .setting-content-directory button { width: auto; flex-shrink: 0; gap: 12px; }
.is-compact .setting-directory-secondary { display: flex; margin: 0; padding: 0; border: 0; }
.is-compact .setting-details-layout { display: flex; flex-direction: column; }
.is-compact .setting-entry-list { display: flex; overflow: auto; padding: 10px 12px; border: 0; }
.is-compact .setting-entry-list button { width: auto; flex-shrink: 0; }
.is-compact .setting-entry-document { padding: 24px; }
.is-compact .setting-content-toolbar { padding: 12px 24px; gap: 8px; }
.is-compact .setting-search-status { padding: 8px 24px; }
@media (max-width: 680px) { .worldbook-content-workspace:not(.is-compact) { display: flex; flex-direction: column; height: auto; } .setting-content-directory { flex: none; } .setting-content-directory button, .setting-entry-list button { min-height: 40px; align-self: flex-start; } .setting-entry-list { flex: none; } .setting-content-directory { display: flex; flex-wrap: wrap; gap: 4px; padding: 12px; border-right: 0; } .setting-content-directory button { width: auto; gap: 8px; } .setting-directory-secondary { display: flex; margin: 0; padding: 0; border: 0; } .setting-content-toolbar { flex-wrap: wrap; gap: 8px; padding: 12px; } .setting-search { flex-basis: 100%; } .setting-search-status { padding: 8px 12px; } .setting-details-layout { grid-template-columns: minmax(0, 1fr); } .setting-entry-list { display: flex; overflow: auto; padding: 8px 12px; border: 0; } .setting-entry-list button { width: auto; flex-shrink: 0; } .setting-entry-document { padding: 24px; } }
</style>
