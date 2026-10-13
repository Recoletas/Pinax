<script setup>
import { computed, defineAsyncComponent, nextTick, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue'
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
import SettingEntryManagement from './SettingEntryManagement.vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { settingCategoryLabel, settingTypeForCategory, settingDeletionImpact } from '../../services/worldbook/settingWorkspaceModel.js'
const CreateDialog = defineAsyncComponent(() => import('../workbench/DirectoryCreateDialog.vue'))

const props = defineProps({ worldbook: { type: Object, required: true }, compact: Boolean, focusEntry: Boolean, entryRequestId: { type: String, default: '' }, bookId: { type: String, default: '' }, initialEntryId: { type: String, default: '' }, initialMode: { type: String, default: 'detail' }, initialCategory: { type: String, default: '' }, reload: { type: Function, default: null } })
const emit = defineEmits(['navigation', 'expand'])
const store = useWorldStore()
const category = ref(props.initialCategory)
const mode = ref(props.initialMode)
const selectedId = ref(props.initialEntryId)
const query = ref('')
const graphCategory = ref('')
const inspectorTab = ref(props.initialMode === 'detail' ? 'browse' : props.initialMode)
const inspectorOpen = ref(false)
const management = ref(null)
const managementDraft = ref(null)
const createRequest = ref(null)
const deleteDialog = ref(null)
const deleteRequest = ref(null)
const titleInput = ref(null)
const inspectorTabs = computed(() => [
  { id: 'browse', title: settingCategoryLabel(category.value), icon: 'list' },
  { id: 'table', title: '表格', icon: 'grid' },
  { id: 'graph', title: '关系', icon: 'network' },
  { id: 'manage', title: '管理', icon: 'settings' }
])
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
const effectiveMode = computed(() => mode.value)

function loadDraft(entry) {
  if (draft.id !== (entry?.id || '')) managementDraft.value = null
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
  if (createRequest.value || deleteRequest.value) { notice.value = tr('请先完成或关闭当前窗口。'); return false }
  if (managementDraft.value || management.value?.hasPending?.()) { inspectorTab.value = 'manage'; inspectorOpen.value = true; notice.value = tr('管理修改尚未保存，请先保存或取消。'); return false }
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
  mode.value = 'detail'
  if (category.value && entryCatDirOf(target) !== category.value) { category.value = entryCatDirOf(target); query.value = '' }
  inspectorOpen.value = false
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
  if (await flushAll()) { mode.value = value; if (value !== 'detail') { inspectorTab.value = value; emit('expand') }; inspectorOpen.value = false; nextTick(resizeBody) }
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
  createRequest.value = { type: 'entry', bookId: props.bookId, worldbookId: props.worldbook.id, path: settingCategoryLabel(category.value), initialType: settingTypeForCategory(category.value) }
}
async function created(resources) {
  const target = resources?.[0], scopeId = createRequest.value?.worldbookId
  createRequest.value = null
  if (!target || scopeId !== props.worldbook.id || target.worldbookId !== scopeId) return
  await nextTick()
  if (scopeId !== props.worldbook.id) return
  const entry = entries.value.find(item => String(item.id) === target.id)
  if (!entry) { notice.value = tr('设定已创建，请刷新后打开。'); return }
  category.value = entryCatDirOf(entry); query.value = ''; mode.value = 'detail'; selectedId.value = entry.id
  loadDraft(entry); inspectorTab.value = 'browse'; inspectorOpen.value = false
  await nextTick(); bodyInput.value?.focus()
}
async function saveManagement() {
  const pending = managementDraft.value
  if (!pending || busy.value || !current.value || pending.entryId !== draft.id) return
  if (worldbookEntryEditFingerprint(current.value) !== pending.baseline) { notice.value = tr('设定已有新版本，管理输入已保留。'); return }
  const worldbookId = props.worldbook.id, entryId = draft.id
  if (!await save() || props.worldbook.id !== worldbookId || draft.id !== entryId) return
  busy.value = true
  try {
    const saved = await store.updateEntry(worldbookId, entryId, pending.updates, { expectedFingerprint: draft.fingerprint })
    if (props.worldbook.id !== worldbookId || draft.id !== entryId) return
    managementDraft.value = null; management.value?.reset(saved)
    loadDraft(saved); category.value = entryCatDirOf(saved); notice.value = ''
  } catch (error) { notice.value = String(error.message || error) }
  finally { busy.value = false }
}
async function copyEntry() {
  if (!await flushAll() || !current.value || busy.value) return
  const worldbookId = props.worldbook.id
  const original = JSON.parse(JSON.stringify(current.value))
  let name = `${original.name} ${tr('副本')}`, index = 2
  while (entries.value.some(entry => entry.name === name)) name = `${original.name} ${tr('副本')} ${index++}`
  busy.value = true
  try {
    const entry = await store.addEntry(worldbookId, { ...original, name, content: draft.content, keys: renameEntryKeys({ keys: original.keys, previousName: original.name, nextName: name }), metadata: { ...original.metadata, importSource: 'manual', structuredSettingRef: '', structuredCharacterKey: '', structuredCharacterSection: '', importKey: '' } })
    if (props.worldbook.id !== worldbookId) return
    await nextTick(); if (props.worldbook.id !== worldbookId) return; selectedId.value = entry.id; loadDraft(entry); mode.value = 'detail'; notice.value = ''
  } catch (error) { notice.value = String(error.message || error) }
  finally { busy.value = false }
}
async function requestDelete() {
  if (!await flushAll() || !current.value) return
  notice.value = ''
  deleteRequest.value = { worldbookId: props.worldbook.id, revision: props.worldbook.updatedAt, placeImpact: store.getPlaceDeleteImpact(props.worldbook.id, current.value.id), entry: JSON.parse(JSON.stringify(current.value)), impact: settingDeletionImpact(entries.value, current.value.id) }
  await nextTick(); deleteDialog.value?.showModal()
}
function cancelDelete() { if (!busy.value) { deleteDialog.value?.close(); deleteRequest.value = null; nextTick(() => management.value?.$el.querySelector('button')?.focus()) } }
async function confirmDelete() {
  const target = deleteRequest.value
  if (!target || busy.value || target.worldbookId !== props.worldbook.id) return
  busy.value = true
  try {
    await store.deleteEntry(target.worldbookId, target.entry.id, { expectedFingerprint: worldbookEntryEditFingerprint(target.entry), expectedWorldbookRevision: target.revision })
    if (target.worldbookId !== props.worldbook.id) return
    clearEntryPanelDraft(target.worldbookId, target.entry.id, 'workspace'); clearEntryPanelDraft(target.worldbookId, target.entry.id, 'workspace-profile')
    deleteDialog.value?.close(); deleteRequest.value = null; managementDraft.value = null
    await nextTick()
    if (props.worldbook.id !== target.worldbookId) return
    selectedId.value = visible.value.find(entry => entry.id !== target.entry.id)?.id || ''
    loadDraft(current.value); mode.value = 'detail'; inspectorTab.value = 'browse'; notice.value = ''
  } catch (error) { notice.value = String(error.message || error) }
  finally { busy.value = false }
}
function selectInspector(value) { inspectorTab.value = value; inspectorOpen.value = true }
watch(() => props.worldbook.id, () => {
  selectedId.value = props.initialEntryId || entries.value[0]?.id || ''; category.value = props.initialCategory || (current.value ? entryCatDirOf(current.value) : ''); mode.value = props.initialMode; query.value = ''; notice.value = ''; loadDraft(current.value)
}, { immediate: true })
watch(() => props.entryRequestId, async id => {
  if (!id) return
  const target = entries.value.find(entry => entry.id === props.initialEntryId)
  if (target && await selectEntry(target)) { category.value = entryCatDirOf(target); mode.value = 'detail'; query.value = ''; nextTick(resizeBody) }
})
watch(() => props.initialEntryId, id => { if (id && id !== selectedId.value) void selectEntry(entries.value.find(entry => entry.id === id)) })
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
  await nextTick(); profileEditor.value?.reset(); management.value?.reset()
}
function beforeUnload(event) {
  if (!managementDraft.value && !createRequest.value && !deleteRequest.value && !profileDraft.value && !profileEditor.value?.hasPending?.() && !dirty.value && !busy.value && !table.value?.hasPending?.() && !ledger.value?.hasPending?.() && !pendingRelation.value) return
  event.preventDefault(); event.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => { deleteDialog.value?.close(); window.removeEventListener('beforeunload', beforeUnload) })
defineExpose({ flushAll })
</script>

<template>
  <section class="worldbook-content-workspace" :class="{ 'is-compact': compact, 'inspector-open': inspectorOpen }" data-test="worldbook-content-workspace">
    <main class="setting-content-main">
      <header class="setting-content-toolbar">
        <select :value="['base', 'foreshadow'].includes(category) ? category : 'entries'" :aria-label="tr('设定内容')" @change="chooseCategory($event.target.value === 'entries' ? (current ? entryCatDirOf(current) : '') : $event.target.value)"><option value="entries">{{ tr('设定') }}</option><option value="base">{{ tr('创作基调') }}</option><option value="foreshadow">{{ tr('伏笔') }}</option></select>
        <span class="setting-workspace-context">{{ ['base', 'foreshadow'].includes(category) ? '' : tr(settingCategoryLabel(current ? entryCatDirOf(current) : category)) }}</span>
        <button v-if="mode !== 'detail'" type="button" class="control-quiet" @click="chooseMode('detail')"><WorkbenchIcon name="arrow-left" :size="16" />{{ tr('返回正文') }}</button>
        <button type="button" class="control-quiet setting-add" :disabled="busy" @click="addEntry"><WorkbenchIcon name="plus" :size="16" />{{ tr('新建设定') }}</button>
        <button type="button" class="control-quiet setting-inspector-toggle" :aria-expanded="inspectorOpen" :aria-label="tr('设定工具')" @click="inspectorOpen = !inspectorOpen"><WorkbenchIcon name="settings" :size="18" /></button>
      </header>
      <div v-if="pendingRelation" class="setting-relation-confirm" role="status"><span>{{ pendingRelation.from.name }} → {{ pendingRelation.toName }}</span><button type="button" :disabled="busy" @click="confirmRelation">{{ tr('添加关联') }}</button><button type="button" :disabled="busy" @click="pendingRelation = null; notice = ''">{{ tr('取消') }}</button></div>
      <p v-if="notice" class="setting-save-notice" role="alert">{{ notice }}<button v-if="dirty" type="button" @click="save">{{ tr('重试保存') }}</button><button v-if="(dirty || profileDraft || managementDraft) && reload" type="button" @click="reloadEntry">{{ tr('载入最新') }}</button></p>
      <StructuredSettingsWorkspace v-show="category === 'base'" ref="baseEditor" :worldbook="worldbook" :compact="compact" embedded />
      <ForeshadowLedgerTable v-show="category === 'foreshadow'" ref="ledger" :worldbook="worldbook" @reload="refreshFromStorage" />
      <div v-show="!['base', 'foreshadow'].includes(category)" class="setting-entity-workspace">
        <div v-show="effectiveMode === 'detail'" class="setting-details-layout">
          <article v-if="draft.id" class="setting-entry-document">
            <input ref="titleInput" v-model="draft.name" :readonly="profileSaving" data-test="setting-entry-name" class="setting-entry-title" :aria-label="tr('设定名称')" @blur="save" @keydown.enter.prevent="bodyInput?.focus()" @compositionstart="composing = true" @compositionend="composing = false" />
            <textarea ref="bodyInput" v-model="draft.content" :readonly="profileSaving" data-test="setting-entry-content" :aria-label="tr('设定正文')" :placeholder="tr('写下这项设定…')" @input="resizeBody" @blur="save" @keydown.ctrl.s.prevent="save" @keydown.meta.s.prevent="save" @compositionstart="composing = true" @compositionend="composing = false"></textarea>
            <details :open="profileOpen" class="setting-entry-properties" @toggle="profileOpen = $event.target.open">
              <summary>{{ tr('属性与模板') }}<small v-if="profileDraft"> · {{ tr('未保存') }}</small></summary>
              <EntryProfileEditor v-if="current" v-show="profileOpen" :key="`${worldbook.id}:${draft.id}`" ref="profileEditor" :entry="current" :content="draft.content" :initial-profile="retainedProfile" :scope-key="worldbook.id" :saving="busy" compact-fields :free-fields="(current.kind || current.type) !== 'character'" @change="profileChanged" @save="saveProfile" />
              <button v-if="profileDraft" type="button" @click="cancelProfile">{{ tr('取消属性修改') }}</button>
            </details>
            <span v-if="busy" class="setting-save-state" role="status">{{ tr('保存中…') }}</span>
          </article>
          <div v-else class="setting-empty"><h2>{{ tr('还没有设定') }}</h2><p>{{ tr('从一个人物、地点或世界规则开始。') }}</p><button type="button" class="control-primary" @click="addEntry">{{ tr('新建设定') }}</button></div>
        </div>
        <EntryDataTable v-show="effectiveMode === 'table'" ref="table" :worldbook="worldbook" scope="all" :filters="searchResult ? {} : { cat: category, q: query }" :visible-ids="searchResult ? visibleIds : null" :selected-id="selectedId" embedded @reload="refreshFromStorage" @select="selectEntry" @open="async entry => { if (await selectEntry(entry)) await chooseMode('detail') }" />
        <GraphCanvas v-show="effectiveMode === 'graph'" :graph="graph" :visible-ids="searchResult ? visibleIds : null" :highlight-ids="highlightedIds" :cat="graphCategory" @update:cat="graphCategory = $event" @select="selectEntry" @create-edge="proposeRelation" />
      </div>
    </main>
    <aside class="setting-inspector" :aria-label="tr('设定工具')">
      <nav class="setting-inspector-tabs" :aria-label="tr('设定工具切换')"><button v-for="item in inspectorTabs" :key="item.id" type="button" :class="{ active: inspectorTab === item.id }" :aria-pressed="inspectorTab === item.id" :data-test="`setting-tool-${item.id}`" @click="selectInspector(item.id)"><WorkbenchIcon :name="item.icon" :size="17" /><span>{{ tr(item.title) }}</span></button></nav>
      <div v-show="inspectorTab === 'browse'" class="setting-inspector-browse">
        <div class="setting-browse-scope"><select :value="category" :aria-label="tr('设定分类')" @change="chooseCategory($event.target.value)"><option value="">{{ tr('全部设定') }}</option><option v-for="item in categories" :key="item" :value="item">{{ tr(settingCategoryLabel(item)) }}</option><option v-if="['base', 'foreshadow'].includes(category)" :value="category">{{ tr(category === 'base' ? '创作基调' : '伏笔') }}</option></select><span>{{ visible.length }}</span></div>
        <div class="setting-search"><WorkbenchIcon name="search" :size="16" /><input v-model="query" type="search" :placeholder="tr('查找设定…')" :aria-label="tr('查找设定')" @keydown.enter="searchRelations" /></div>
        <button type="button" class="setting-search-go" :disabled="searching || busy || !query.trim()" @click="searchRelations">{{ searching ? tr('检索中…') : tr('检索关联') }}</button>
        <div v-if="searchResult || searchError" class="setting-search-status" :role="searchError ? 'alert' : 'status'"><span>{{ searchError ? searchErrorText : tr('找到 {count} 项', { count: visible.length }) }}</span><small v-if="missingCount">{{ tr('有 {count} 项不在当前设定中，请同步后重新检索。', { count: missingCount }) }}</small><button type="button" @click="knowledge.reset">{{ tr('清除检索') }}</button></div>
        <nav class="setting-entry-list" :aria-label="tr('同类设定')"><button v-for="entry in visible" :key="entry.id" type="button" :class="{ active: entry.id === selectedId }" :aria-current="entry.id === selectedId ? 'true' : undefined" @pointerdown.prevent @click="selectEntry(entry, $event)"><span>{{ entry.name || tr('未命名条目') }}<small v-if="relatedIds.has(String(entry.id))"> · {{ tr('关联') }}</small></span><small>{{ (entry.content || '').split('\n').find(line => line.trim())?.slice(0, 64) || tr('尚未填写') }}</small></button><p v-if="!visible.length">{{ tr('暂无匹配设定') }}</p></nav>
        <button type="button" class="setting-browse-new" :disabled="busy" @click="addEntry"><WorkbenchIcon name="plus" :size="16" />{{ tr('新建{type}', { type: settingCategoryLabel(category) }) }}</button>
      </div>
      <div v-show="inspectorTab === 'table'" class="setting-inspector-preview">
        <header><h3>{{ tr('表格') }}</h3><button type="button" class="control-quiet" @click="chooseMode('table')">{{ tr('展开表格') }}<WorkbenchIcon name="canvas" :size="16" /></button></header>
        <p>{{ tr('在表格中比较和整理属性。') }}</p>
        <table class="setting-overview-table"><thead><tr><th>{{ tr('名称') }}</th><th>{{ tr('类型') }}</th></tr></thead><tbody><tr v-for="entry in visible" :key="entry.id"><td><button type="button" @click="selectEntry(entry)">{{ entry.name }}</button></td><td>{{ tr(settingCategoryLabel(entryCatDirOf(entry))) }}</td></tr></tbody></table>
      </div>
      <div v-show="inspectorTab === 'graph'" class="setting-inspector-preview">
        <header><h3>{{ tr('关系图') }}</h3><button type="button" class="control-quiet" @click="chooseMode('graph')">{{ tr('展开关系图') }}<WorkbenchIcon name="canvas" :size="16" /></button></header>
        <div v-if="current" class="setting-relations"><h4>{{ current.name }}</h4><button v-for="chip in chips" :key="chip.ref" type="button" @click="selectEntry(chip.entry)"><WorkbenchIcon name="network" :size="15" /><span>{{ chip.entry.title }}</span></button><p v-if="!chips.length">{{ tr('还没有关联设定') }}</p><label>{{ tr('添加关联') }}<select v-model="relationTarget" :aria-label="tr('关联设定')"><option value="">{{ tr('选择关联对象') }}</option><option v-for="entry in entries.filter(item => item.id !== selectedId)" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></label><button v-if="relationTarget" type="button" class="control-secondary" @click="proposeRelation({ fromId: selectedId, toId: relationTarget })">{{ tr('关联') }}</button></div>
        <p v-else>{{ tr('选一项设定查看关联。') }}</p>
      </div>
      <SettingEntryManagement v-if="current" v-show="inspectorTab === 'manage'" :key="`${worldbook.id}:${current.id}`" ref="management" :entry="current" :busy="busy" @change="managementDraft = $event" @save="saveManagement" @copy="copyEntry" @delete="requestDelete" />
      <p v-else-if="inspectorTab === 'manage'" class="setting-inspector-empty">{{ tr('选一项设定进行管理。') }}</p>
    </aside>
    <CreateDialog v-if="createRequest" :request="createRequest" @close="createRequest = null" @created="created" />
    <Teleport to="body"><dialog v-if="deleteRequest" ref="deleteDialog" class="setting-delete-dialog" :aria-label="tr('删除设定')" @cancel.prevent="cancelDelete"><h2>{{ tr('删除「{name}」？', { name: deleteRequest.entry.name }) }}</h2><p>{{ tr('删除后无法撤销。正文中的文字不会被删除。') }}</p><div v-if="deleteRequest.impact.length"><p>{{ tr('以下设定关联了它，删除后关联将失效：') }}</p><ul><li v-for="entry in deleteRequest.impact" :key="entry.id">{{ entry.name }}</li></ul></div><p v-if="deleteRequest.placeImpact.total">{{ tr('地点引用：地图绑定 {map}，历史 {history} 项，地点关联 {relations} 项。', { map: deleteRequest.placeImpact.mapBinding ? 1 : 0, history: deleteRequest.placeImpact.historyRefs, relations: deleteRequest.placeImpact.relationRefs }) }}</p><p v-if="notice" role="alert">{{ notice }}</p><footer><button type="button" class="control-secondary" :disabled="busy" @click="cancelDelete">{{ tr('取消') }}</button><button type="button" class="control-primary" :disabled="busy" @click="confirmDelete">{{ busy ? tr('删除中…') : tr('删除') }}</button></footer></dialog></Teleport>
  </section>
</template>
<style scoped>
.worldbook-content-workspace { display: grid; grid-template-columns: minmax(0, 1fr) 300px; height: 100%; min-height: 560px; min-width: 0; color: var(--text-primary); background: var(--surface-workbench); font: 14px/1.5 var(--font-sans); container-type: inline-size; container-name: setting-workspace; }
.setting-content-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.setting-content-toolbar { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 8px 20px; border-bottom: 1px solid var(--hairline-soft); box-sizing: border-box; }
.setting-content-toolbar select { max-width: 150px; }
.setting-workspace-context { flex: 1; min-width: 0; color: var(--text-muted); font-size: 12px; }
.setting-content-toolbar button { display: inline-flex; align-items: center; gap: 6px; padding: 7px 8px; font: inherit; white-space: nowrap; }
.setting-content-toolbar .setting-add { color: var(--accent); }
.setting-inspector-toggle { display: none !important; }
.setting-entity-workspace { flex: 1; min-height: 0; }
.setting-entry-document { padding: 40px clamp(24px, 4vw, 56px); min-width: 0; }
.setting-entry-title { width: 100%; box-sizing: border-box; display: block; margin: 0 0 24px; padding: 0; border: 0; background: transparent; color: var(--text-primary); font: 600 25px/1.5 var(--font-sans); }
.setting-entry-document textarea { width: 100%; box-sizing: border-box; min-height: 180px; padding: 0; resize: none; overflow: hidden; border: 0; background: transparent; color: var(--text-primary); font: 16px/1.9 var(--font-sans); }
.setting-entry-properties { margin-top: 24px; padding-top: 14px; border-top: 1px solid var(--hairline-soft); }
.setting-entry-properties summary { color: var(--text-secondary); font-size: 13px; cursor: pointer; }
.setting-entry-properties :deep(.entry-profile-editor) { border-top: 0; }
.setting-entry-properties > button { margin-top: 8px; }
.setting-save-state { display: block; margin-top: 12px; color: var(--text-muted); font-size: 12px; }
.setting-inspector { min-width: 0; min-height: 0; border-left: 1px solid var(--hairline-soft); background: var(--surface-workbench); }
.setting-inspector-tabs { display: flex; min-height: 52px; border-bottom: 1px solid var(--hairline-soft); }
.setting-inspector-tabs button { display: flex; flex: 1; min-width: 0; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border: 0; background: transparent; color: var(--text-secondary); font: 12px var(--font-sans); padding: 8px 2px; cursor: pointer; }
.setting-inspector-tabs span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.setting-inspector-tabs button.active { color: var(--accent); background: var(--accent-light); }
.setting-inspector-tabs button:hover { background: var(--nav-hover); }
.setting-inspector-browse, .setting-inspector-preview { padding: 16px; }
.setting-browse-scope { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.setting-browse-scope select { flex: 1; }
.setting-browse-scope > span { color: var(--text-muted); font-size: 12px; }
select, .setting-search, .setting-relations select { min-width: 0; min-height: 34px; padding: 7px 10px; border: 1px solid transparent; border-radius: var(--radius-control); background: var(--surface-workbench-input); color: var(--text-primary); font: inherit; }
.setting-search { display: flex; align-items: center; gap: 8px; }
.setting-search input { width: 0; flex: 1; min-width: 0; border: 0; padding: 0; background: transparent; color: var(--text-primary); font: inherit; }
.setting-search:focus-within { border-color: var(--accent); }
.setting-search-go { display: block; margin: 8px 0 12px auto; padding: 2px; font-size: 12px; color: var(--accent); }
.setting-entry-list { display: grid; gap: 4px; }
.setting-entry-list button { display: grid; gap: 4px; width: 100%; min-width: 0; padding: 10px 12px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-primary); font: inherit; text-align: start; cursor: pointer; }
.setting-entry-list button.active { background: var(--nav-selected-secondary, var(--bg-hover)); font-weight: 600; }
.setting-entry-list button:hover { background: var(--nav-hover); }
.setting-entry-list small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); font-size: 12px; font-weight: 400; }
.setting-browse-new { display: flex; align-items: center; gap: 6px; margin-top: 16px; min-height: 36px; color: var(--accent); }
.setting-inspector-preview header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.setting-inspector-preview h3 { margin: 0; font-size: 15px; }
.setting-inspector-preview header button { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
.setting-inspector-preview p, .setting-inspector-empty { color: var(--text-muted); font-size: 13px; line-height: 1.7; }
.setting-inspector-empty { padding: 20px; }
.setting-overview-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 16px; font-size: 13px; }
.setting-overview-table th, .setting-overview-table td { padding: 10px 4px; border-bottom: 1px solid var(--hairline-soft); text-align: start; overflow-wrap: anywhere; }
.setting-overview-table th { color: var(--text-muted); font-weight: 500; }
.setting-overview-table th:last-child { width: 64px; }
.setting-overview-table button { color: var(--text-primary); text-align: start; font: inherit; }
.setting-relations h4 { margin: 20px 0 14px; font-size: 14px; }
.setting-relations > button { display: flex; align-items: center; gap: 8px; padding: 8px 0; }
.setting-relations label { display: grid; gap: 8px; margin-top: 24px; color: var(--text-secondary); font-size: 13px; }
.setting-content-main :deep(.entry-data-table), .setting-content-main :deep(.flt), .setting-content-main :deep(.graph-canvas) { border: 0; border-radius: 0; background: transparent; min-height: 420px; }
.setting-content-main :deep(.edt-title), .setting-content-main :deep([data-test="edt-add-character"]) { display: none; }
.setting-relation-confirm, .setting-save-notice, .setting-search-status { margin: 0; padding: 12px 20px; background: var(--surface-workbench-muted); color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
.setting-relation-confirm { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.setting-search-status { padding: 10px; margin-bottom: 12px; }
.setting-save-notice button, .setting-relation-confirm button, .setting-search-status button { color: var(--accent); margin-left: 8px; }
.setting-empty { padding: 64px 32px; }
.setting-empty h2 { margin: 0 0 12px; font-size: 22px; }
.setting-empty p { color: var(--text-secondary); }
.setting-empty button { padding: 8px 14px; margin-top: 16px; }
:where(button):not(.control-primary):not(.control-secondary) { border: 0; background-color: transparent; font-family: inherit; cursor: pointer; }
:where(button, select, input, textarea):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { opacity: .5; cursor: default; }
.setting-delete-dialog { width: min(420px, calc(100vw - 32px)); box-sizing: border-box; max-height: calc(100dvh - 32px); overflow-y: auto; padding: 24px; border: 1px solid var(--hairline-soft); border-radius: var(--radius-popover); background: var(--surface-workbench); color: var(--text-primary); box-shadow: var(--shadow-workbench-float); }
.setting-delete-dialog::backdrop { background: rgb(0 0 0 / 35%); }
.setting-delete-dialog h2 { font: 600 18px/1.5 var(--font-sans); overflow-wrap: anywhere; margin-top: 0; }
.setting-delete-dialog p, .setting-delete-dialog ul { font: 14px/1.7 var(--font-sans); }
.setting-delete-dialog footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
.setting-delete-dialog footer button { padding: 8px 14px; }
@container setting-workspace (max-width: 680px) { .setting-content-toolbar { flex-wrap: wrap; } }
@media (max-width: 680px) {
  .worldbook-content-workspace { display: flex; flex-direction: column; min-height: 100%; height: auto; }
  .setting-inspector { display: none; border-left: 0; border-top: 1px solid var(--hairline-soft); }
  .inspector-open .setting-inspector { display: block; }
  .setting-inspector-toggle { display: inline-flex !important; }
  .setting-content-toolbar { padding: 8px 16px; gap: 8px; }
  .setting-entry-document { padding: 28px 24px; }
}
.is-compact { display: flex; flex-direction: column; min-height: 100%; height: auto; }
.is-compact .setting-inspector { border-left: 0; border-top: 1px solid var(--hairline-soft); }
.is-compact .setting-entry-document { padding: 24px; }
@media (pointer: coarse) { .setting-content-toolbar button, select, .setting-browse-new { min-height: 44px; } }
</style>
