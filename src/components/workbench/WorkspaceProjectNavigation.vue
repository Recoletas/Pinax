<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { isNavigationFailure, useRouter } from 'vue-router'
import { tr, uiLocale } from '../../i18n/index.js'
import { STORAGE_KEYS } from '../../composables/useStorage.js'
import { loadWritingBooks, subscribeWritingBooks } from '../../services/writing/writingBooksRepository.js'
import { useWorkspaceTabsStore } from '../../stores/workspaceTabsStore.js'
import WorkbenchIcon from './WorkbenchIcon.vue'

const props = defineProps({
  bookId: { type: String, default: '' },
  current: { type: String, default: 'writing' },
  documentTitle: { type: String, default: '' },
  navigation: { type: Boolean, default: true },
  managed: { type: Boolean, default: false },
  blocked: Boolean,
  blockedTitle: { type: String, default: '' }
})
const emit = defineEmits(['select', 'select-book'])
const router = useRouter()
const workspaceTabs = useWorkspaceTabsStore()
const books = ref([])
const navigating = ref(false)
const navigationError = ref('')
let navigationSequence = 0

const currentSurface = computed(() => props.current === 'authoring' ? 'writing' : props.current)
const writingLabel = computed(() => tr(uiLocale.value === 'en' ? '写作' : '正文'))
const selectedBookId = computed(() => String(props.bookId || '').trim())
const selectedBook = computed(() => books.value.find(book => String(book.id) === selectedBookId.value) || null)
const bookLabel = computed(() => selectedBook.value?.title || tr('未命名作品'))
const missingBook = computed(() => Boolean(selectedBookId.value && !selectedBook.value))
const moreMenuRef = ref(null)
const moreTriggerRef = ref(null)
const moreOpen = ref(false)

const routes = Object.freeze({
  writing: 'authoring', assistant: 'authoring', settings: 'settings-structured',
  sources: 'settings-sources', documents: 'settings-documents', materials: 'materials', map: 'settings-world-map',
  comics: 'comics', canvas: 'prose-essay'
})
const mainSurfaces = Object.freeze([
  { key: 'writing', label: '正文', icon: 'writing' },
  { key: 'assistant', label: '助手', icon: 'message-square' },
  { key: 'settings', label: '设定', icon: 'worldbook' },
  { key: 'sources', label: '资料', icon: 'sources' }
])
const extraSurfaces = Object.freeze([
  { key: 'documents', label: '文档', icon: 'document' },
  { key: 'materials', label: '灵感', icon: 'compass' },
  { key: 'map', label: '地图', icon: 'map' },
  { key: 'comics', label: '漫画', icon: 'comics' },
  { key: 'canvas', label: '视频', icon: 'film' }
])
const currentExtra = computed(() => extraSurfaces.find(surface => surface.key === currentSurface.value))
function closeMore(restoreFocus = false) {
  if (!moreMenuRef.value?.open) return
  moreMenuRef.value.open = false
  moreOpen.value = false
  if (restoreFocus) moreTriggerRef.value?.focus()
}
function onOutsidePointer(event) {
  if (moreMenuRef.value?.open && !moreMenuRef.value.contains(event.target)) closeMore()
}

function refreshBooks(payload) {
  const source = Array.isArray(payload?.books) ? payload.books : loadWritingBooks()
  const previous = new Map(books.value.map(book => [book.id, book]))
  const next = source.flatMap(raw => {
    const id = String(raw?.id ?? '').trim()
    if (!id) return []
    const title = String(raw.title ?? raw.name ?? '').trim()
    const worldbookId = String(raw.worldbookId ?? '').trim()
    const book = previous.get(id)
    return [book && book.title === title && book.worldbookId === worldbookId ? book : { id, title, worldbookId }]
  })
  if (next.length !== books.value.length || next.some((book, index) => book !== books.value[index])) books.value = next
}
refreshBooks()
function onStorage(event) {
  if (event.key === STORAGE_KEYS.WRITING_BOOKS || event.key === null) refreshBooks()
}
const unsubscribeBooks = subscribeWritingBooks(refreshBooks)
onMounted(() => {
  window.addEventListener('storage', onStorage)
  window.addEventListener('focus', refreshBooks)
  document.addEventListener('pointerdown', onOutsidePointer)
})
onBeforeUnmount(() => {
  navigationSequence += 1
  unsubscribeBooks()
  window.removeEventListener('storage', onStorage)
  window.removeEventListener('focus', refreshBooks)
  document.removeEventListener('pointerdown', onOutsidePointer)
})

function isDisabled(surface) {
  if (surface !== 'home' && !selectedBook.value) return true
  return surface !== currentSurface.value && (props.blocked || navigating.value)
}
function surfaceTitle(surface, label) {
  if (surface !== currentSurface.value && props.blocked) return tr(props.blockedTitle || '请先完成当前操作')
  if (surface !== 'home' && !selectedBook.value) return tr(missingBook.value ? '这本书已不存在。' : '请先选择作品')
  return surface === 'writing' && props.documentTitle ? `${tr(label)} · ${props.documentTitle}` : tr(label)
}
function surfaceRoute(surface, book) {
  if (surface === 'home') return { name: 'welcome', query: {} }
  const name = routes[surface]
  if (!name || !book) return null
  // Scope comes from this selector. Object locators from the previous surface/book
  // are never copied; each destination keeps its own accepted object state.
  const query = { bookId: String(book.id) }
  if (name === 'authoring') {
    const storedRoute = workspaceTabs.tabs.find(tab => tab.key === `project:${book.id}:authoring`)?.route
    const currentRoute = router.currentRoute.value
    const source = currentRoute.name === 'authoring' && String(currentRoute.query.bookId || '') === String(book.id)
      ? currentRoute : storedRoute
    if (source?.name === 'authoring' && String(source.query?.bookId || '') === String(book.id)) {
      const manuscript = loadWritingBooks().find(item => String(item.id) === String(book.id))
      const chapterId = source.query.chapterId
      const explorationId = source.query.explorationId
      if (typeof chapterId === 'string' && manuscript?.chapters?.some(item => String(item.id) === chapterId)) query.chapterId = chapterId
      if (typeof explorationId === 'string' && manuscript?.explorationDocuments?.some(item => String(item.id) === explorationId)) query.explorationId = explorationId
    }
  }
  if (surface === 'assistant') query.view = 'assistant'
  if (['settings', 'sources', 'map'].includes(surface) && book.worldbookId) {
    query.worldbookId = String(book.worldbookId)
  }
  return { name, query }
}
async function navigate(target) {
  if (!target) return
  const sequence = ++navigationSequence
  navigating.value = true
  navigationError.value = ''
  try {
    const failure = await router.push(target)
    // A route guard can reject a switch without throwing. Props still describe
    // the accepted book/surface, so no local selection is committed on failure.
    if (isNavigationFailure(failure)) return false
    return true
  } catch {
    if (sequence === navigationSequence) navigationError.value = '暂时无法打开，请重试。'
    return false
  } finally {
    if (sequence === navigationSequence) navigating.value = false
  }
}
function selectSurface(surface) {
  if (isDisabled(surface)) return
  closeMore(surface === currentSurface.value)
  emit('select', surface)
  if (props.managed || surface === currentSurface.value) return
  void navigate(surfaceRoute(surface, selectedBook.value))
}
async function selectBook(event) {
  const requested = String(event.target.value || '')
  refreshBooks()
  const book = books.value.find(item => String(item.id) === requested)
  if (props.blocked || navigating.value || !book || requested === selectedBookId.value) {
    event.target.value = selectedBookId.value
    return
  }
  closeMore()
  emit('select-book', requested)
  if (!props.managed && currentSurface.value !== 'home') {
    const surface = routes[currentSurface.value] ? currentSurface.value : 'writing'
    await navigate(surfaceRoute(surface, book))
  }
  // A managed host may reject the switch after a save guard. The select follows
  // its accepted bookId, never the browser's optimistic option selection.
  event.target.value = selectedBookId.value
}

watch(() => props.bookId, () => {
  navigationSequence += 1
  navigating.value = false
  navigationError.value = ''
  refreshBooks()
})
watch(currentSurface, () => closeMore())
</script>

<template>
  <section class="workspace-project-nav" :class="{ 'is-book-header': !navigation }" data-test="workspace-project-navigation" :data-book-id="selectedBookId">
    <header class="workspace-project-nav__header">
      <div class="workspace-project-nav__book">
        <WorkbenchIcon name="book" :size="17" />
        <select :value="selectedBookId" :disabled="blocked || navigating || !books.length" :aria-label="tr('切换作品')" :title="blocked ? tr(blockedTitle || '请先完成当前操作') : selectedBook ? bookLabel : tr(missingBook ? '这本书已不存在。' : '选择作品')" data-test="workspace-project-book-select" @focus="refreshBooks" @change="selectBook">
          <option v-if="!selectedBook" :value="selectedBookId" disabled>{{ tr(missingBook ? '作品已不存在' : books.length ? '选择作品' : '还没有作品') }}</option>
          <option v-for="book in books" :key="book.id" :value="String(book.id)">{{ book.title || tr('未命名作品') }}</option>
        </select>
      </div>
      <div v-if="$slots.actions" class="workspace-project-nav__actions"><slot name="actions" /></div>
    </header>
    <nav v-if="navigation" :aria-label="tr('作品导航')">
      <button v-for="surface in mainSurfaces" :key="surface.key" type="button" :data-project-surface="surface.key" :class="{ 'is-current': currentSurface === surface.key }" :aria-current="currentSurface === surface.key ? 'page' : null" :disabled="isDisabled(surface.key)" :title="surfaceTitle(surface.key, surface.label)" @click="selectSurface(surface.key)">
        <WorkbenchIcon :name="surface.icon" :size="17" /><span>{{ surface.key === 'writing' ? writingLabel : tr(surface.label) }}</span>
      </button>
      <details ref="moreMenuRef" class="workspace-project-nav__more" @toggle="moreOpen = $event.target.open" @keydown.esc.stop.prevent="closeMore(true)">
        <summary ref="moreTriggerRef" :class="{ 'is-current': currentExtra }" :aria-expanded="moreOpen" :aria-label="tr('更多作品工具')" :title="tr('灵感、地图、漫画与视频')"><WorkbenchIcon :name="currentExtra?.icon || 'more'" :size="17" /><span>{{ tr(currentExtra?.label || '更多工具') }}</span><WorkbenchIcon name="chevron-down" :size="13" /></summary>
        <div class="workspace-project-nav__more-list">
          <button v-for="surface in extraSurfaces" :key="surface.key" type="button" :data-project-surface="surface.key" :class="{ 'is-current': currentSurface === surface.key }" :aria-current="currentSurface === surface.key ? 'page' : null" :disabled="isDisabled(surface.key)" :title="surfaceTitle(surface.key, surface.label)" @click="selectSurface(surface.key)"><WorkbenchIcon :name="surface.icon" :size="17" /><span>{{ tr(surface.label) }}</span></button>
        </div>
      </details>
    </nav>
    <p v-if="missingBook" class="workspace-project-nav__status" role="status">{{ tr('这本书已不存在。') }}</p>
    <p v-else-if="!books.length" class="workspace-project-nav__status" role="status">{{ tr('还没有作品') }}</p>
    <p v-if="navigationError" class="workspace-project-nav__status" role="alert">{{ tr(navigationError) }}</p>
  </section>
</template>

<style scoped>
.workspace-project-nav { flex: none; min-width: 0; width: 100%; box-sizing: border-box; padding: 4px 0 12px; color: var(--nav-fg, var(--text-secondary)); font-family: var(--font-sans); }
.workspace-project-nav.is-book-header { padding-bottom: 0; }
.workspace-project-nav.is-book-header .workspace-project-nav__header { margin-bottom: 0; }
.workspace-project-nav__header { display: flex; min-width: 0; align-items: center; gap: 2px; margin: 0 12px 6px; }
.workspace-project-nav__book { display: flex; flex: 1; min-width: 0; align-items: center; gap: 4px; padding-inline-start: 10px; }
.workspace-project-nav__book > svg { flex: none; }
.workspace-project-nav__book select { box-sizing: border-box; flex: 1; min-width: 0; width: 100%; min-height: 36px; padding: 7px 16px 7px 5px; overflow: hidden; border: 0; border-radius: 0; background: transparent; color: var(--text-primary); font: 500 14px/1.4 var(--font-sans); text-overflow: ellipsis; cursor: pointer; }
.workspace-project-nav__actions { display: flex; flex: none; align-items: center; }
.workspace-project-nav__actions :slotted(button) { display: grid; place-items: center; flex: none; box-sizing: border-box; width: 32px; min-width: 32px; height: 36px; padding: 0; border: 0; border-radius: 0; background: transparent; color: var(--text-secondary); font: inherit; cursor: pointer; }
.workspace-project-nav nav { display: grid; min-width: 0; gap: 0; }
.workspace-project-nav button, .workspace-project-nav summary { display: flex; box-sizing: border-box; width: 100%; min-width: 0; min-height: 36px; align-items: center; gap: 10px; padding: 7px 22px; border: 0; border-radius: 0; background: transparent; color: var(--nav-fg, var(--text-secondary)); font: 14px/1.45 var(--font-sans); text-align: start; cursor: pointer; list-style: none; transition: background-color 120ms ease, color 120ms ease; }
.workspace-project-nav summary::-webkit-details-marker { display: none; }
.workspace-project-nav button > svg, .workspace-project-nav summary > svg { flex: none; }
.workspace-project-nav button > span, .workspace-project-nav summary > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.workspace-project-nav summary > span { flex: 1; }
.workspace-project-nav button:hover:not(:disabled), .workspace-project-nav summary:hover, .workspace-project-nav__book select:hover:not(:disabled), .workspace-project-nav__actions :slotted(button):hover:not(:disabled) { background: var(--nav-hover, var(--surface-workbench-muted)); color: var(--text-primary); }
.workspace-project-nav :is(button, summary).is-current { background: transparent; color: var(--text-primary); font-weight: 600; }
.workspace-project-nav :is(button, summary).is-current > svg:first-child { color: var(--accent); }
.workspace-project-nav button:disabled, .workspace-project-nav__book select:disabled, .workspace-project-nav__actions :slotted(button):disabled { opacity: .5; cursor: default; }
.workspace-project-nav :is(button, summary):focus-visible, .workspace-project-nav__book select:focus-visible, .workspace-project-nav__actions :slotted(button):focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.workspace-project-nav__more { position: relative; min-width: 0; }
.workspace-project-nav__more-list { position: absolute; z-index: 45; inset-inline: 12px; top: calc(100% + 2px); padding: 4px 0; border: 1px solid var(--hairline-soft); border-radius: 0; background: var(--surface-workbench-raised); box-shadow: var(--shadow-workbench-float); }
.workspace-project-nav__more-list button { padding-inline: 12px; }
.workspace-project-nav__status { margin: 8px 22px 0; color: var(--text-secondary); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
@media (max-height: 620px) {
  .workspace-project-nav__more-list { top: auto; bottom: calc(100% + 2px); }
}
@media (max-width: 760px), (pointer: coarse) {
  .workspace-project-nav button, .workspace-project-nav summary, .workspace-project-nav__book select { min-height: 44px; }
  .workspace-project-nav__actions :slotted(button) { width: 44px; min-width: 44px; height: 44px; min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  .workspace-project-nav button, .workspace-project-nav summary { transition: none; }
}
</style>
