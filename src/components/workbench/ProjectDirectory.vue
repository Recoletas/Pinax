<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { loadWritingBooks } from '../../services/writing/writingBooksRepository.js'
import { tr } from '../../i18n/index.js'
import { useComposableWorkspace } from '../../composables/useComposableWorkspace.js'
import { createDirectory, readDirectory, saveDirectory, directoryRows, directoryResourceKey, moveDirectoryRow, DIRECTORY_PREFIX, DEFAULT_FOLDERS } from '../../services/workspace/projectDirectory.js'
import { listNarrativeAssets, subscribeNarrativeAssets } from '../../services/media/narrativeAssets.js'
import { writingChapterRowLabel } from '../../services/writing/writingChapterLabels.js'
import { isMachineLedgerEntry } from '../../services/worldbook/entryTableColumns.js'
import WorkbenchIcon from './WorkbenchIcon.vue'

const props = defineProps({ bookId: { type: String, required: true }, chapters: { type: Array, default: () => [] }, ideas: { type: Array, default: () => [] }, worldbook: { type: Object, default: null }, activeChapterId: { type: String, default: '' }, activeIdeaId: { type: String, default: '' }, beforeOpen: { type: Function, default: null }, createResource: { type: Function, default: null }, refreshWorldbook: { type: Function, default: null } })
const DirectoryCreateDialog = defineAsyncComponent(() => import('./DirectoryCreateDialog.vue'))
const creation = ref(null)
const router = useRouter()
const projects = ref([])
const host = useComposableWorkspace()
const directory = ref(createDirectory())
const error = ref('')
const loadFailed = ref(false)
const query = ref('')
const filter = ref('')
const selectedKey = ref('')
const focusedKey = ref('')
const closed = ref(new Set())
const tree = ref(null)
const opening = ref(false)
const toolsOpen = ref(false)
const createOpen = ref(false)
const newName = ref('')
const rename = ref('')
const destination = ref('')
const linkTarget = ref('')
const linkQuery = ref('')
const toolsPanel = ref(null)
const toolsPosition = ref({})
let toolsTrigger = null
const viewStorageKey = () => `pinax-directory-view:v1:${props.bookId}`
const assets = ref([])
const reloadAssets = () => { assets.value = listNarrativeAssets({ projectId: props.bookId }) }
const unsubscribe = subscribeNarrativeAssets(reloadAssets)
const resource = (type, id, extra = {}) => ({ type, id: String(id), bookId: props.bookId, worldbookId: ['entry', 'source'].includes(type) ? String(props.worldbook?.id || '') : '', ...extra })
const sourceMirror = source => (props.worldbook?.entries || []).find(entry => entry.type === 'source' && String(entry.metadata?.sourceDocumentId || entry.id) === String(source.id))
const catalog = computed(() => [
  { title: '项目文档', label: '文档', icon: 'sources', folder: 'sources', readonly: true, resource: resource('sources', 'project-documents', { sourcesView: 'files' }) },
  ...props.chapters.map((item, index) => ({ title: writingChapterRowLabel(index, item.title), label: '章节', icon: 'chapter', folder: 'manuscript', resource: resource('chapter', item.id) })),
  ...props.ideas.map(item => ({ title: item.title || '未命名构思', label: '构思', icon: 'idea', folder: 'ideas', resource: resource('exploration', item.id) })),
  ...(props.worldbook?.entries || []).filter(item => !isMachineLedgerEntry(item) && !(item.type === 'source' && (props.worldbook?.sourceDocuments || []).some(source => String(source.id) === String(item.metadata?.sourceDocumentId || item.id)))).map(item => ({ title: item.name || item.title || '未命名设定', label: ({ character: '人物', location: '地点', organization: '组织', event: '事件', source: '来源' })[item.type] || '设定', icon: ({ character: 'character-file', location: 'location-file', organization: 'organization-file', event: 'event-file', source: 'source-file' })[item.type] || 'setting-file', folder: item.type === 'source' ? 'sources' : 'settings', readonly: item.type === 'source', resource: resource('entry', item.id) })),
  ...(props.worldbook?.sourceDocuments || []).map(item => ({ aliases: sourceMirror(item) ? [directoryResourceKey(resource('entry', sourceMirror(item).id))] : [], title: sourceMirror(item)?.name || item.title || '未命名资料', label: '资料', icon: 'source-file', folder: 'sources', readonly: true, resource: resource('source', item.id, { contentHash: item.contentHash || '' }) })),
  ...assets.value.map(item => ({ title: item.title || '未命名素材', label: item.kind === 'reference-image' || item.mediaAssetId ? '图片' : '素材', icon: 'image', folder: 'assets', readonly: true, resource: resource('asset', item.id) }))
])
const rows = computed(() => directoryRows(directory.value, catalog.value))
const chosen = computed(() => rows.value.find(row => row.key === selectedKey.value))
const filtering = computed(() => Boolean(query.value.trim() || filter.value))
const visible = computed(() => {
  const all = rows.value
  if (filtering.value) return all.filter(row => !row.folder && (!filter.value || (filter.value === 'source' ? row.readonly && ['source', 'entry'].includes(row.resource.type) : filter.value === 'entry' ? row.resource.type === 'entry' && !row.readonly : row.resource.type === filter.value)) && `${row.title} ${row.label} ${row.path}`.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())).map(row => ({ ...row, depth: 0 }))
  const result = []
  function walk(parentId, depth) {
    for (const row of all.filter(item => item.parentId === parentId).sort((a, b) => a.order - b.order || Number(b.folder || false) - Number(a.folder || false))) {
      result.push({ ...row, depth })
      if (row.folder && !closed.value.has(row.id)) walk(row.id, depth + 1)
    }
  }
  walk('', 0); return result
})
const selectedKeys = computed(() => new Set([selectedKey.value, ...(chosen.value?.aliases || [])]))
const links = computed(() => directory.value.links.filter(link => selectedKeys.value.has(link.from) || selectedKeys.value.has(link.to)).map(link => {
  const incoming = selectedKeys.value.has(link.to)
  const key = incoming ? link.from : link.to
  return { link, incoming, row: rows.value.find(row => row.key === key || row.aliases?.includes(key)) }
}))
const linkOptions = computed(() => rows.value.filter(row => !row.folder && row.key !== selectedKey.value && `${row.title} ${row.label} ${row.path}`.toLocaleLowerCase().includes(linkQuery.value.trim().toLocaleLowerCase())))
const destinations = computed(() => rows.value.filter(row => {
  if (!row.folder) return false
  let current = row
  while (current) {
    if (current.key === selectedKey.value) return false
    current = rows.value.find(item => item.folder && item.id === current.parentId)
  }
  return true
}))
const activeKey = computed(() => {
  const active = host?.state.hidden ? null : host?.state.views.find(view => view.id === host.state.mainModuleId)
  if (active?.resource?.type === 'settings-editor' && active.resource.entryId) return directoryResourceKey(resource('entry', active.resource.entryId))
  if (active?.resource.type === 'home') return ''
  if (active && !['chapter', 'exploration'].includes(active.resource.type)) return directoryResourceKey(active.resource)
  return directoryResourceKey(resource(props.activeIdeaId ? 'exploration' : 'chapter', props.activeIdeaId || props.activeChapterId))
})
watch([activeKey, rows], ([key, items]) => {
  let parent = items.find(row => row.key === key || row.aliases?.includes(key))?.parentId
  while (parent) { closed.value.delete(parent); parent = directory.value.folders.find(folder => folder.id === parent)?.parentId }
}, { flush: 'post' })
function isActiveRow(row) { return row.key === activeKey.value || row.aliases?.includes(activeKey.value) }
function reload() {
  projects.value = loadWritingBooks()
  try { directory.value = readDirectory(props.bookId); loadFailed.value = false; error.value = '' } catch (cause) { loadFailed.value = true; error.value = cause.message || '目录无法读取，原记录已保留。' }
  reloadAssets()
}
watch(() => props.bookId, () => { query.value = ''; filter.value = ''; selectedKey.value = ''; focusedKey.value = ''; toolsOpen.value = false; directory.value = createDirectory(); reload(); restoreView() }, { immediate: true })
watch(chosen, row => { rename.value = row?.title || ''; destination.value = row?.parentId || ''; linkTarget.value = ''; linkQuery.value = '' })
function restoreView() {
  try {
    const value = JSON.parse(localStorage.getItem(viewStorageKey()))
    const saved = Array.isArray(value?.closed) ? value.closed.filter(id => directory.value.folders.some(folder => folder.id === id)) : []
    closed.value = new Set([...saved, ...(!value?.groupedDefault ? DEFAULT_FOLDERS.filter(folder => folder.id !== 'manuscript').map(folder => folder.id) : [])])
  } catch { closed.value = new Set() /* Display preferences never block access to original content. */ }
}
watch(closed, value => {
  try { localStorage.setItem(viewStorageKey(), JSON.stringify({ groupedDefault: true, closed: [...value] })) } catch { /* Directory content uses its own explicit save errors. */ }
}, { deep: true, flush: 'sync' })
async function showTools(row, event) {
  select(row); toolsTrigger = event.currentTarget
  const rect = toolsTrigger.getBoundingClientRect()
  const top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 380))
  toolsPosition.value = { zoom: 1 / (Number(getComputedStyle(document.body).zoom) || 1), left: `${Math.max(8, Math.min(rect.left, window.innerWidth - 308))}px`, top: `${top}px`, maxHeight: `${window.innerHeight - top - 8}px` }
  toolsOpen.value = true
  await nextTick(); toolsPanel.value?.focus()
}
function closeTools(restoreFocus = false) {
  toolsOpen.value = false
  if (restoreFocus && toolsTrigger?.isConnected) toolsTrigger.focus()
}
function outsideTools(event) { if (toolsOpen.value && !toolsPanel.value?.contains(event.target) && !toolsTrigger?.contains(event.target)) closeTools() }
function scrollTools(event) { if (toolsOpen.value && !toolsPanel.value?.contains(event.target)) closeTools() }
function dismissTools(event) { if (event.key === 'Escape' && toolsOpen.value) { event.preventDefault(); closeTools(true) } }
window.addEventListener('pointerdown', outsideTools)
window.addEventListener('keydown', dismissTools)
window.addEventListener('resize', closeTools)
window.addEventListener('scroll', scrollTools, true)
onBeforeUnmount(() => { window.removeEventListener('pointerdown', outsideTools); window.removeEventListener('keydown', dismissTools); window.removeEventListener('resize', closeTools); window.removeEventListener('scroll', scrollTools, true) })
function changed(event) { if (event.detail?.bookId === props.bookId || event.key === DIRECTORY_PREFIX + props.bookId) reload() }
window.addEventListener('pinax-project-directory-changed', changed)
window.addEventListener('storage', changed)
onBeforeUnmount(() => { unsubscribe(); window.removeEventListener('pinax-project-directory-changed', changed); window.removeEventListener('storage', changed) })
function mutate(next) {
  if (loadFailed.value) return false
  try { directory.value = saveDirectory(props.bookId, directory.value, next); error.value = ''; return true } catch (cause) { error.value = cause.message || '目录未能保存，请重试。'; return false }
}
async function selectProject(event) {
  const bookId = event.target.value
  event.target.value = props.bookId
  if (opening.value || bookId === props.bookId) return
  const book = projects.value.find(item => String(item.id) === bookId)
  if (!book) return
  opening.value = true
  try {
    if (props.beforeOpen && await props.beforeOpen() === false) { error.value = host.state.notice || '请先保存当前修改。'; return }
    await router.push({ name: 'authoring', query: { bookId, ...(book.chapters?.[0]?.id ? { chapterId: String(book.chapters[0].id) } : {}) } })
  } catch (cause) { error.value = cause.message || '未能切换作品。' }
  finally { opening.value = false }
}
function toggle(row) { const next = new Set(closed.value); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); closed.value = next }
function select(row) { selectedKey.value = row.key; focusedKey.value = row.key }
async function open(row, group = 'main') {
  select(row)
  if (row.folder) { toggle(row); return }
  if (opening.value) return
  const bookId = props.bookId
  opening.value = true; error.value = ''
  try {
    if (props.beforeOpen && await props.beforeOpen() === false || !await host.prepareOpen(group)) { error.value = host.state.notice || '请先处理当前文稿的保存或待确认内容。'; return }
    if (props.bookId !== bookId || !rows.value.some(item => item.key === row.key)) return
    const ref = row.resource.type === 'entry' && !row.readonly ? { ...row.resource, type: 'settings-editor', id: '', entryId: row.resource.id, settingsView: 'detail', settingsCategory: '', focusEntry: true, entryRequestId: crypto.randomUUID() } : row.resource
    if (!await host.openAt(ref, group)) error.value = host.state.notice || '未能打开，请先处理当前修改。'
    else { host.state.directoryOpen = false; closeTools() }
  } catch (cause) { error.value = cause.message || '未能打开，当前内容已保留。' }
  finally { opening.value = false }
}
function creationParent(folderId) {
  if (chosen.value) return chosen.value.folder ? chosen.value.id : chosen.value.parentId
  return directory.value.folders.some(folder => folder.id === folderId) ? folderId : ''
}
async function createContent(type) {
  if (opening.value || !props.createResource) return
  const bookId = props.bookId
  const parentId = creationParent(type === 'chapter' ? 'manuscript' : 'ideas')
  opening.value = true
  try {
    if (props.beforeOpen && await props.beforeOpen() === false || !await host.prepareOpen('main')) { error.value = host.state.notice || '请先保存当前修改。'; return }
    if (props.bookId !== bookId) return
    const ref = await props.createResource(type)
    if (props.bookId !== bookId) return
    if (!ref) { error.value = '未能新建，请先处理当前文稿。'; return }
    await nextTick()
    const row = rows.value.find(item => item.key === directoryResourceKey(ref))
    if (row) {
      const saved = move(row, parentId, rows.value.length + 1)
      select(row); reveal(rows.value.find(item => item.key === row.key) || row)
      if (!saved) error.value = `内容已新建，但归档未成功。${error.value}`
    }
    host.showPrimary(); host.state.directoryOpen = false
  } catch (cause) { error.value = cause.message || '未能新建，请重试。' } finally { opening.value = false }
}
async function openCollection(type) {
  if (opening.value) return
  const bookId = props.bookId
  const worldbookId = String(props.worldbook?.id || '')
  opening.value = true; error.value = ''
  try {
    if (props.beforeOpen && await props.beforeOpen() === false || !await host.prepareOpen('main')) { error.value = host.state.notice || '请先保存当前修改。'; return }
    if (bookId !== props.bookId) return
    if (!await host.openAt({ type, bookId, worldbookId }, 'main')) error.value = host.state.notice || '未能打开，当前内容已保留。'
    else { host.state.directoryOpen = false; closeTools() }
  } catch (cause) { error.value = cause.message || '未能打开，请重试。' }
  finally { opening.value = false }
}
async function startCreation(type) {
  if (opening.value || creation.value) return
  const bookId = props.bookId
  const parentId = creationParent(type === 'entry' ? 'settings' : 'sources')
  const parent = rows.value.find(item => item.folder && item.id === parentId)
  const path = parent ? [parent.path, parent.title].filter(Boolean).join(' / ') : ''
  opening.value = true
  try {
    if (props.beforeOpen && await props.beforeOpen() === false || !await host.prepareOpen('main')) { error.value = host.state.notice || '请先保存当前修改。'; return }
    if (props.bookId !== bookId) return
    closeTools(); creation.value = { type, bookId, parentId, path }
  } catch (cause) { error.value = cause.message || '未能打开，请重试。' }
  finally { opening.value = false }
}
async function createdResources(resources) {
  const target = creation.value
  if (!target || props.bookId !== target.bookId || !resources.length) { creation.value = null; return }
  opening.value = true
  try {
    if (props.refreshWorldbook && await props.refreshWorldbook(target.bookId, resources[0].worldbookId) === false) return
    if (props.bookId !== target.bookId) return
    const previous = readDirectory(target.bookId)
    let next = previous
    const parentId = previous.folders.some(folder => folder.id === target.parentId) ? target.parentId : ''
    let order = Math.max(0, ...previous.placements.map(item => item.order), ...previous.folders.map(item => item.order), rows.value.length) + 1
    for (const ref of resources) {
      if (ref.bookId !== target.bookId) continue
      next = moveDirectoryRow(next, { folder: false, key: directoryResourceKey(ref) }, parentId, order++)
    }
    directory.value = saveDirectory(target.bookId, previous, next)
    query.value = ''; filter.value = ''
    let ancestor = parentId
    while (ancestor) { closed.value.delete(ancestor); ancestor = directory.value.folders.find(folder => folder.id === ancestor)?.parentId }
    selectedKey.value = directoryResourceKey(resources[0])
    if (target.type === 'entry') {
      const ref = resources[0]
      const opened = await host.openAt({ ...ref, type: 'settings-editor', id: '', entryId: ref.id, focusEntry: true, settingsView: 'detail', entryRequestId: crypto.randomUUID() }, 'main')
      if (opened) host.state.directoryOpen = false
      else error.value = '设定已保存，可从目录打开；当前工作台暂时无法切换。'
    }
  } catch (cause) { error.value = `内容已保存，但目录归档未完成。${cause.message || '请刷新目录后重新移动。'}` }
  finally { creation.value = null; opening.value = false }
}
function folder() {
  if (!newName.value.trim()) return
  const parentId = chosen.value?.folder ? chosen.value.id : chosen.value?.parentId || ''
  const next = JSON.parse(JSON.stringify(directory.value))
  const id = `folder-${crypto.randomUUID()}`
  next.folders.push({ id, name: newName.value.trim(), parentId, order: rows.value.filter(row => row.parentId === parentId).reduce((max, row) => Math.max(max, row.order), -1) + 1 })
  if (mutate(next)) { newName.value = ''; createOpen.value = false; selectedKey.value = `folder:${id}`; reveal(rows.value.find(row => row.key === selectedKey.value)) }
}
function move(row, parentId, order) {
  try {
    if (!mutate(moveDirectoryRow(directory.value, row, parentId, order))) return false
    closed.value.delete(parentId); return true
  } catch (cause) { error.value = cause.message; return false }
}
function moveChosen() { if (chosen.value) move(chosen.value, destination.value, rows.value.filter(row => row.parentId === destination.value).reduce((max, row) => Math.max(max, row.order), -1) + 1) }
function reorder(delta) {
  const row = chosen.value
  const siblings = rows.value.filter(item => item.parentId === row.parentId).sort((a, b) => a.order - b.order)
  const index = siblings.findIndex(item => item.key === row.key), target = index + delta
  if (target < 0 || target >= siblings.length) return
  ;[siblings[index], siblings[target]] = [siblings[target], siblings[index]]
  let next = directory.value
  siblings.forEach((item, order) => { next = moveDirectoryRow(next, item, item.parentId, order) })
  mutate(next)
}
function renameFolder() {
  if (!chosen.value?.folder || !rename.value.trim()) return
  const next = JSON.parse(JSON.stringify(directory.value))
  next.folders.find(item => item.id === chosen.value.id).name = rename.value.trim()
  mutate(next)
}
function removeFolder() {
  const row = chosen.value
  if (!row?.folder || !window.confirm(tr('移除此文件夹？其中的内容将移到上一级，不会删除原件。'))) return
  let next = directory.value
  rows.value.filter(item => item.parentId === row.id).forEach((item, index) => { next = moveDirectoryRow(next, item, row.parentId, index + rows.value.length) })
  // Retain placements for temporarily unavailable resources, too.
  next = JSON.parse(JSON.stringify(next))
  next.placements.forEach(item => { if (item.parentId === row.id) item.parentId = row.parentId })
  next.folders = next.folders.filter(item => item.id !== row.id)
  if (mutate(next)) { selectedKey.value = ''; toolsOpen.value = false }
}
function addLink() {
  if (!chosen.value || chosen.value.folder || !linkTarget.value || linkTarget.value === selectedKey.value) return
  const next = JSON.parse(JSON.stringify(directory.value))
  if (!next.links.some(link => link.from === selectedKey.value && link.to === linkTarget.value)) next.links.push({ from: selectedKey.value, to: linkTarget.value })
  if (mutate(next)) linkTarget.value = ''
}
function removeLink(link) { mutate({ ...directory.value, links: directory.value.links.filter(item => item.from !== link.from || item.to !== link.to) }) }
function reveal(row) {
  query.value = ''; filter.value = ''; let parent = row.parentId
  while (parent) { closed.value.delete(parent); parent = directory.value.folders.find(item => item.id === parent)?.parentId }
  closeTools(); focusRow(row.key)
}
async function focusRow(key) { focusedKey.value = key; await nextTick(); [...tree.value?.querySelectorAll('[role="treeitem"]') || []].find(node => node.dataset.key === key)?.focus() }
function keydown(event, row) {
  if (event.isComposing || event.target !== event.currentTarget) return
  if (event.key === 'F10' && event.shiftKey || event.key === 'ContextMenu') { event.preventDefault(); void showTools(row, event); return }
  const index = visible.value.findIndex(item => item.key === row.key)
  let next
  if (event.key === 'ArrowDown') next = visible.value[Math.min(index + 1, visible.value.length - 1)]
  else if (event.key === 'ArrowUp') next = visible.value[Math.max(0, index - 1)]
  else if (event.key === 'Home') next = visible.value[0]
  else if (event.key === 'End') next = visible.value.at(-1)
  else if (event.key === 'ArrowRight' && row.folder) { if (closed.value.has(row.id)) toggle(row); else next = visible.value[index + 1] }
  else if (event.key === 'ArrowLeft') { if (row.folder && !closed.value.has(row.id)) toggle(row); else next = rows.value.find(item => item.folder && item.id === row.parentId) }
  else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void open(row); return }
  else return
  event.preventDefault(); if (next) void focusRow(next.key)
}
function drag(event, row) { event.dataTransfer.setData('application/x-pinax-directory', JSON.stringify({ bookId: props.bookId, key: row.key })); event.dataTransfer.effectAllowed = 'move' }
function drop(event, row) {
  try {
    const value = JSON.parse(event.dataTransfer.getData('application/x-pinax-directory'))
    if (value.bookId !== props.bookId) return
    const item = rows.value.find(item => item.key === value.key)
    if (!item || item.key === row.key) return
    move(item, row.folder ? row.id : row.parentId, row.folder ? rows.value.length + 1 : row.order - .5)
  } catch { /* Other applications' drags are not directory moves. */ }
}
</script>

<template>
  <section class="project-directory" aria-label="作品文件目录" data-test="project-directory">
    <div class="directory-project"><WorkbenchIcon name="project" :size="17" /><select :value="bookId" :disabled="opening" :aria-label="tr('切换作品')" @change="selectProject"><option v-for="project in projects" :key="project.id" :value="String(project.id)">{{ project.title || tr('未命名作品') }}</option></select></div>
    <div class="directory-search"><WorkbenchIcon name="search" :size="14" /><input v-model="query" type="search" :placeholder="tr('搜索本书内容')" :aria-label="tr('搜索本书内容')" /></div>
    <div class="directory-controls">
      <select v-model="filter" :aria-label="tr('按类型筛选')"><option value="">{{ tr('全部类型') }}</option><option value="chapter">{{ tr('章节') }}</option><option value="exploration">{{ tr('构思') }}</option><option value="entry">{{ tr('设定') }}</option><option value="source">{{ tr('资料 · 只读') }}</option><option value="sources">{{ tr('项目文档 · 只读') }}</option><option value="asset">{{ tr('素材') }}</option></select>
      <details class="directory-create"><summary :aria-label="tr('新建内容')" :title="tr('新建内容')"><WorkbenchIcon name="plus" :size="17" /></summary><div @click="$event.currentTarget.closest('details').open = false"><button type="button" @click="createContent('chapter')">{{ tr('章节') }}</button><button type="button" @click="createContent('exploration')">{{ tr('构思') }}</button><button type="button" @click="startCreation('entry')">{{ tr('设定') }}</button><button type="button" @click="startCreation('import')">{{ tr('导入资料') }}</button><button type="button" @click="openCollection('settings-editor')">{{ tr('管理设定') }}</button><button type="button" @click="openCollection('sources')">{{ tr('资料与导入') }}</button><button type="button" @click="createOpen = !createOpen">{{ tr('文件夹') }}</button></div></details>
      <button type="button" :title="tr('刷新目录')" :aria-label="tr('刷新目录')" @click="reload"><WorkbenchIcon name="refresh" :size="14" /></button>
    </div>
    <form v-if="createOpen" class="directory-inline-form" @submit.prevent="folder"><input v-model="newName" :aria-label="tr('文件夹名称')" :placeholder="tr('文件夹名称')" maxlength="120" /><button type="submit">{{ tr('新建') }}</button></form>
    <div v-if="filtering" class="directory-filter-summary"><span>{{ tr('{count} 项', { count: visible.length }) }}</span><button type="button" @click="query = ''; filter = ''">{{ tr('清除筛选') }}</button></div>
    <p v-if="error" class="directory-notice" role="alert">{{ tr(error) }}</p>
    <div ref="tree" role="tree" :aria-label="tr('文件目录')" :aria-busy="opening" class="directory-tree">
      <div v-for="(row, index) in visible" :key="row.key" role="treeitem" :aria-level="row.depth + 1" :aria-expanded="row.folder ? !closed.has(row.id) : undefined" :aria-selected="row.key === selectedKey" :aria-current="isActiveRow(row) ? 'page' : undefined" :aria-label="`${row.title} · ${tr(row.label)}${row.readonly ? ' · 只读' : ''}`" :tabindex="row.key === focusedKey || (!visible.some(item => item.key === focusedKey) && index === 0) ? 0 : -1" :data-key="row.key" :title="`${row.path ? row.path + ' / ' : ''}${row.title} · ${tr(row.label)}${row.readonly ? ' · 只读' : ''}`" class="directory-row" :class="{ 'is-active': isActiveRow(row), 'is-selected': row.key === selectedKey, 'is-folder': row.folder }" :style="{ paddingInlineStart: `${8 + row.depth * 16}px` }" draggable="true" @focus="focusedKey = row.key" @click="open(row)" @contextmenu.prevent="showTools(row, $event)" @keydown="keydown($event, row)" @dragstart="drag($event, row)" @dragover.prevent @drop.stop.prevent="drop($event, row)">
        <WorkbenchIcon v-if="row.folder" name="chevron-down" :size="11" class="directory-chevron" :class="{ closed: closed.has(row.id) }" /><span v-else class="directory-indent"></span><WorkbenchIcon :name="row.folder && !closed.has(row.id) ? 'folder-open' : row.icon" :size="16" /><span class="directory-name">{{ row.title }}<small v-if="filtering && row.path">{{ row.path }}</small></span><small v-if="row.folder" class="directory-type">{{ rows.filter(item => !item.folder && item.parentId === row.id).length }}</small><small v-else class="directory-type">{{ tr(row.label) }}<span v-if="row.readonly"> · {{ tr('只读') }}</span></small><button type="button" class="directory-row-more" :aria-label="tr('管理 {name}', { name: row.title })" :title="tr('更多操作')" @click.stop="showTools(row, $event)" @dragstart.stop.prevent><WorkbenchIcon name="more" :size="15" /></button>
      </div>
    </div>
    <p v-if="!visible.length" class="directory-notice">{{ tr('没有匹配的内容') }}</p>
    <Teleport to="body"><div v-if="chosen && toolsOpen" ref="toolsPanel" class="project-directory directory-selection directory-popover" :style="toolsPosition" role="dialog" :aria-label="tr('管理 {name}', { name: chosen.title })" tabindex="-1">
      <div class="directory-selection-toggle"><span>{{ chosen.title }} · {{ tr(chosen.label) }}</span><button type="button" :aria-label="tr('关闭操作')" @click="closeTools(true)"><WorkbenchIcon name="close" :size="16" /></button></div>
      <p v-if="error" class="directory-notice" role="alert">{{ tr(error) }}</p>
      <div v-if="toolsOpen" class="directory-tools">
        <div class="directory-actions"><button v-if="!chosen.folder" type="button" @click="open(chosen, 'side')">{{ tr('在旁边打开') }}</button><button v-if="filtering" type="button" @click="reveal(chosen)">{{ tr('在文件夹中显示') }}</button><button type="button" @click="reorder(-1)">{{ tr('上移') }}</button><button type="button" @click="reorder(1)">{{ tr('下移') }}</button></div>
        <p>{{ tr('此处排序只改变归档位置。书稿顺序在“章节顺序”中调整。') }}</p>
        <form class="directory-inline-form" @submit.prevent="moveChosen"><select v-model="destination" :aria-label="tr('移到文件夹')"><option value="">{{ tr('根目录') }}</option><option v-for="item in destinations" :key="item.id" :value="item.id">{{ item.path ? item.path + ' / ' : '' }}{{ item.title }}</option></select><button type="submit">{{ tr('移动') }}</button></form>
        <template v-if="chosen.folder"><form class="directory-inline-form" @submit.prevent="renameFolder"><input v-model="rename" :aria-label="tr('重命名文件夹')" /><button type="submit">{{ tr('重命名') }}</button></form><button type="button" @click="removeFolder">{{ tr('移除文件夹') }}</button></template>
        <template v-else>
          <h3>{{ tr('关联内容') }}</h3>
          <div v-for="item in links" :key="JSON.stringify(item.link)" class="directory-link"><button type="button" :disabled="!item.row" @click="open(item.row)">{{ item.incoming ? '← ' : '→ ' }}{{ item.row ? `${item.row.title} · ${tr(item.row.label)}` : tr('原件已删除或不属于当前资料库') }}</button><button type="button" :aria-label="tr('移除关联')" @click="removeLink(item.link)"><WorkbenchIcon name="unlink" :size="13" /></button></div>
          <input v-model="linkQuery" class="directory-link-search" type="search" :aria-label="tr('搜索关联内容')" :placeholder="tr('搜索名称、类型或路径')" @input="linkTarget = ''" /><form class="directory-inline-form" @submit.prevent="addLink"><select v-model="linkTarget" :aria-label="tr('选择关联内容')"><option value="">{{ tr('选择本书内容') }}</option><option v-for="row in linkOptions" :key="row.key" :value="row.key">{{ row.title }} · {{ tr(row.label) }}{{ row.path ? ` / ${row.path}` : '' }}</option></select><button type="submit" :disabled="!linkTarget">{{ tr('关联') }}</button></form>
        </template>
      </div>
    </div></Teleport>
    <DirectoryCreateDialog v-if="creation" :request="creation" @close="creation = null" @created="createdResources" />
  </section>
</template>

<style scoped>
.project-directory { min-width: 0; font: 13px/1.5 var(--font-sans); color: var(--text-primary); }
.directory-project { display: flex; align-items: center; gap: 8px; padding: 8px 12px 14px; font-weight: 600; }
.directory-project select { flex: 1; min-width: 0; padding: 0; color: var(--text-primary); text-overflow: ellipsis; font-weight: inherit; }
.directory-search { display: flex; align-items: center; gap: 6px; padding: 8px 10px; margin: 0 8px 8px; background: var(--surface-workbench); border-radius: var(--radius-control); color: var(--text-muted); }
.directory-search input { border: 0; outline: none; width: 100%; min-width: 0; background: transparent; color: var(--text-primary); font: inherit; }
.directory-controls { display: flex; align-items: center; gap: 4px; margin: 0 8px 8px; }
.directory-controls > select { flex: 1; min-width: 0; }
.project-directory button, .project-directory select, .directory-create summary { background: transparent; color: var(--text-secondary); font: inherit; border: 0; padding: 5px 6px; border-radius: 4px; cursor: pointer; }
.project-directory select option { background: var(--surface-workbench); color: var(--text-primary); }
.project-directory button:hover, .directory-create summary:hover { background: var(--nav-hover); color: var(--text-primary); }
.project-directory button:disabled { opacity: .5; cursor: default; }
.project-directory :is(button, select, input, summary, [role='treeitem']):focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.directory-create { position: relative; }
.directory-create summary { display: flex; list-style: none; }
.directory-create summary::-webkit-details-marker { display: none; }
.directory-create > div { position: absolute; top: 100%; right: 0; z-index: 20; min-width: 110px; padding: 4px; border: 1px solid var(--hairline-soft); background: var(--surface-workbench); box-shadow: var(--shadow-workbench-float); border-radius: var(--radius-control); }
.directory-create button { display: block; width: 100%; text-align: start; }
.directory-row { display: flex; align-items: center; gap: 6px; min-height: 34px; padding-block: 4px; padding-inline-end: 8px; margin: 1px 6px; border-radius: 4px; cursor: pointer; box-sizing: border-box; }
.directory-row:hover { background: var(--nav-hover); }
.directory-row.is-active { background: var(--nav-selected); color: var(--text-primary); font-weight: 600; }
.directory-row.is-selected:not(.is-active) { background: var(--nav-hover); }
.directory-row > svg, .directory-indent { flex: none; }
.directory-indent { width: 11px; }
.directory-chevron.closed { transform: rotate(-90deg); }
.directory-name { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.directory-name small { display: block; color: var(--text-muted); font-size: 11px; font-weight: 400; overflow: hidden; text-overflow: ellipsis; }
.directory-type { flex: none; color: var(--text-muted); font-size: 10px; font-weight: 400; }
.is-folder { font-weight: 600; margin-top: 4px; }
.directory-filter-summary { display: flex; align-items: center; justify-content: space-between; padding: 0 12px; color: var(--text-muted); font-size: 12px; }
.directory-row-more { flex: none; opacity: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
.directory-row:hover .directory-row-more, .directory-row:focus-within .directory-row-more { opacity: 1; }
.directory-popover { zoom: 1; position: fixed; z-index: 1200; width: min(300px, calc(100vw - 16px)); box-sizing: border-box; padding: 8px; overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--hairline-soft); border-radius: var(--radius-control); background: var(--surface-workbench); box-shadow: var(--shadow-workbench-float); }
.directory-link-search { width: 100%; box-sizing: border-box; padding: 7px; background: var(--surface-workbench-input); color: var(--text-primary); border: 1px solid var(--hairline-soft); border-radius: 4px; font: inherit; }
@media (hover: none) { .directory-row-more { opacity: 1; } }
.directory-selection-toggle { display: flex; align-items: center; gap: 8px; width: 100%; }
.directory-selection-toggle span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: start; }
.directory-tools { padding: 4px; }
.directory-tools p { color: var(--text-muted); font-size: 11px; }
.directory-tools h3 { font-size: 12px; font-weight: 500; margin: 16px 0 4px; }
.directory-actions { display: flex; flex-wrap: wrap; }
.directory-inline-form { display: flex; gap: 4px; padding: 4px; }
.directory-inline-form input, .directory-inline-form select { flex: 1; min-width: 0; width: 0; border: 1px solid var(--hairline-soft); border-radius: 4px; padding: 5px; background: var(--surface-workbench-input); color: var(--text-primary); font: inherit; }
.directory-inline-form button { flex: none; }
.directory-link { display: flex; align-items: center; }
.directory-link button:first-child { min-width: 0; flex: 1; text-align: start; overflow-wrap: anywhere; }
.directory-notice { padding: 8px 12px; margin: 0; color: var(--text-secondary); font-size: 12px; }
@media (pointer: coarse) { .directory-row, .project-directory button, .directory-create summary { min-height: 44px; } }
</style>
