<script setup>
/**
 * N-B×N-A：资料一级页面（settings/sources）。
 *
 * 数据链：route.query.bookId → useSettingsProjectContext() → 项目绑定世界书。
 * 页面持有完整世界书快照，不读取其他项目的全局 active 状态。
 * 项目模式共用作品导航；无作品的全局模式保留世界书选择。
 * 底层归档/按书绑定/解析/备份全部复用 N-A 已有实现。
 */
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { tr } from '../i18n'
import { useWorldStore } from '../stores/worldStore'
import { useSettingsProjectContext } from '../composables/useSettingsProjectContext'
import WorldbookSourcesPanel from '../components/worldbook/WorldbookSourcesPanel.vue'
const WorldbookSourceImportDialog = defineAsyncComponent(() => import('../components/worldbook/WorldbookSourceImportDialog.vue'))
import SettingsContextBar from '../components/workbench/SettingsContextBar.vue'
import SettingsWorkspaceHeader from '../components/workbench/SettingsWorkspaceHeader.vue'
import SettingsReturnToManuscript from '../components/workbench/SettingsReturnToManuscript.vue'
import WorkspaceProjectNavigation from '../components/workbench/WorkspaceProjectNavigation.vue'
import LocalizationCenter from '../components/settings/LocalizationCenter.vue'
import WorkbenchIcon from '../components/workbench/WorkbenchIcon.vue'
import { loadWritingBooks, subscribeWritingBooks } from '../services/writing/writingBooksRepository.js'
import { STORAGE_KEYS } from '../composables/useStorage.js'

const route = useRoute()
const router = useRouter()
const worldStore = useWorldStore()

const bookId = computed(() => typeof route.query.bookId === 'string' ? route.query.bookId.trim() : '')
const books = ref([])
const importOpen = ref(false)
const projectBook = computed(() => books.value.find(book => String(book.id) === bookId.value) || null)
const worldbooksIndex = computed(() => worldStore.worldbooksIndex)
const { context, worldbook: activeWorldbook, loading: contextLoading, loadError, refresh } = useSettingsProjectContext({ worldStore })
const selectedWorldbookId = computed(() => context.value?.worldbookId || '')
const sourceCount = computed(() => (Array.isArray(activeWorldbook.value?.sourceDocuments) ? activeWorldbook.value.sourceDocuments.length : 0))

const contextLabel = computed(() => projectBook.value?.title || (bookId.value ? tr(projectBook.value ? '未命名作品' : '作品已不存在') : ''))
const navigationRef = ref(null)
const navigationToggleRef = ref(null)
const navigationOpen = ref(false)
const narrowQuery = typeof window !== 'undefined' ? window.matchMedia('(max-width: 900px)') : null
const narrow = ref(Boolean(narrowQuery?.matches))
const navigationOverlay = computed(() => Boolean(bookId.value && narrow.value && navigationOpen.value))

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
function updateViewport(event) {
  const ownsFocus = navigationRef.value?.contains(document.activeElement)
  narrow.value = event.matches
  navigationOpen.value = false
  if (ownsFocus && event.matches) nextTick(() => navigationToggleRef.value?.focus({ preventScroll: true }))
}
async function openNavigation() {
  navigationOpen.value = true
  await nextTick()
  const firstControl = navigationRef.value?.querySelector('select:not(:disabled)') || navigationRef.value?.querySelector('button:not(:disabled)')
  firstControl?.focus({ preventScroll: true })
}
function closeNavigation({ restoreFocus = true } = {}) {
  if (!navigationOpen.value) return
  navigationOpen.value = false
  if (restoreFocus) nextTick(() => {
    if (navigationToggleRef.value?.getClientRects().length) navigationToggleRef.value.focus({ preventScroll: true })
  })
}
function onEscape(event) {
  if (!navigationOverlay.value) return
  event.preventDefault()
  event.stopPropagation()
  closeNavigation()
}
function onSurfaceSelect(surface) { closeNavigation({ restoreFocus: surface === 'sources' }) }

onMounted(() => {
  worldStore.loadWorldbooksIndex()
  narrowQuery?.addEventListener('change', updateViewport)
  window.addEventListener('storage', onStorage)
  window.addEventListener('focus', refreshBooks)
})
onBeforeUnmount(() => {
  unsubscribeBooks()
  narrowQuery?.removeEventListener('change', updateViewport)
  window.removeEventListener('storage', onStorage)
  window.removeEventListener('focus', refreshBooks)
})
watch(bookId, () => { importOpen.value = false; closeNavigation({ restoreFocus: false }) })
// Repository changes can remove this book or change its binding without a route
// change. Hide a removed project's sources and reload a newly accepted binding.
watch(() => [bookId.value, projectBook.value?.id || '', projectBook.value?.worldbookId || ''], (next, previous) => {
  if (next[0] && next[0] === previous[0] && (next[1] !== previous[1] || next[2] !== previous[2])) void refresh()
})

function onWorldbookChange(wbId) {
  if (wbId) {
    void router.push({ name: 'settings-sources', query: { worldbookId: String(wbId) } })
  }
}

function goCreate() {
  importOpen.value = true
}

async function onImportCompleted() {
  importOpen.value = false
  await refresh()
}
watch(() => route.query.import, async value => {
  if (value !== 'add' || !bookId.value) return
  importOpen.value = true
  const query = { ...route.query }; delete query.import
  await router.replace({ name: 'settings-sources', query })
}, { immediate: true })
</script>

<template>
  <div class="settings-page" :class="{ 'is-project': bookId }" data-test="settings-sources" @keydown.esc="onEscape">
    <button v-if="navigationOverlay" type="button" class="settings-sources-navigation-scrim" :aria-label="tr('关闭作品导航')" @click="closeNavigation"></button>
    <aside v-if="bookId" id="sources-workspace-navigation" ref="navigationRef" class="settings-sources-navigation" :class="{ 'is-open': navigationOpen }" :aria-label="tr('作品导航')">
      <WorkspaceProjectNavigation :book-id="bookId" current="sources" @select="onSurfaceSelect" @select-book="closeNavigation">
        <template #actions><button v-if="narrow" type="button" class="settings-sources-navigation-close" :aria-label="tr('关闭作品导航')" :title="tr('关闭作品导航')" @click="closeNavigation"><WorkbenchIcon name="close" :size="18" /></button></template>
      </WorkspaceProjectNavigation>
    </aside>
    <main class="settings-sources-main" :inert="navigationOverlay ? '' : null">
    <div v-if="bookId" class="settings-sources-navigation-toolbar">
      <button ref="navigationToggleRef" type="button" :aria-expanded="navigationOpen" aria-controls="sources-workspace-navigation" :aria-label="tr('打开作品导航')" :title="tr('打开作品导航')" @click="openNavigation"><WorkbenchIcon name="panel-left" :size="19" /><span>{{ tr('作品导航') }}</span></button>
      <strong :title="contextLabel">{{ contextLabel }}</strong>
    </div>
    <SettingsWorkspaceHeader v-if="!bookId">
      <SettingsContextBar
        :model-value="selectedWorldbookId"
        :worldbooks-index="worldbooksIndex"
        :active-worldbook="activeWorldbook"
        :project-label="contextLabel"
        :project-locked="Boolean(bookId)"
        project-identity
        :route-mismatch-notice="context?.notice || ''"
        @change="onWorldbookChange"
      >
        <template #actions>
          <SettingsReturnToManuscript :worldbook-id="selectedWorldbookId || ''" />
        </template>
      </SettingsContextBar>
    </SettingsWorkspaceHeader>

    <header v-if="bookId && projectBook && !contextLoading && !loadError" class="settings-sources-head">
      <div class="settings-sources-heading"><h1>{{ tr("参考资料") }} <span v-if="sourceCount" class="settings-sources-count">{{ sourceCount }}</span></h1><p>{{ tr("收集本书的参考文档，随时查阅原文。") }}</p></div>
      <button type="button" class="control-primary settings-sources-add" data-test="sources-add" @click="goCreate"><WorkbenchIcon name="plus" :size="17" />{{ tr("添加资料") }}</button>
    </header>

    <div v-if="contextLoading" class="settings-sources-loading" role="status">{{ tr("正在加载资料…") }}</div>

    <div v-else-if="(bookId && !projectBook) || context?.status === 'missing-book' || loadError" class="settings-sources-empty" role="alert">
      <p>{{ bookId && !projectBook ? tr("这本书已不存在。") : loadError ? tr(loadError) : tr("这本书已不存在。") }}</p>
      <button type="button" class="control-secondary" @click="refresh">{{ tr("重新加载") }}</button>
    </div>

    <div v-else-if="!bookId" class="settings-sources-empty" role="status">
      <p>{{ tr("请先从首页或写作页打开一本书。") }}</p>
      <button type="button" class="control-primary" @click="router.push({ name: 'settings-knowledge', query: { view: 'settings' } })">{{ tr("回到设定") }}</button>
    </div>

    <div v-else-if="!activeWorldbook" class="settings-sources-empty" role="status">
      <WorkbenchIcon name="sources" :size="32" />
      <h2>{{ tr("还没有参考资料") }}</h2>
      <p>{{ tr("添加文档或文字片段，写作时随时回来查阅。") }}</p>
      <small>{{ tr("支持 TXT、Markdown、PDF、DOCX 与 EPUB") }}</small>
    </div>

    <template v-else>
      <div class="settings-sources-body">
        <WorldbookSourcesPanel :initial-source-id="String(route.query.sourceId || '')"
          :key="`${bookId}:${selectedWorldbookId}`"
          :worldbook="activeWorldbook"
          :book-id="bookId"
          :initial-open="true"
          standalone
          @sources-changed="refresh"
        />
      </div>
    </template>
    <details class="settings-sources-localization" data-test="settings-localization-dock"><summary>{{ tr("本地化中心") }}</summary><LocalizationCenter /></details>
    </main>
    <WorldbookSourceImportDialog v-if="importOpen && bookId" :key="bookId" :book-id="bookId" @close="importOpen = false" @completed="onImportCompleted" />
  </div>
</template>

<style scoped>

.settings-page { position: relative; display: flex; flex: 1; min-width: 0; min-height: 0; overflow: hidden; background: var(--surface-workbench); font-family: var(--font-sans); }
.settings-sources-main { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.settings-sources-navigation { flex: 0 0 248px; min-width: 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; border-inline-end: 1px solid var(--hairline-soft); background: var(--nav-surface, var(--surface-workbench-muted)); }
.settings-sources-navigation-toolbar { display: none; }
.settings-sources-navigation-close { display: grid; flex: none; width: 44px; min-height: 44px; place-items: center; padding: 0; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-secondary); cursor: pointer; }
.settings-sources-navigation-close:hover { background: var(--nav-hover); color: var(--text-primary); }
.settings-sources-navigation-close:focus-visible, .settings-sources-navigation-toolbar button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.settings-sources-navigation-scrim { position: absolute; z-index: 3; inset: 0; padding: 0; border: 0; background: var(--surface-overlay); cursor: pointer; }

.settings-sources-loading, .settings-sources-empty { display: grid; justify-items: center; gap: 16px; padding: 80px 24px; color: var(--text-secondary); font-size: 14px; text-align: center; }
.settings-sources-empty :is(h1, h2) { margin: 0; font-size: 24px; color: var(--text-primary); }
.settings-sources-empty p { margin: 0; line-height: 1.8; }
.settings-sources-head { border-bottom: 1px solid var(--hairline-soft); display: flex; flex: none; align-items: center; justify-content: space-between; gap: 24px; padding: 32px clamp(20px, 3vw, 48px) 24px; background: var(--surface-workbench); }
.settings-sources-heading h1 { font-family: var(--font-sans); display: flex; align-items: center; gap: 12px; margin: 0; font-size: 24px; font-weight: 500; color: var(--text-primary); letter-spacing: normal; }
.settings-sources-heading { min-width: 0; }
.settings-sources-heading p { margin: 10px 0 0; font-size: 14px; color: var(--text-secondary); line-height: 1.7; overflow-wrap: anywhere; }
.settings-sources-count { font-size: 14px; font-weight: 400; color: var(--text-secondary); letter-spacing: 0; }
.settings-sources-add { display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0; }
.settings-sources-body { flex: 1; min-width: 0; padding: 0 clamp(20px, 3vw, 48px) 32px; background: var(--surface-workbench); }
.settings-sources-empty .control-primary { display: inline-flex; align-items: center; gap: 7px; }
@media (max-width: 900px) {
  .settings-sources-navigation { position: absolute; z-index: 4; inset: 0 auto 0 0; width: min(280px, 86%); box-sizing: border-box; display: none; border-inline-end: 1px solid var(--hairline-soft); box-shadow: var(--shadow-workbench-float); }
  .settings-sources-navigation.is-open { display: block; }
  .settings-sources-navigation-toolbar { display: flex; flex: none; min-width: 0; align-items: center; gap: 12px; min-height: 52px; padding: 4px 12px; border-bottom: 1px solid var(--hairline-soft); }
  .settings-sources-navigation-toolbar button { display: inline-flex; flex: none; min-height: 44px; align-items: center; gap: 7px; padding: 6px 10px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-secondary); font: 13px/1.5 var(--font-sans); cursor: pointer; }
  .settings-sources-navigation-toolbar button:hover { background: var(--nav-hover); }
  .settings-sources-navigation-toolbar strong { min-width: 0; overflow: hidden; color: var(--text-primary); font: 500 14px/1.5 var(--font-sans); text-overflow: ellipsis; white-space: nowrap; }
}
@media (max-width: 760px) {
  .settings-sources-head { padding: 24px 20px 22px; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
  .settings-sources-heading h1 { font-size: 22px; }
  .settings-sources-heading p { font-size: 13px; }
}

</style>
.settings-sources-localization > summary { padding: 14px clamp(20px, 3vw, 48px); font-size: 13px; font-weight: 500; color: var(--text-secondary); cursor: pointer; border-top: 1px solid var(--hairline-soft, var(--border)); background: var(--surface-workbench); }
.settings-sources-localization > summary:hover { color: var(--text-primary); }
.settings-sources-localization[open] > summary { color: var(--text-primary); }
@media (max-width: 760px) { .settings-sources-head { padding: 24px 20px 22px; gap: 14px; align-items: flex-start; border-radius: 0; } .settings-sources-heading h1 { font-size: 22px; } .settings-sources-heading p { font-size: 13px; max-width: 24ch; } }

<style scoped>
.settings-sources-head { padding: 32px clamp(24px, 4vw, 64px) 24px; }
.settings-sources-body { padding: 24px clamp(24px, 4vw, 64px) 40px; }
.settings-sources-empty { flex: 1; align-content: center; padding: 56px 24px 18vh; }
.settings-sources-empty :is(h1, h2) { font: 500 22px/1.4 var(--font-sans); }
.settings-sources-empty small { color: var(--text-muted); font-size: 13px; }
@media (max-width: 760px) { .settings-sources-head { padding: 24px 16px 20px; gap: 12px; } .settings-sources-heading h1 { font-size: 22px; } .settings-sources-body { padding: 20px 16px; } .settings-sources-empty { padding: 48px 20px 12vh; } }
</style>
