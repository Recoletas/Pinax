<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { getItem, STORAGE_KEYS } from '../../composables/useStorage.js'
import { tr } from '../../i18n/index.js'
import { useComposableWorkspace } from '../../composables/useComposableWorkspace.js'
import { loadWritingBooks } from '../../services/writing/writingBooksRepository.js'
import { readWorldbookSnapshot } from '../../stores/worldStore.js'
import WorkbenchIcon from './WorkbenchIcon.vue'
const host = useComposableWorkspace()
const menu = ref(null)
const groups = ref([])
const search = ref('')
const destination = ref('side')
const opening = ref(false)
const error = ref('')
const filteredGroups = computed(() => groups.value.map(group => ({ ...group, items: group.items.filter(item => String(item.title || '').toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())).slice(0, 60) })))
const loading = ref(false)
let sequence = 0
let disposed = false
async function load() {
  if (!menu.value?.open) return
  const ticket = ++sequence
  error.value = ''
  await nextTick()
  if (disposed || ticket !== sequence || !menu.value?.open) return
  menu.value.querySelector('input')?.focus()
  const scope = { ...host.scope.value }
  const book = loadWritingBooks().find(book => String(book.id) === scope.bookId)
  const worldbookId = book?.worldbookId || scope.worldbookId
  const worldbook = worldbookId ? readWorldbookSnapshot(worldbookId) : null
  const ref = { bookId: scope.bookId, worldbookId: String(worldbookId || '') }
  groups.value = [
    { title: '资料', items: [{ title: '本书资料', resource: { ...ref, type: 'sources' } }, ...(worldbook?.sourceDocuments || []).map(source => ({ title: source.title || source.id, resource: { ...ref, type: 'source', id: String(source.id), contentHash: source.contentHash || '' } }))] },
    { title: '正文', items: (book?.chapters || []).map(chapter => ({ title: chapter.title || chapter.id, resource: { ...ref, type: 'chapter', id: String(chapter.id) } })) },
    { title: '人物与设定', items: [{ title: '本书设定', resource: { ...ref, type: 'settings-editor' } }, ...(worldbook?.entries || []).map(entry => ({ title: entry.name || entry.title || entry.id, resource: { ...ref, type: 'entry', id: String(entry.id) } }))] }
  ]
  if (!book) return
  if (worldbookId) {
    const sessions = getItem(STORAGE_KEYS.WRITING_SESSIONS)
    groups.value.push({ title: '跑团', items: [{ title: '本书跑团', resource: { ...ref, type: 'game-editor' } }, ...(Array.isArray(sessions) ? sessions : []).filter(session => (session.worldbookId || session.worldId) === worldbookId).map(session => ({ title: session.title || '未命名存档', resource: { ...ref, type: 'game-editor', sessionId: String(session.id) } }))] })
  }
  loading.value = true
  try {
    const [{ listComicPages }, { listNarrativeAssets }, { listStoryboardDocuments }] = await Promise.all([
      import('../../services/media/comicPageStore.js'), import('../../services/media/narrativeAssets.js'), import('../../services/media/storyboardStore.js')])
    if (disposed || ticket !== sequence || host.scope.value.bookId !== scope.bookId) return
    groups.value.push(
      { title: '漫画', items: [{ title: '漫画工作台', resource: { ...ref, type: 'comic-editor' } }, ...listComicPages({ projectId: scope.bookId }).map(page => ({ title: page.title, resource: { ...ref, type: 'comic', id: page.id } }))] },
      { title: '视频', items: [{ title: '视频工作台', resource: { ...ref, type: 'director-editor' } }, ...listStoryboardDocuments({ projectId: scope.bookId }).map(document => ({ title: document.source?.title || '分镜视频', resource: { ...ref, type: 'video', id: document.id, versionId: document.currentVersionId } }))] },
      { title: '素材与插画', items: [{ title: '素材与插画工作台', resource: { ...ref, type: 'materials-editor' } }, ...listNarrativeAssets({ projectId: scope.bookId }).map(asset => ({ title: asset.title, resource: { ...ref, type: 'asset', id: asset.id, contentHash: asset.contentHash || '' } }))] })
  } catch { if (!disposed && ticket === sequence) error.value = '制作内容读取失败，正文和资料仍可打开。' }
  finally { if (!disposed && ticket === sequence) loading.value = false }
}
async function open(resource) {
  if (opening.value) return
  opening.value = true
  try {
    if (!await host.openAt(resource, destination.value)) { error.value = host.state.notice || '未能切换内容，请先处理当前文档。'; return }
    menu.value.open = false
    await nextTick()
    document.querySelector(destination.value === 'main' ? '.workspace-main-header .workspace-content-tab.is-active' : '.workspace-reference-group .workspace-content-tab.is-active')?.focus()
  } finally { opening.value = false }
}
function closeMenu(focus = false) { if (menu.value) { menu.value.open = false; if (focus) menu.value.querySelector('summary')?.focus() } }
function quickOpen(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'p' || !host.scope.value.bookId || event.isComposing) return
  if ([...document.querySelectorAll('dialog[open], [aria-modal="true"]')].some(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' && !element.closest('[inert]'))) return
  event.preventDefault()
  destination.value = 'main'; menu.value.open = true; void load()
}
function listKey(event) {
  if (!event.target.matches('input, .workspace-resource-item') || event.isComposing || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return
  const items = [...menu.value.querySelectorAll('.workspace-resource-item')]
  if (!items.length) return
  const index = items.indexOf(document.activeElement)
  if (event.key === 'Enter') { if (index < 0) { event.preventDefault(); items[0].click() }; return }
  event.preventDefault()
  items[index < 0 ? event.key === 'ArrowDown' ? 0 : items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus()
}
function outside(event) { if (menu.value?.open && !menu.value.contains(event.target)) menu.value.open = false }
onMounted(() => { document.addEventListener('pointerdown', outside); document.addEventListener('keydown', quickOpen) })
onBeforeUnmount(() => { disposed = true; sequence += 1; document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', quickOpen) })
</script>

<template>
  <details v-if="host.scope.value.bookId" ref="menu" class="workspace-reference-menu" @toggle="load" @keydown.esc.stop.prevent="closeMenu(true)">
    <summary :title="tr('打开内容（Ctrl+P）')" :aria-label="tr('打开内容')"><WorkbenchIcon name="search" :size="18" /></summary>
    <div class="workspace-reference-menu-body" :aria-label="tr('打开作品内容')" @keydown="listKey">
      <div class="workspace-open-destination" :aria-label="tr('打开位置')"><button type="button" :aria-pressed="destination === 'main'" @click="destination = 'main'">{{ tr('主区') }}</button><button type="button" :aria-pressed="destination === 'side'" @click="destination = 'side'">{{ tr('旁边') }}</button></div>
      <input v-model="search" type="search" :placeholder="tr('搜索章节、资料、人物或制作内容')" :aria-label="tr('搜索章节、资料、人物或制作内容')" />
      <template v-for="group in filteredGroups" :key="group.title"><section v-if="group.items.length"><h2>{{ tr(group.title) }}</h2><button v-for="item in group.items" :key="`${item.resource.type}:${item.resource.id || item.resource.sessionId || ''}`" type="button" class="workspace-resource-item" :disabled="opening" @click="open(item.resource)">{{ item.title }}</button></section></template>
      <p v-if="error" role="status">{{ tr(error) }}</p>
      <p v-if="!loading && !filteredGroups.some(group => group.items.length)" role="status">{{ tr('没有找到匹配的内容') }}</p>
      <p v-if="loading" role="status">{{ tr('加载中…') }}</p>
    </div>
  </details>
</template>

<style scoped>
.workspace-reference-menu { position: relative; flex: none; }
.workspace-reference-menu summary { list-style: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: var(--radius-control); cursor: pointer; color: var(--archive-ink-soft); }
.workspace-reference-menu summary::-webkit-details-marker { display: none; }
.workspace-reference-menu summary:hover { background: var(--nav-hover); }
.workspace-reference-menu-body { position: absolute; inset-block-start: calc(100% + 8px); inset-inline-end: 0; z-index: var(--z-workbench-chrome, 100); width: min(300px, calc(100vw - 32px)); max-height: min(600px, 70dvh); overflow-y: auto; padding: 12px; border: 1px solid var(--hairline-soft); border-radius: var(--radius-control); background: var(--surface-workbench); box-shadow: var(--shadow-workbench-float); }
.workspace-open-destination { display: flex; gap: 4px; margin-bottom: 8px; }
.workspace-open-destination button { width: auto; min-height: 30px; padding: 4px 12px; color: var(--text-secondary); }
.workspace-open-destination button[aria-pressed='true'] { color: var(--text-primary); background: var(--nav-focused); }
.workspace-reference-menu-body section + section { margin-top: 12px; border-top: 1px solid var(--hairline-soft); padding-top: 8px; }
.workspace-reference-menu-body h2 { margin: 0; padding: 4px 8px; color: var(--text-secondary); font: 12px var(--font-sans); }
.workspace-reference-menu-body input { box-sizing: border-box; width: 100%; padding: 8px; border: 1px solid var(--hairline-soft); border-radius: var(--radius-control); color: var(--text-primary); background: var(--surface-workbench-input); font: 13px var(--font-sans); }
.workspace-reference-menu-body button { display: block; width: 100%; min-height: 36px; padding: 8px; border: 0; border-radius: var(--radius-control); color: var(--text-primary); background: transparent; text-align: start; font: 13px/1.5 var(--font-sans); overflow-wrap: anywhere; cursor: pointer; }
.workspace-reference-menu-body button:hover { background: var(--nav-hover); }
.workspace-reference-menu :is(summary, button):focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
@media (max-width: 760px), (pointer: coarse) { .workspace-reference-menu summary { width: 44px; height: 44px; } .workspace-reference-menu-body button { min-height: 44px; } }
@media (max-width: 760px) { .workspace-reference-menu-body { position: fixed; inset-block-start: 56px; inset-inline: 12px; width: auto; max-width: none; } }
</style>
